"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuditRequestContext, safeWriteAudit } from "@/lib/audit";
import { requireShiftPolicy, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { issueCustomerCredit } from "@/lib/pos/customers";
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
    const updated = await prisma.registerOrder.updateMany({
      where: { id: heldOrderId, registerShiftId: shiftId, status: "HELD" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (updated.count !== 1) throw new PosError("That held bill is no longer available.");
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
