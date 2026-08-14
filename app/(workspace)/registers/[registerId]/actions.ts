"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuditRequestContext, safeWriteAudit } from "@/lib/audit";
import { requireActionAccess, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/db";
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
  revalidatePath("/registers");
  revalidatePath("/inventory");
  revalidatePath("/stock");
  revalidatePath("/bill-history");
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
  const authorization = await requireActionAccess("REGISTERS", "SALE_RECORD");
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
  const authorization = await requireActionAccess("REGISTERS", "SALE_RECORD");
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
