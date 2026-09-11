"use server";
import { prisma } from "@/lib/db";
import { can, canAccessRegister, getAuthorization } from "@/lib/authorization";
import { mutateOnce, MutationError } from "@/lib/pos/mutation";
import { recordPrintRequest } from "@/lib/pos/print-tracking";
async function authorizePrint(billId: string) {
  const authorization = await getAuthorization();
  const bill = await prisma.bill.findUnique({ where: { id: billId }, select: { registerId: true } });
  if (!authorization || !bill || !canAccessRegister(authorization, bill.registerId) || !(can(authorization, "BILL_HISTORY_VIEW") || can(authorization, "SALE_RECORD") || can(authorization, "ORDER_HOLD"))) throw new MutationError("You cannot print this bill.");
  return authorization;
}
export async function getPrintHistoryAction(billId: string) {
  await authorizePrint(billId);
  const bill = await prisma.bill.findUniqueOrThrow({ where: { id: billId }, select: { printRequestCount: true, lastPrintRequestedAt: true } });
  return { printRequestCount: bill.printRequestCount, lastPrintRequestedAt: bill.lastPrintRequestedAt?.toISOString() ?? null };
}
export async function requestBillPrintAction(billId: string, reason: string, requestId: string) {
  const authorization = await authorizePrint(billId);
  if (!/^[\w-]{16,100}$/.test(requestId)) return { ok: false as const, error: "Reload before printing." };
  try {
    const history = await mutateOnce(prisma, `print:${authorization.user.id}:${billId}`, requestId, { reason }, tx => recordPrintRequest(tx, { billId, reason, actorId: authorization.user.id, actorLabel: authorization.user.username ?? authorization.user.email }));
    return { ok: true as const, ...history };
  } catch (error) { return { ok: false as const, error: error instanceof MutationError ? error.message : "Could not record the print request." }; }
}
