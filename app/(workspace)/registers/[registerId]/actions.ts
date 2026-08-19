"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuditRequestContext, safeWriteAudit } from "@/lib/audit";
import { eventChanges, parseBillSnapshot, snapshotJson } from "@/lib/pos/bill-revisions";
import { requireShiftPolicy, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { issueCustomerCredit } from "@/lib/pos/customers";
import { amendPrintedBill, trackPrintedBill } from "@/lib/pos/bill-lifecycle";
import { holdRegisterOrder } from "@/lib/pos/orders";
import { PosError, recordSale } from "@/lib/pos/sales";
import { parseRegisterCartForm } from "@/lib/pos/validation";

function actorLabel(authorization: AuthorizationContext) {
  return authorization.user.username ?? authorization.user.email;
}

function registerRedirect(
  registerId: string,
  kind: "success" | "error",
  message: string,
  extra?: Record<string, string>,
): never {
  const params = new URLSearchParams({ [kind]: message, ...extra });
  redirect(`/registers/${registerId}?${params.toString()}`);
}

function refreshRegister(registerId: string) {
  revalidatePath(`/registers/${registerId}`);
  revalidatePath(`/registers/${registerId}/restaurant`);
  revalidatePath("/registers");
  revalidatePath("/inventory");
  revalidatePath("/stock");
  revalidatePath("/bill-history");
  revalidatePath("/customers");
  revalidatePath("/");
  revalidatePath("/", "layout");
}

type PrintedBillClientInput = {
  billId?: string | null;
  heldOrderId?: string | null;
  expectedVersion?: number | null;
  restaurantTableId?: string | null;
  customerNote?: string | null;
  paymentMethod: "CASH" | "CARD" | "MOBILE";
  items: Array<{ itemId: string; quantity: number }>;
};

function printedBillFormData(input: PrintedBillClientInput) {
  const formData = new FormData();
  formData.set("items", JSON.stringify(input.items));
  formData.set("paymentMethod", input.paymentMethod);
  formData.set("heldOrderId", input.heldOrderId ?? "");
  formData.set("restaurantTableId", input.restaurantTableId ?? "");
  formData.set("customerNote", input.customerNote ?? "");
  return formData;
}

function refreshBillHistory(registerId: string, shiftId: string) {
  revalidatePath("/bill-history");
  revalidatePath(`/registers/sessions/${registerId}/${shiftId}`);
}

export async function printUnpaidBillAction(
  shiftId: string,
  registerId: string,
  input: PrintedBillClientInput,
) {
  const { authorization, shift } = await requireShiftPolicy("REGISTER_ORDER_HOLD", shiftId);
  if (shift.registerId !== registerId) return { ok: false as const, error: "That shift does not belong to this register." };
  const parsed = parseRegisterCartForm(printedBillFormData(input));
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  if (input.billId && (!input.heldOrderId || !Number.isSafeInteger(input.expectedVersion))) {
    return { ok: false as const, error: "Reload this tracked bill before printing it again." };
  }
  try {
    const bill = await trackPrintedBill(prisma, {
      shiftId,
      actorId: authorization.user.id,
      actorName: authorization.user.name,
      billId: input.billId,
      expectedVersion: input.expectedVersion,
      heldOrderId: parsed.data.heldOrderId,
      restaurantTableId: parsed.data.restaurantTableId,
      customerNote: parsed.data.customerNote,
      paymentMethod: parsed.data.paymentMethod,
      items: parsed.data.items,
      audit: { actorLabel: actorLabel(authorization), request: await getAuditRequestContext() },
    });
    refreshBillHistory(registerId, shiftId);
    return { ok: true as const, bill };
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The unpaid bill could not be tracked.";
    await auditFailure(authorization, "BILL_TRACK_START", message, { shiftId, registerId });
    return { ok: false as const, error: message };
  }
}

export async function amendPrintedBillAction(
  shiftId: string,
  registerId: string,
  input: PrintedBillClientInput,
) {
  const { authorization, shift } = await requireShiftPolicy("REGISTER_ORDER_HOLD", shiftId);
  if (shift.registerId !== registerId) return { ok: false as const, error: "That shift does not belong to this register." };
  const parsed = parseRegisterCartForm(printedBillFormData(input));
  if (!parsed.ok) return { ok: false as const, error: parsed.error };
  if (!input.billId || !parsed.data.heldOrderId || !Number.isSafeInteger(input.expectedVersion)) {
    return { ok: false as const, error: "Reload this tracked bill before changing it." };
  }
  try {
    const bill = await amendPrintedBill(prisma, {
      shiftId,
      actorId: authorization.user.id,
      actorName: authorization.user.name,
      billId: input.billId,
      expectedVersion: input.expectedVersion!,
      heldOrderId: parsed.data.heldOrderId,
      restaurantTableId: parsed.data.restaurantTableId,
      customerNote: parsed.data.customerNote,
      paymentMethod: parsed.data.paymentMethod,
      items: parsed.data.items,
      audit: { actorLabel: actorLabel(authorization), request: await getAuditRequestContext() },
    });
    refreshBillHistory(registerId, shiftId);
    return { ok: true as const, bill };
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The bill amendment could not be saved.";
    return { ok: false as const, error: message };
  }
}

async function auditFailure(
  authorization: AuthorizationContext,
  event: string,
  summary: string,
  metadata: unknown,
) {
  await safeWriteAudit({
    outcome: "FAILURE",
    event,
    page: "REGISTERS",
    actorId: authorization.user.id,
    actorLabel: actorLabel(authorization),
    summary,
    metadata,
    request: await getAuditRequestContext(),
  });
}

export async function checkoutRegisterSaleAction(
  shiftId: string,
  registerId: string,
  formData: FormData,
) {
  const { authorization, shift } = await requireShiftPolicy("SALE_RECORD", shiftId);
  if (shift.registerId !== registerId) registerRedirect(shift.registerId, "error", "That shift does not belong to this register.");
  const parsed = parseRegisterCartForm(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "SALE_RECORD", parsed.error, { shiftId, registerId });
    registerRedirect(registerId, "error", parsed.error);
  }

  let completedSale: { id: string; receiptNumber: bigint };
  try {
    const sale = await recordSale(prisma, {
      shiftId,
      createdById: authorization.user.id,
      cashierName: authorization.user.name,
      heldOrderId: parsed.data.heldOrderId,
      customerNote: parsed.data.customerNote,
      restaurantTableId: parsed.data.restaurantTableId,
      paymentMethod: parsed.data.paymentMethod,
      items: parsed.data.items,
      audit: {
        actorLabel: actorLabel(authorization),
        request: await getAuditRequestContext(),
      },
    });
    completedSale = { id: sale.id, receiptNumber: sale.receiptNumber };
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The sale could not be recorded.";
    await auditFailure(authorization, "SALE_RECORD", message, { shiftId, registerId });
    registerRedirect(registerId, "error", message);
  }

  refreshRegister(registerId);
  registerRedirect(
    registerId,
    "success",
    `Receipt #${completedSale.receiptNumber} recorded.`,
    { receipt: completedSale.id },
  );
}

export async function holdRegisterOrderAction(
  shiftId: string,
  registerId: string,
  formData: FormData,
) {
  const { authorization, shift } = await requireShiftPolicy("REGISTER_ORDER_HOLD", shiftId);
  if (shift.registerId !== registerId) registerRedirect(shift.registerId, "error", "That shift does not belong to this register.");
  const parsed = parseRegisterCartForm(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "REGISTER_ORDER_HOLD", parsed.error, { shiftId, registerId });
    registerRedirect(registerId, "error", parsed.error);
  }

  try {
    await holdRegisterOrder(prisma, {
      shiftId,
      createdById: authorization.user.id,
      actorName: authorization.user.name,
      heldOrderId: parsed.data.heldOrderId,
      restaurantTableId: parsed.data.restaurantTableId,
      customerNote: parsed.data.customerNote,
      paymentMethod: parsed.data.paymentMethod,
      items: parsed.data.items,
      audit: {
        actorLabel: actorLabel(authorization),
        request: await getAuditRequestContext(),
      },
    });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The order could not be held.";
    await auditFailure(authorization, "REGISTER_ORDER_HOLD", message, { shiftId, registerId });
    registerRedirect(registerId, "error", message);
  }

  refreshRegister(registerId);
  registerRedirect(registerId, "success", "Order held for this shift.");
}

export async function creditRegisterBillAction(
  shiftId: string,
  registerId: string,
  formData: FormData,
) {
  const { authorization, shift } = await requireShiftPolicy("CUSTOMER_CREDIT_ISSUE", shiftId);
  if (shift.registerId !== registerId) registerRedirect(shift.registerId, "error", "That shift does not belong to this register.");
  const parsed = parseRegisterCartForm(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "CUSTOMER_CREDIT_ISSUE", parsed.error, { shiftId, registerId });
    registerRedirect(registerId, "error", parsed.error);
  }
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!customerId) {
    const message = "Select a customer for this credit bill.";
    await auditFailure(authorization, "CUSTOMER_CREDIT_ISSUE", message, { shiftId, registerId });
    registerRedirect(registerId, "error", message);
  }

  let creditBill: { id: string; customerId: string; totalLaari: number };
  try {
    creditBill = await issueCustomerCredit(prisma, {
      shiftId,
      customerId,
      createdById: authorization.user.id,
      heldOrderId: parsed.data.heldOrderId,
      note: parsed.data.customerNote,
      items: parsed.data.items,
      audit: {
        actorLabel: actorLabel(authorization),
        request: await getAuditRequestContext(),
      },
    });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The credit bill could not be held.";
    await auditFailure(authorization, "CUSTOMER_CREDIT_ISSUE", message, { shiftId, registerId, customerId });
    registerRedirect(registerId, "error", message);
  }

  refreshRegister(registerId);
  revalidatePath(`/customers/${creditBill.customerId}`);
  registerRedirect(
    registerId,
    "success",
    "Credit bill sent to the customer account.",
    { credit: creditBill.id },
  );
}

export async function cancelHeldOrderAction(
  shiftId: string,
  registerId: string,
  heldOrderId: string,
) {
  const { authorization, shift } = await requireShiftPolicy("REGISTER_ORDER_CANCEL", shiftId);
  if (shift.registerId !== registerId) registerRedirect(shift.registerId, "error", "That shift does not belong to this register.");
  if (!heldOrderId) registerRedirect(registerId, "error", "Select a held bill to cancel.");

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.registerOrder.findFirst({
        where: { id: heldOrderId, registerShiftId: shiftId, status: "HELD" },
        select: { id: true, bill: { select: {
          id: true, version: true, status: true, items: true, subtotalLaari: true, totalLaari: true,
          paymentMethod: true, customerNote: true, restaurantTableId: true, restaurantTableName: true,
        } } },
      });
      if (!order) throw new PosError("That held bill is no longer available.");
      const cancelledAt = new Date();
      await tx.registerOrder.update({
        where: { id: order.id },
        data: { status: "CANCELLED", cancelledAt },
      });
      if (order.bill) {
        if (order.bill.status !== "UNPAID") throw new PosError("That bill is no longer unpaid.");
        const snapshot = parseBillSnapshot({
          items: order.bill.items,
          subtotalLaari: order.bill.subtotalLaari,
          totalLaari: order.bill.totalLaari,
          paymentMethod: order.bill.paymentMethod,
          customerNote: order.bill.customerNote,
          restaurantTableId: order.bill.restaurantTableId,
          restaurantTableName: order.bill.restaurantTableName,
        } as never);
        if (!snapshot) throw new PosError("That bill has invalid snapshot data.");
        const version = order.bill.version + 1;
        await tx.bill.update({
          where: { id: order.bill.id },
          data: {
            status: "CANCELLED",
            cancelledAt,
            version,
            revisions: { create: {
              revision: version,
              kind: "CANCELLATION",
              actorId: authorization.user.id,
              actorName: authorization.user.name,
              changes: eventChanges("CANCELLATION", snapshot),
              snapshot: snapshotJson(snapshot),
            } },
          },
        });
      }
    }, { isolationLevel: "Serializable" });
    await safeWriteAudit({
      outcome: "SUCCESS",
      event: "REGISTER_ORDER_CANCEL",
      page: "REGISTERS",
      actorId: authorization.user.id,
      actorLabel: actorLabel(authorization),
      targetType: "register_order",
      targetId: heldOrderId,
      summary: "Held register bill cancelled.",
      metadata: { shiftId, registerId },
      request: await getAuditRequestContext(),
    });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The held bill could not be cancelled.";
    await auditFailure(authorization, "REGISTER_ORDER_CANCEL", message, { shiftId, registerId, heldOrderId });
    registerRedirect(registerId, "error", message);
  }

  refreshRegister(registerId);
  registerRedirect(registerId, "success", "Held bill cancelled.");
}
