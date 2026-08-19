import type { PrismaClient } from "@/generated/prisma/client";
import { auditCreateData, type AuditRequestContext } from "@/lib/audit-core";
import { describeBillChanges, itemsJson, makeBillSnapshot, parseBillSnapshot, snapshotJson } from "@/lib/pos/bill-revisions";
import { PosError } from "@/lib/pos/sales";

type HeldOrderItem = { itemId: string; quantity: number };

export type HoldRegisterOrderInput = {
  shiftId: string;
  createdById: string;
  actorName?: string;
  heldOrderId?: string | null;
  restaurantTableId?: string | null;
  customerNote?: string | null;
  paymentMethod?: "CASH" | "CARD" | "MOBILE";
  items: ReadonlyArray<HeldOrderItem>;
  audit: { actorLabel: string; request?: AuditRequestContext };
};

function combineItems(items: HoldRegisterOrderInput["items"]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!item.itemId || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new PosError("Order quantities must be positive whole numbers.");
    }
    quantities.set(item.itemId, (quantities.get(item.itemId) ?? 0) + item.quantity);
  }
  if (!quantities.size) throw new PosError("Add at least one item before holding the order.");
  return [...quantities].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export async function holdRegisterOrder(db: PrismaClient, input: HoldRegisterOrderInput) {
  const items = combineItems(input.items);

  return db.$transaction(async (tx) => {
    const shift = await tx.registerShift.findFirst({
      where: { id: input.shiftId, status: "OPEN" },
      select: { id: true, registerId: true, register: { select: { purpose: true } } },
    });
    if (!shift) throw new PosError("The selected register does not have an open shift.");

    let restaurantTableId: string | null = null;
    let restaurantTable: { id: string; name: string } | null = null;
    if (shift.register.purpose === "RESTAURANT") {
      if (!input.restaurantTableId) {
        throw new PosError("Select a restaurant table before holding this bill.");
      }
      const table = await tx.restaurantTable.findFirst({
        where: {
          id: input.restaurantTableId,
          registerId: shift.registerId,
          active: true,
        },
        select: {
          id: true,
          name: true,
          orders: {
            where: {
              status: "HELD",
              ...(input.heldOrderId ? { id: { not: input.heldOrderId } } : {}),
            },
            take: 1,
            select: { id: true },
          },
        },
      });
      if (!table) throw new PosError("Select an active table from this restaurant.");
      if (table.orders.length) throw new PosError(`${table.name} already has an open bill.`);
      restaurantTableId = table.id;
      restaurantTable = { id: table.id, name: table.name };
    }

    let lines: Array<{
      productId?: string;
      menuItemId?: string;
      productName: string;
      productSku: string | null;
      itemCategory: string;
      quantity: number;
      unitPriceLaari: number;
      lineTotalLaari: number;
    }>;

    if (shift.register.purpose === "SHOP") {
      const products = await tx.product.findMany({
        where: {
          id: { in: items.map((item) => item.itemId) },
          registerId: shift.registerId,
          active: true,
        },
      });
      if (products.length !== items.length) {
        throw new PosError("One or more products are unavailable at this register.");
      }
      const byId = new Map(products.map((product) => [product.id, product]));
      lines = items.map((item) => {
        const product = byId.get(item.itemId)!;
        return {
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          itemCategory: product.category,
          quantity: item.quantity,
          unitPriceLaari: product.retailPriceLaari,
          lineTotalLaari: product.retailPriceLaari * item.quantity,
        };
      });
    } else {
      const itemIds = items.map((item) => item.itemId);
      const [menuItems, standaloneProducts] = await Promise.all([
        tx.menuItem.findMany({
          where: {
            id: { in: itemIds },
            registerId: shift.registerId,
            active: true,
          },
        }),
        tx.product.findMany({
          where: {
            id: { in: itemIds },
            registerId: shift.registerId,
            active: true,
            menuIngredients: { some: { standalone: true } },
          },
        }),
      ]);
      if (menuItems.length + standaloneProducts.length !== items.length) {
        throw new PosError("One or more menu items are unavailable at this register.");
      }
      const byId = new Map(menuItems.map((item) => [item.id, item]));
      const productsById = new Map(standaloneProducts.map((product) => [product.id, product]));
      lines = items.map((item) => {
        const menuItem = byId.get(item.itemId);
        if (!menuItem) {
          const product = productsById.get(item.itemId)!;
          return {
            productId: product.id,
            productName: product.name,
            productSku: product.sku,
            itemCategory: product.category,
            quantity: item.quantity,
            unitPriceLaari: product.retailPriceLaari,
            lineTotalLaari: product.retailPriceLaari * item.quantity,
          };
        }
        return {
          menuItemId: menuItem.id,
          productName: menuItem.name,
          productSku: null,
          itemCategory: menuItem.category,
          quantity: item.quantity,
          unitPriceLaari: menuItem.retailPriceLaari,
          lineTotalLaari: menuItem.retailPriceLaari * item.quantity,
        };
      });
    }

    const totalLaari = lines.reduce((total, line) => total + line.lineTotalLaari, 0);
    const data = {
      createdById: input.createdById,
      customerNote: input.customerNote?.trim().slice(0, 500) || null,
      paymentMethod: input.paymentMethod,
      restaurantTableId,
      subtotalLaari: totalLaari,
      totalLaari,
      heldAt: new Date(),
      items: { create: lines },
    };

    let order;
    if (input.heldOrderId) {
      const existing = await tx.registerOrder.findFirst({
        where: {
          id: input.heldOrderId,
          registerShiftId: shift.id,
          status: "HELD",
        },
        select: { id: true, bill: { select: {
          id: true, version: true, status: true, items: true, subtotalLaari: true, totalLaari: true,
          paymentMethod: true, customerNote: true, restaurantTableId: true, restaurantTableName: true,
        } } },
      });
      if (!existing) throw new PosError("That held order is no longer available.");
      await tx.registerOrderItem.deleteMany({ where: { orderId: existing.id } });
      order = await tx.registerOrder.update({
        where: { id: existing.id },
        data: {
          ...data,
          items: { create: lines },
        },
      });
      if (existing.bill) {
        if (existing.bill.status !== "UNPAID") throw new PosError("That bill is no longer unpaid.");
        const before = parseBillSnapshot({
          items: existing.bill.items,
          subtotalLaari: existing.bill.subtotalLaari,
          totalLaari: existing.bill.totalLaari,
          paymentMethod: existing.bill.paymentMethod,
          customerNote: existing.bill.customerNote,
          restaurantTableId: existing.bill.restaurantTableId,
          restaurantTableName: existing.bill.restaurantTableName,
        } as never);
        if (!before) throw new PosError("That bill has invalid snapshot data.");
        const after = makeBillSnapshot(lines, input.paymentMethod ?? existing.bill.paymentMethod, input.customerNote ?? null, restaurantTable);
        const changes = describeBillChanges(before, after);
        if (changes.length) {
          const version = existing.bill.version + 1;
          await tx.bill.update({ where: { id: existing.bill.id }, data: {
            paymentMethod: after.paymentMethod,
            subtotalLaari: after.subtotalLaari,
            totalLaari: after.totalLaari,
            items: itemsJson(after),
            customerNote: after.customerNote,
            restaurantTableId: after.restaurantTableId,
            restaurantTableName: after.restaurantTableName,
            version,
            revisions: { create: {
              revision: version,
              kind: "AMENDMENT",
              actorId: input.createdById,
              actorName: input.actorName ?? input.audit.actorLabel,
              changes,
              snapshot: snapshotJson(after),
            } },
          } });
        }
      }
    } else {
      order = await tx.registerOrder.create({
        data: { ...data, registerShiftId: shift.id },
      });
    }

    await tx.auditLog.create({
      data: auditCreateData({
        outcome: "SUCCESS",
        event: "REGISTER_ORDER_HOLD",
        page: "REGISTERS",
        actorId: input.createdById,
        actorLabel: input.audit.actorLabel,
        targetType: "register_order",
        targetId: order.id,
        summary: "Register order held.",
        metadata: {
          registerId: shift.registerId,
          registerShiftId: shift.id,
          totalLaari,
          lineCount: lines.length,
          restaurantTableId,
        },
        request: input.audit.request,
      }),
    });

    return order;
  }, { isolationLevel: "Serializable" });
}
