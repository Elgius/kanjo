import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { BillStatus, PaymentMethod } from "@/generated/prisma/enums";
import { auditCreateData, type AuditRequestContext } from "@/lib/audit-core";
import {
  describeBillChanges,
  eventChanges,
  itemsJson,
  makeBillSnapshot,
  parseBillSnapshot,
  snapshotJson,
  type BillSnapshot,
} from "@/lib/pos/bill-revisions";
import { PosError, prepareSaleInventory } from "@/lib/pos/sales";

export type PrintedBillInput = {
  shiftId: string;
  actorId: string;
  actorName: string;
  heldOrderId?: string | null;
  billId?: string | null;
  expectedVersion?: number | null;
  restaurantTableId?: string | null;
  customerNote?: string | null;
  paymentMethod: PaymentMethod;
  items: ReadonlyArray<{ itemId: string; quantity: number }>;
  audit: { actorLabel: string; request?: AuditRequestContext };
};

type Transaction = Prisma.TransactionClient;

async function resolveTable(
  tx: Transaction,
  registerId: string,
  tableId: string | null | undefined,
  orderId: string | null | undefined,
) {
  if (!tableId) return null;
  const table = await tx.restaurantTable.findFirst({
    where: { id: tableId, registerId, active: true },
    select: {
      id: true,
      name: true,
      orders: {
        where: { status: "HELD", ...(orderId ? { id: { not: orderId } } : {}) },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!table) throw new PosError("Select an active table from this restaurant.");
  if (table.orders.length) throw new PosError(`${table.name} already has an open bill.`);
  return { id: table.id, name: table.name };
}

function orderLines(snapshot: BillSnapshot) {
  return snapshot.items.map((item) => ({
    ...(item.productId ? { productId: item.productId } : {}),
    ...(item.menuItemId ? { menuItemId: item.menuItemId } : {}),
    productName: item.productName,
    productSku: item.productSku,
    itemCategory: item.itemCategory,
    quantity: item.quantity,
    unitPriceLaari: item.unitPriceLaari,
    lineTotalLaari: item.lineTotalLaari,
  }));
}

async function replaceOrderSnapshot(tx: Transaction, orderId: string, snapshot: BillSnapshot) {
  await tx.registerOrderItem.deleteMany({ where: { orderId } });
  await tx.registerOrder.update({
    where: { id: orderId },
    data: {
      customerNote: snapshot.customerNote,
      paymentMethod: snapshot.paymentMethod,
      restaurantTableId: snapshot.restaurantTableId,
      subtotalLaari: snapshot.subtotalLaari,
      totalLaari: snapshot.totalLaari,
      items: { create: orderLines(snapshot) },
    },
  });
}

function snapshotFromBill(bill: {
  items: Prisma.JsonValue;
  subtotalLaari: number;
  totalLaari: number;
  paymentMethod: PaymentMethod;
  customerNote: string | null;
  restaurantTableId: string | null;
  restaurantTableName: string | null;
}) {
  return parseBillSnapshot({
    items: bill.items,
    subtotalLaari: bill.subtotalLaari,
    totalLaari: bill.totalLaari,
    paymentMethod: bill.paymentMethod,
    customerNote: bill.customerNote,
    restaurantTableId: bill.restaurantTableId,
    restaurantTableName: bill.restaurantTableName,
  } as unknown as Prisma.JsonValue);
}

async function appendRevision(
  tx: Transaction,
  billId: string,
  revision: number,
  kind: "INITIAL_PRINT" | "REPRINT" | "AMENDMENT",
  actorId: string,
  actorName: string,
  snapshot: BillSnapshot,
  changes: string[],
) {
  await tx.billRevision.create({
    data: {
      billId,
      revision,
      kind,
      actorId,
      actorName,
      changes: eventChanges(kind, snapshot, changes),
      snapshot: snapshotJson(snapshot),
    },
  });
}

async function updateTrackedBill(
  tx: Transaction,
  bill: {
    id: string;
    version: number;
    status: BillStatus;
    items: Prisma.JsonValue;
    subtotalLaari: number;
    totalLaari: number;
    paymentMethod: PaymentMethod;
    customerNote: string | null;
    restaurantTableId: string | null;
    restaurantTableName: string | null;
  },
  orderId: string,
  expectedVersion: number | null | undefined,
  snapshot: BillSnapshot,
  actor: { id: string; name: string },
  reprint: boolean,
) {
  if (bill.status !== "UNPAID") throw new PosError("That bill is no longer unpaid.");
  if (expectedVersion !== null && expectedVersion !== undefined && expectedVersion !== bill.version) {
    throw new PosError("That bill changed elsewhere. Reload it before making more changes.");
  }
  const before = snapshotFromBill(bill);
  if (!before) throw new PosError("That bill has invalid snapshot data.");
  const changes = describeBillChanges(before, snapshot);
  let version = bill.version;
  if (changes.length) {
    version += 1;
    await replaceOrderSnapshot(tx, orderId, snapshot);
    await tx.bill.update({
      where: { id: bill.id },
      data: {
        paymentMethod: snapshot.paymentMethod,
        subtotalLaari: snapshot.subtotalLaari,
        totalLaari: snapshot.totalLaari,
        items: itemsJson(snapshot),
        customerNote: snapshot.customerNote,
        restaurantTableId: snapshot.restaurantTableId,
        restaurantTableName: snapshot.restaurantTableName,
        version,
      },
    });
    await appendRevision(tx, bill.id, version, "AMENDMENT", actor.id, actor.name, snapshot, changes);
  }
  if (reprint) {
    version += 1;
    await tx.bill.update({ where: { id: bill.id }, data: { version } });
    await appendRevision(tx, bill.id, version, "REPRINT", actor.id, actor.name, snapshot, []);
  }
  return version;
}

export async function trackPrintedBill(db: PrismaClient, input: PrintedBillInput) {
  return db.$transaction(async (tx) => {
    const shift = await tx.registerShift.findFirst({
      where: { id: input.shiftId, status: "OPEN" },
      select: {
        id: true,
        registerId: true,
        register: { select: { purpose: true, name: true, code: true } },
      },
    });
    if (!shift) throw new PosError("The selected register does not have an open shift.");
    const [{ lines }, table] = await Promise.all([
      prepareSaleInventory(tx, shift, input.items),
      resolveTable(tx, shift.registerId, input.restaurantTableId, input.heldOrderId),
    ]);
    const snapshot = makeBillSnapshot(lines, input.paymentMethod, input.customerNote ?? null, table);

    let orderId = input.heldOrderId ?? null;
    if (orderId) {
      const order = await tx.registerOrder.findFirst({
        where: { id: orderId, registerShiftId: shift.id, status: "HELD" },
        select: { id: true },
      });
      if (!order) throw new PosError("That held order is no longer available.");
    } else {
      const order = await tx.registerOrder.create({
        data: {
          registerShiftId: shift.id,
          createdById: input.actorId,
          customerNote: snapshot.customerNote,
          paymentMethod: snapshot.paymentMethod,
          restaurantTableId: snapshot.restaurantTableId,
          subtotalLaari: snapshot.subtotalLaari,
          totalLaari: snapshot.totalLaari,
          items: { create: orderLines(snapshot) },
        },
        select: { id: true },
      });
      orderId = order.id;
    }

    const existing = input.billId
      ? await tx.bill.findFirst({ where: { id: input.billId, orderId }, select: {
          id: true, version: true, status: true, items: true, subtotalLaari: true, totalLaari: true,
          paymentMethod: true, customerNote: true, restaurantTableId: true, restaurantTableName: true,
          billNumber: true,
        } })
      : await tx.bill.findUnique({ where: { orderId }, select: {
          id: true, version: true, status: true, items: true, subtotalLaari: true, totalLaari: true,
          paymentMethod: true, customerNote: true, restaurantTableId: true, restaurantTableName: true,
          billNumber: true,
        } });

    let bill: { id: string; billNumber: bigint; version: number };
    if (existing) {
      const version = await updateTrackedBill(
        tx,
        existing,
        orderId,
        input.expectedVersion,
        snapshot,
        { id: input.actorId, name: input.actorName },
        true,
      );
      bill = { id: existing.id, billNumber: existing.billNumber, version };
    } else {
      await replaceOrderSnapshot(tx, orderId, snapshot);
      const created = await tx.bill.create({
        data: {
          orderId,
          registerShiftId: shift.id,
          status: "UNPAID",
          registerId: shift.registerId,
          registerName: shift.register.name,
          registerCode: shift.register.code,
          cashierName: input.actorName,
          openedById: input.actorId,
          openedByName: input.actorName,
          paymentMethod: snapshot.paymentMethod,
          subtotalLaari: snapshot.subtotalLaari,
          totalLaari: snapshot.totalLaari,
          items: itemsJson(snapshot),
          customerNote: snapshot.customerNote,
          restaurantTableId: snapshot.restaurantTableId,
          restaurantTableName: snapshot.restaurantTableName,
          revisions: {
            create: {
              revision: 1,
              kind: "INITIAL_PRINT",
              actorId: input.actorId,
              actorName: input.actorName,
              changes: eventChanges("INITIAL_PRINT", snapshot),
              snapshot: snapshotJson(snapshot),
            },
          },
        },
        select: { id: true, billNumber: true, version: true },
      });
      bill = created;
    }

    await tx.auditLog.create({
      data: auditCreateData({
        outcome: "SUCCESS",
        event: existing ? "BILL_REPRINT" : "BILL_TRACK_START",
        page: "REGISTERS",
        actorId: input.actorId,
        actorLabel: input.audit.actorLabel,
        targetType: "bill",
        targetId: bill.id,
        summary: existing ? "Unpaid bill reprinted." : "Unpaid bill tracking started.",
        metadata: { registerId: shift.registerId, shiftId: shift.id, orderId, billNumber: bill.billNumber },
        request: input.audit.request,
      }),
    });

    return {
      id: bill.id,
      billNumber: bill.billNumber.toString(),
      orderId,
      version: bill.version,
      snapshot,
    };
  }, { isolationLevel: "Serializable" });
}

export async function amendPrintedBill(db: PrismaClient, input: PrintedBillInput & { billId: string; heldOrderId: string; expectedVersion: number }) {
  return db.$transaction(async (tx) => {
    const shift = await tx.registerShift.findFirst({
      where: { id: input.shiftId, status: "OPEN" },
      select: { id: true, registerId: true, register: { select: { purpose: true } } },
    });
    if (!shift) throw new PosError("The selected register does not have an open shift.");
    const [bill, order, prepared, table] = await Promise.all([
      tx.bill.findFirst({ where: { id: input.billId, orderId: input.heldOrderId, registerShiftId: shift.id }, select: {
        id: true, version: true, status: true, items: true, subtotalLaari: true, totalLaari: true,
        paymentMethod: true, customerNote: true, restaurantTableId: true, restaurantTableName: true,
      } }),
      tx.registerOrder.findFirst({ where: { id: input.heldOrderId, registerShiftId: shift.id, status: "HELD" }, select: { id: true } }),
      prepareSaleInventory(tx, shift, input.items),
      resolveTable(tx, shift.registerId, input.restaurantTableId, input.heldOrderId),
    ]);
    if (!bill || !order) throw new PosError("That tracked unpaid bill is no longer available.");
    const snapshot = makeBillSnapshot(prepared.lines, input.paymentMethod, input.customerNote ?? null, table);
    const version = await updateTrackedBill(
      tx,
      bill,
      order.id,
      input.expectedVersion,
      snapshot,
      { id: input.actorId, name: input.actorName },
      false,
    );
    return { id: bill.id, version, snapshot };
  }, { isolationLevel: "Serializable" });
}
