"use server";

import { hashPassword } from "better-auth/crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { getAuditRequestContext, safeWriteAudit, writeAudit } from "@/lib/audit";
import {
  requireSiteAdminAction,
  type AuthorizationContext,
} from "@/lib/authorization";
import { prisma } from "@/lib/db";
import {
  normalizeRoleName,
  PAGE_DEFINITIONS,
  legacyPermissionProjection,
  parseCapabilityValues,
  parseRegisterScopeMode,
  validateCapabilitySelection,
  validateRoleName,
  validateUsername,
} from "@/lib/permissions";
import {
  canManageTeamAccount,
  teamAccountDeniedMessage,
  type TeamAccountOperation,
} from "@/lib/team-account-policy";

function settingsRedirect(
  path: "/settings" | "/settings/roles",
  kind: "success" | "error",
  message: string,
): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

function actorLabel(authorization: AuthorizationContext) {
  return authorization.user.username ?? authorization.user.email;
}

async function auditFailure(
  authorization: AuthorizationContext,
  event: string,
  summary: string,
  metadata?: unknown,
) {
  await safeWriteAudit({
    outcome: "FAILURE",
    event,
    page: "SETTINGS",
    actorId: authorization.user.id,
    actorLabel: actorLabel(authorization),
    summary,
    metadata,
    request: await getAuditRequestContext(),
  });
}

async function grantsFromForm(formData: FormData) {
  const scopeMode = parseRegisterScopeMode(formData.get("registerScopeMode"));
  const registerIds = formData.getAll("registerIds").filter(
    (value): value is string => typeof value === "string" && Boolean(value),
  );
  const validated = validateCapabilitySelection(parseCapabilityValues(formData), scopeMode, registerIds);
  if (!validated.ok) return validated;
  if (scopeMode === "SELECTED" && registerIds.length) {
    const existing = await prisma.cashRegister.count({ where: { id: { in: registerIds } } });
    if (existing !== new Set(registerIds).size) {
      return { ok: false as const, error: "One or more selected registers no longer exist." };
    }
  }
  const projection = legacyPermissionProjection(validated.capabilities);
  return {
    ok: true as const,
    scopeMode,
    registerIds: scopeMode === "SELECTED" ? Array.from(new Set(registerIds)) : [],
    capabilities: validated.capabilities,
    permissions: PAGE_DEFINITIONS.map(({ key: page }) => ({ page, level: projection[page] })),
  };
}

export async function createRoleAction(formData: FormData) {
  const authorization = await requireSiteAdminAction("ROLE_CREATE");
  const parsedName = validateRoleName(String(formData.get("name") ?? ""));
  if (!parsedName.ok) {
    await auditFailure(authorization, "ROLE_CREATE", parsedName.error);
    settingsRedirect("/settings/roles", "error", parsedName.error);
  }
  const description = String(formData.get("description") ?? "").trim().slice(0, 500) || null;
  const grants = await grantsFromForm(formData);
  if (!grants.ok) settingsRedirect("/settings/roles", "error", grants.error);
  const request = await getAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          name: parsedName.value,
          normalizedName: normalizeRoleName(parsedName.value),
          description,
          registerScopeMode: grants.scopeMode,
          permissions: { create: grants.permissions },
          capabilities: { create: grants.capabilities.map((capability) => ({ capability })) },
          registerAccess: { create: grants.registerIds.map((registerId) => ({ registerId })) },
        },
        select: { id: true, name: true },
      });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "ROLE_CREATE",
        page: "SETTINGS",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "role",
        targetId: role.id,
        summary: `Role ${role.name} created.`,
        metadata: { capabilities: grants.capabilities, registerScopeMode: grants.scopeMode, registerIds: grants.registerIds },
        request,
      });
    });
  } catch (error) {
    const message =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        ? "A role with that name already exists."
        : "The role could not be created.";
    await auditFailure(authorization, "ROLE_CREATE", message, { roleName: parsedName.value });
    settingsRedirect("/settings/roles", "error", message);
  }

  revalidatePath("/settings", "layout");
  settingsRedirect("/settings/roles", "success", "Role created.");
}

export async function updateRoleAction(roleId: string, formData: FormData) {
  const authorization = await requireSiteAdminAction("ROLE_UPDATE");
  const parsedName = validateRoleName(String(formData.get("name") ?? ""));
  if (!parsedName.ok) {
    await auditFailure(authorization, "ROLE_UPDATE", parsedName.error, { roleId });
    settingsRedirect("/settings/roles", "error", parsedName.error);
  }
  const description = String(formData.get("description") ?? "").trim().slice(0, 500) || null;
  const grants = await grantsFromForm(formData);
  if (!grants.ok) settingsRedirect("/settings/roles", "error", grants.error);
  const request = await getAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.role.findUniqueOrThrow({
        where: { id: roleId },
        select: {
          name: true,
          registerScopeMode: true,
          capabilities: { select: { capability: true } },
          registerAccess: { select: { registerId: true } },
        },
      });
      const role = await tx.role.update({
        where: { id: roleId },
        data: {
          name: parsedName.value,
          normalizedName: normalizeRoleName(parsedName.value),
          description,
          registerScopeMode: grants.scopeMode,
        },
        select: { id: true, name: true },
      });
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: grants.permissions.map((permission) => ({ roleId, ...permission })),
      });
      await tx.roleCapability.deleteMany({ where: { roleId } });
      await tx.roleCapability.createMany({
        data: grants.capabilities.map((capability) => ({ roleId, capability })),
      });
      await tx.roleRegisterAccess.deleteMany({ where: { roleId } });
      if (grants.registerIds.length) {
        await tx.roleRegisterAccess.createMany({
          data: grants.registerIds.map((registerId) => ({ roleId, registerId })),
        });
      }
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "ROLE_UPDATE",
        page: "SETTINGS",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "role",
        targetId: role.id,
        summary: `Role ${role.name} updated.`,
        metadata: { before, after: { name: role.name, capabilities: grants.capabilities, registerScopeMode: grants.scopeMode, registerIds: grants.registerIds } },
        request,
      });
    });
  } catch (error) {
    const message =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        ? "A role with that name already exists."
        : "The role could not be updated.";
    await auditFailure(authorization, "ROLE_UPDATE", message, { roleId });
    settingsRedirect("/settings/roles", "error", message);
  }

  revalidatePath("/settings", "layout");
  settingsRedirect("/settings/roles", "success", "Role updated.");
}

export async function deleteRoleAction(roleId: string) {
  const authorization = await requireSiteAdminAction("ROLE_DELETE");
  const request = await getAuditRequestContext();
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { name: true, _count: { select: { users: true } } },
  });
  if (!role) {
    const message = "Role not found.";
    await auditFailure(authorization, "ROLE_DELETE", message, { roleId });
    settingsRedirect("/settings/roles", "error", message);
  }
  if (role._count.users > 0) {
    const message = "Move every account to another role before deleting this role.";
    await auditFailure(authorization, "ROLE_DELETE", message, { roleId, assigned: role._count.users });
    settingsRedirect("/settings/roles", "error", message);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id: roleId } });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "ROLE_DELETE",
        page: "SETTINGS",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "role",
        targetId: roleId,
        summary: `Role ${role.name} deleted.`,
        request,
      });
    });
  } catch {
    const message = "The role could not be deleted. It may still be assigned.";
    await auditFailure(authorization, "ROLE_DELETE", message, { roleId });
    settingsRedirect("/settings/roles", "error", message);
  }

  revalidatePath("/settings", "layout");
  settingsRedirect("/settings/roles", "success", "Role deleted.");
}

export async function createAccountAction(formData: FormData) {
  const authorization = await requireSiteAdminAction("ACCOUNT_CREATE");
  const parsedUsername = validateUsername(String(formData.get("username") ?? ""));
  if (!parsedUsername.ok) {
    await auditFailure(authorization, "ACCOUNT_CREATE", parsedUsername.error);
    settingsRedirect("/settings", "error", parsedUsername.error);
  }
  const password = String(formData.get("password") ?? "");
  if (password.length < 8 || password.length > 128) {
    const message = "Password must be between 8 and 128 characters.";
    await auditFailure(authorization, "ACCOUNT_CREATE", message, {
      username: parsedUsername.value,
    });
    settingsRedirect("/settings", "error", message);
  }
  const roleId = String(formData.get("roleId") ?? "");
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } });
  if (!role) {
    const message = "Select an existing role.";
    await auditFailure(authorization, "ACCOUNT_CREATE", message, {
      username: parsedUsername.value,
    });
    settingsRedirect("/settings", "error", message);
  }

  const userId = crypto.randomUUID();
  const request = await getAuditRequestContext();
  try {
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          name: parsedUsername.value,
          username: parsedUsername.value,
          displayUsername: parsedUsername.value,
          email: `${parsedUsername.value}@accounts.kanjo.invalid`,
          roleId: role.id,
        },
      });
      await tx.account.create({
        data: {
          id: crypto.randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
        },
      });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "ACCOUNT_CREATE",
        page: "SETTINGS",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "user",
        targetId: userId,
        summary: `Account ${parsedUsername.value} created.`,
        metadata: { username: parsedUsername.value, roleId: role.id, roleName: role.name },
        request,
      });
    });
  } catch (error) {
    const message =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        ? "That username already exists."
        : "The account could not be created.";
    await auditFailure(authorization, "ACCOUNT_CREATE", message, {
      username: parsedUsername.value,
      roleId,
    });
    settingsRedirect("/settings", "error", message);
  }

  revalidatePath("/settings");
  settingsRedirect("/settings", "success", "Account created.");
}

async function requireManageableTeamAccount(
  tx: Prisma.TransactionClient,
  authorization: AuthorizationContext,
  userId: string,
  operation: TeamAccountOperation,
) {
  const target = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      isSiteAdmin: true,
      _count: { select: { accounts: true } },
    },
  });
  if (!target || target._count.accounts === 0) throw new Error("ACCOUNT_NOT_FOUND");
  if (!canManageTeamAccount({
    actorId: authorization.user.id,
    targetId: target.id,
    targetIsSiteAdmin: target.isSiteAdmin,
    operation,
  })) {
    throw new Error("ACCOUNT_PROTECTED");
  }
  return target;
}

function accountManagementError(
  error: unknown,
  authorization: AuthorizationContext,
  userId: string,
  fallback: string,
) {
  if (error instanceof Error && error.message === "ACCOUNT_NOT_FOUND") {
    return "Account not found.";
  }
  if (error instanceof Error && error.message === "ACCOUNT_PROTECTED") {
    return teamAccountDeniedMessage({ actorId: authorization.user.id, targetId: userId });
  }
  return fallback;
}

export async function updateUsernameAction(userId: string, formData: FormData) {
  const authorization = await requireSiteAdminAction("ACCOUNT_USERNAME_UPDATE");
  const parsedUsername = validateUsername(String(formData.get("username") ?? ""));
  if (!parsedUsername.ok) {
    await auditFailure(authorization, "ACCOUNT_USERNAME_UPDATE", parsedUsername.error, { userId });
    settingsRedirect("/settings", "error", parsedUsername.error);
  }
  const request = await getAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const target = await requireManageableTeamAccount(
        tx,
        authorization,
        userId,
        "EDIT_USERNAME",
      );
      const previousUsername = target.username;
      const hasManagedEmail = previousUsername !== null
        && target.email === `${previousUsername}@accounts.kanjo.invalid`;
      const result = await tx.user.updateMany({
        where: {
          id: userId,
          OR: [
            { isSiteAdmin: false },
            { id: authorization.user.id },
          ],
        },
        data: {
          username: parsedUsername.value,
          displayUsername: parsedUsername.value,
          name: target.name === previousUsername ? parsedUsername.value : target.name,
          email: hasManagedEmail
            ? `${parsedUsername.value}@accounts.kanjo.invalid`
            : target.email,
        },
      });
      if (result.count !== 1) throw new Error("ACCOUNT_PROTECTED");
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "ACCOUNT_USERNAME_UPDATE",
        page: "SETTINGS",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "user",
        targetId: userId,
        summary: `${previousUsername ?? target.email} renamed to ${parsedUsername.value}.`,
        metadata: { previousUsername, username: parsedUsername.value },
        request,
      });
    });
  } catch (error) {
    const message =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        ? "That username already exists."
        : accountManagementError(error, authorization, userId, "The username could not be updated.");
    await auditFailure(authorization, "ACCOUNT_USERNAME_UPDATE", message, { userId });
    settingsRedirect("/settings", "error", message);
  }

  revalidatePath("/settings", "layout");
  settingsRedirect("/settings", "success", "Username updated.");
}

export async function resetAccountPasswordAction(userId: string, formData: FormData) {
  const authorization = await requireSiteAdminAction("ACCOUNT_PASSWORD_RESET");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");
  if (password.length < 8 || password.length > 128) {
    const message = "Password must be between 8 and 128 characters.";
    await auditFailure(authorization, "ACCOUNT_PASSWORD_RESET", message, { userId });
    settingsRedirect("/settings", "error", message);
  }
  if (password !== confirmation) {
    const message = "The password confirmation does not match.";
    await auditFailure(authorization, "ACCOUNT_PASSWORD_RESET", message, { userId });
    settingsRedirect("/settings", "error", message);
  }
  const passwordHash = await hashPassword(password);
  const request = await getAuditRequestContext();

  try {
    await prisma.$transaction(
      async (tx) => {
        const target = await requireManageableTeamAccount(
          tx,
          authorization,
          userId,
          "RESET_PASSWORD",
        );
        const credential = await tx.account.updateMany({
          where: { userId, providerId: "credential" },
          data: { password: passwordHash },
        });
        if (credential.count === 0) {
          await tx.account.create({
            data: {
              id: crypto.randomUUID(),
              accountId: userId,
              providerId: "credential",
              userId,
              password: passwordHash,
            },
          });
        }
        await tx.session.deleteMany({ where: { userId } });
        await writeAudit(tx, {
          outcome: "SUCCESS",
          event: "ACCOUNT_PASSWORD_RESET",
          page: "SETTINGS",
          actorId: authorization.user.id,
          actorLabel: actorLabel(authorization),
          targetType: "user",
          targetId: userId,
          summary: `Password reset for ${target.username ?? target.email}.`,
          metadata: { sessionsRevoked: true },
          request,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    const message = accountManagementError(
      error,
      authorization,
      userId,
      "The password could not be reset.",
    );
    await auditFailure(authorization, "ACCOUNT_PASSWORD_RESET", message, { userId });
    settingsRedirect("/settings", "error", message);
  }

  revalidatePath("/settings", "layout");
  settingsRedirect("/settings", "success", "Password reset and active sessions revoked.");
}

export async function deleteAccountAction(userId: string) {
  const authorization = await requireSiteAdminAction("ACCOUNT_DELETE");
  const request = await getAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const target = await requireManageableTeamAccount(tx, authorization, userId, "DELETE");
      const result = await tx.user.updateMany({
        where: { id: userId, isSiteAdmin: false },
        data: {
          username: null,
          displayUsername: null,
          email: `${userId}@deleted.kanjo.invalid`,
          emailVerified: false,
          image: null,
        },
      });
      if (result.count !== 1) throw new Error("ACCOUNT_PROTECTED");
      await tx.session.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "ACCOUNT_DELETE",
        page: "SETTINGS",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "user",
        targetId: userId,
        summary: `Account ${target.username ?? target.email} deleted.`,
        metadata: { historicalUserReferenceRetained: true },
        request,
      });
    });
  } catch (error) {
    const message = accountManagementError(
      error,
      authorization,
      userId,
      "The account could not be deleted.",
    );
    await auditFailure(authorization, "ACCOUNT_DELETE", message, { userId });
    settingsRedirect("/settings", "error", message);
  }

  revalidatePath("/settings", "layout");
  settingsRedirect("/settings", "success", "Account deleted.");
}

export async function assignRoleAction(userId: string, formData: FormData) {
  const authorization = await requireSiteAdminAction("ACCOUNT_ROLE_ASSIGN");
  const roleId = String(formData.get("roleId") ?? "");
  const request = await getAuditRequestContext();
  try {
    await prisma.$transaction(async (tx) => {
      const [target, role] = await Promise.all([
        tx.user.findUniqueOrThrow({
          where: { id: userId, accounts: { some: {} } },
          select: { username: true, email: true, role: { select: { id: true, name: true } } },
        }),
        tx.role.findUniqueOrThrow({ where: { id: roleId }, select: { id: true, name: true } }),
      ]);
      await tx.user.update({ where: { id: userId }, data: { roleId: role.id } });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "ACCOUNT_ROLE_ASSIGN",
        page: "SETTINGS",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "user",
        targetId: userId,
        summary: `${target.username ?? target.email} assigned to ${role.name}.`,
        metadata: {
          previousRoleId: target.role.id,
          previousRoleName: target.role.name,
          roleId: role.id,
          roleName: role.name,
        },
        request,
      });
    });
  } catch {
    const message = "The account role could not be changed.";
    await auditFailure(authorization, "ACCOUNT_ROLE_ASSIGN", message, { userId, roleId });
    settingsRedirect("/settings", "error", message);
  }
  revalidatePath("/settings", "layout");
  settingsRedirect("/settings", "success", "Account role updated.");
}

export async function setSiteAdminAction(userId: string, formData: FormData) {
  const authorization = await requireSiteAdminAction("SITE_ADMIN_UPDATE");
  const promote = formData.get("isSiteAdmin") === "true";
  const request = await getAuditRequestContext();
  try {
    await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUniqueOrThrow({
          where: { id: userId, accounts: { some: {} } },
          select: { username: true, email: true, isSiteAdmin: true },
        });
        if (!promote && target.isSiteAdmin) {
          const administrators = await tx.user.count({ where: { isSiteAdmin: true } });
          if (administrators <= 1) throw new Error("LAST_SITE_ADMIN");
        }
        await tx.user.update({ where: { id: userId }, data: { isSiteAdmin: promote } });
        await writeAudit(tx, {
          outcome: "SUCCESS",
          event: "SITE_ADMIN_UPDATE",
          page: "SETTINGS",
          actorId: authorization.user.id,
          actorLabel: actorLabel(authorization),
          targetType: "user",
          targetId: userId,
          summary: `${target.username ?? target.email} ${promote ? "promoted to" : "removed from"} site administrator.`,
          metadata: { previous: target.isSiteAdmin, current: promote },
          request,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message === "LAST_SITE_ADMIN"
        ? "Promote another site administrator before demoting the last one."
        : "Site administrator access could not be updated.";
    await auditFailure(authorization, "SITE_ADMIN_UPDATE", message, { userId, promote });
    settingsRedirect("/settings", "error", message);
  }
  revalidatePath("/settings", "layout");
  settingsRedirect("/settings", "success", "Site administrator access updated.");
}
