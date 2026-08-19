"use server";

import { revalidatePath } from "next/cache";

import { requireSiteAdminAction } from "@/lib/authorization";
import { getAuditRequestContext, safeWriteAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  amendPaidBill,
  reversePaidBill,
  type CorrectionStockChoice,
} from "@/lib/pos/bill-corrections";
import { PosError } from "@/lib/pos/sales";

export type AmendPaidBillActionInput = {
  billId: string;
  registerId: string;
  sessionId: string;
  expectedVersion: number;
  quantities: Array<{ saleItemId: string; quantity: number }>;
  addedStock: CorrectionStockChoice;
  removedStock: CorrectionStockChoice;
};

export type ReversePaidBillActionInput = {
  billId: string;
  registerId: string;
  sessionId: string;
  expectedVersion: number;
  stock: CorrectionStockChoice;
};

function refreshCorrection(registerId: string, sessionId: string) {
  revalidatePath(`/registers/sessions/${registerId}/${sessionId}`);
  revalidatePath(`/registers/sessions/${registerId}`);
  revalidatePath("/registers/sessions");
  revalidatePath(`/registers/${registerId}`);
  revalidatePath("/registers");
  revalidatePath("/bill-history");
  revalidatePath("/inventory");
  revalidatePath("/stock");
  revalidatePath("/customers");
  revalidatePath("/");
  revalidatePath("/", "layout");
}

async function failure(event: "BILL_AMEND" | "BILL_REVERSE", actor: { id: string; label: string }, message: string, input: unknown) {
  await safeWriteAudit({
    outcome: "FAILURE",
    event,
    page: "REGISTERS",
    actorId: actor.id,
    actorLabel: actor.label,
    summary: message,
    metadata: input,
    request: await getAuditRequestContext(),
  });
}

export async function amendPaidBillAction(input: AmendPaidBillActionInput) {
  const authorization = await requireSiteAdminAction("BILL_AMEND");
  const label = authorization.user.username ?? authorization.user.email;
  try {
    const result = await amendPaidBill(prisma, {
      ...input,
      actorId: authorization.user.id,
      actorName: authorization.user.name,
      audit: { actorLabel: label, request: await getAuditRequestContext() },
    });
    refreshCorrection(input.registerId, input.sessionId);
    return { ok: true as const, result };
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The paid bill could not be amended.";
    await failure("BILL_AMEND", { id: authorization.user.id, label }, message, input);
    return { ok: false as const, error: message };
  }
}

export async function reversePaidBillAction(input: ReversePaidBillActionInput) {
  const authorization = await requireSiteAdminAction("BILL_REVERSE");
  const label = authorization.user.username ?? authorization.user.email;
  try {
    const result = await reversePaidBill(prisma, {
      ...input,
      actorId: authorization.user.id,
      actorName: authorization.user.name,
      audit: { actorLabel: label, request: await getAuditRequestContext() },
    });
    refreshCorrection(input.registerId, input.sessionId);
    return { ok: true as const, result };
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The paid bill could not be reversed.";
    await failure("BILL_REVERSE", { id: authorization.user.id, label }, message, input);
    return { ok: false as const, error: message };
  }
}
