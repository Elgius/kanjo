import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { CapabilityKey } from "@/generated/prisma/enums";
import { parseAccountRegisterAssignment, validateAccountScope } from "@/lib/access-settings";

export class AccessSettingsError extends Error {}

export async function validateRegisterAssignment(
  tx: Prisma.TransactionClient,
  assignment: ReturnType<typeof parseAccountRegisterAssignment>,
  capabilities: Iterable<CapabilityKey>,
  isSiteAdmin = false,
  existingIds: readonly string[] = [],
) {
  if (!assignment.ok) throw new AccessSettingsError(assignment.error);
  const error = validateAccountScope(capabilities, assignment.scopeMode, isSiteAdmin);
  if (error) throw new AccessSettingsError(error);
  if (assignment.registerIds.length) {
    const registers = await tx.cashRegister.findMany({
      where: { id: { in: assignment.registerIds } }, select: { id: true, active: true },
    });
    if (registers.length !== assignment.registerIds.length) throw new AccessSettingsError("One or more selected registers no longer exist.");
    if (registers.some(({ id, active }) => !active && !existingIds.includes(id))) throw new AccessSettingsError("Archived registers cannot be newly assigned.");
  }
  return assignment;
}
