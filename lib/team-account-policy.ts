export type TeamAccountOperation = "EDIT_USERNAME" | "RESET_PASSWORD" | "DELETE";

export function canManageTeamAccount({
  actorId,
  targetId,
  targetIsSiteAdmin,
  operation,
}: {
  actorId: string;
  targetId: string;
  targetIsSiteAdmin: boolean;
  operation: TeamAccountOperation;
}) {
  if (actorId === targetId) return operation !== "DELETE";
  return !targetIsSiteAdmin;
}

export function teamAccountDeniedMessage({
  actorId,
  targetId,
}: {
  actorId: string;
  targetId: string;
}) {
  return actorId === targetId
    ? "You cannot delete your own account."
    : "Other site administrator accounts are protected.";
}
