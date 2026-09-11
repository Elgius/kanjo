import type { PrismaClient } from "@/generated/prisma/client";
import { auditCreateData, type AuditInput } from "@/lib/audit-core";
import { mutateOnce, MutationError } from "@/lib/pos/mutation";

export async function mergeCustomers(db: PrismaClient, input: {
  sourceId: string; targetId: string; sourceUpdatedAt: string; targetUpdatedAt: string;
  reason: string; requestId: string; actorId: string; actorLabel: string;
}) {
  if (input.sourceId === input.targetId) throw new MutationError("Choose a different destination account.");
  if (input.reason.trim().length < 5) throw new MutationError("Give a reason for merging these accounts.");
  return mutateOnce(db, `customer-merge:${input.actorId}`, input.requestId, input, async tx => {
    const accounts = await tx.customer.findMany({ where: { id: { in: [input.sourceId, input.targetId] }, active: true } });
    const source = accounts.find(c => c.id === input.sourceId), target = accounts.find(c => c.id === input.targetId);
    if (!source || !target) throw new MutationError("Both accounts must still be active.");
    if (source.updatedAt.toISOString() !== input.sourceUpdatedAt || target.updatedAt.toISOString() !== input.targetUpdatedAt) throw new MutationError("An account changed. Reload and review the merge again.");
    const bills = await tx.customerCreditBill.findMany({ where: { customerId: { in: [source.id, target.id] } }, select: { id: true, customerId: true, totalLaari: true, status: true } });
    const outstanding = bills.filter(b => b.status === "OUTSTANDING").reduce((n,b) => n+b.totalLaari,0);
    if (outstanding > target.creditLimitLaari) throw new MutationError("Combined outstanding credit exceeds the destination limit. Review its limit before merging.");
    await tx.customerCreditBill.updateMany({ where: { customerId: source.id }, data: { customerId: target.id } });
    await tx.customer.update({ where: { id: source.id }, data: { active: false, mergedIntoId: target.id } });
    // Touch the survivor so stale merge previews cannot be reused.
    await tx.customer.update({ where: { id: target.id }, data: { updatedAt: new Date() } });
    const audit: AuditInput = { outcome: "SUCCESS", event: "CUSTOMER_MERGE", page: "CUSTOMERS", actorId: input.actorId, actorLabel: input.actorLabel,
      targetType: "customer", targetId: target.id, summary: `Merged ${source.name} into ${target.name}.`,
      metadata: { sourceId: source.id, targetId: target.id, sourceName: source.name, targetName: target.name, reason: input.reason,
        movedBillIds: bills.filter(b => b.customerId === source.id).map(b => b.id), combinedOutstandingLaari: outstanding, retainedCreditLimitLaari: target.creditLimitLaari } };
    await tx.auditLog.create({ data: auditCreateData(audit) });
    return { targetId: target.id };
  });
}
