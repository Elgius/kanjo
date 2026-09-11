import type { Prisma } from "@/generated/prisma/client";
import { MutationError } from "@/lib/pos/mutation";
import { auditCreateData } from "@/lib/audit-core";
export async function recordPrintRequest(tx: Prisma.TransactionClient, input: { billId: string; reason: string; actorId: string; actorLabel: string }) {
  const bill = await tx.bill.findUniqueOrThrow({ where: { id: input.billId }, select: { printRequestCount: true, lastPrintRequestedAt: true, billNumber: true } });
  const reason = input.reason.trim();
  if (reason.length > 500 || (bill.printRequestCount > 0 && reason.length < 5)) throw new MutationError("Give a reprint reason (5–500 characters).");
  const updated = await tx.bill.update({ where: { id: input.billId }, data: { printRequestCount: { increment: 1 }, lastPrintRequestedAt: new Date() }, select: { printRequestCount: true, lastPrintRequestedAt: true } });
  await tx.auditLog.create({ data: auditCreateData({ outcome: "SUCCESS", event: "BILL_PRINT_REQUEST", page: "BILL_HISTORY", actorId: input.actorId, actorLabel: input.actorLabel, targetType: "bill", targetId: input.billId,
    summary: `Print requested for bill #${bill.billNumber}.`, metadata: { reason: reason || null, requestCount: updated.printRequestCount, previousRequestAt: bill.lastPrintRequestedAt?.toISOString(), printStatus: "REQUESTED", confirmationSupported: false } }) });
  return { printRequestCount: updated.printRequestCount, lastPrintRequestedAt: updated.lastPrintRequestedAt!.toISOString() };
}
