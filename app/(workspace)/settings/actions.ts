"use server";

import { hashPassword } from "better-auth/crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import type { PageKey, PermissionLevel } from "@/generated/prisma/enums";
import { getAuditRequestContext, safeWriteAudit, writeAudit } from "@/lib/audit";
import {
  requireSiteAdminAction,
  type AuthorizationContext,
} from "@/lib/authorization";
import { prisma } from "@/lib/db";
import {
  normalizeRoleName,
  PAGE_DEFINITIONS,
  parsePermissionValue,
  validateRoleName,
  validateUsername,
} from "@/lib/permissions";

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

function permissionsFromForm(formData: FormData) {
  return PAGE_DEFINITIONS.map((page) => ({
    page: page.key as PageKey,
    level: parsePermissionValue(
      formData.get(`permission_${page.key}`),
      page.editable,
    ) as PermissionLevel,
  }));
}

export async function createRoleAction(formData: FormData) {
  const authorization = await requireSiteAdminAction("ROLE_CREATE");
  const parsedName = validateRoleName(String(formData.get("name") ?? ""));
  if (!parsedName.ok) {
    await auditFailure(authorization, "ROLE_CREATE", parsedName.error);
    settingsRedirect("/settings/roles", "error", parsedName.error);
  }
  const description = String(formData.get("description") ?? "").trim().slice(0, 500) || null;
  const permissions = permissionsFromForm(formData);
  const request = await getAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          name: parsedName.value,
          normalizedName: normalizeRoleName(parsedName.value),
          description,
          permissions: { create: permissions },
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
        metadata: { permissions },
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
  const permissions = permissionsFromForm(formData);
  const request = await getAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.role.findUniqueOrThrow({
        where: { id: roleId },
        select: { name: true, permissions: { select: { page: true, level: true } } },
      });
      const role = await tx.role.update({
        where: { id: roleId },
        data: {
          name: parsedName.value,
          normalizedName: normalizeRoleName(parsedName.value),
          description,
        },
        select: { id: true, name: true },
      });
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId, ...permission })),
      });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "ROLE_UPDATE",
        page: "SETTINGS",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "role",
        targetId: role.id,
        summary: `Role ${role.name} updated.`,
        metadata: { before, after: { name: role.name, permissions } },
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

export async function assignRoleAction(userId: string, formData: FormData) {
  const authorization = await requireSiteAdminAction("ACCOUNT_ROLE_ASSIGN");
  const roleId = String(formData.get("roleId") ?? "");
  const request = await getAuditRequestContext();
  try {
    await prisma.$transaction(async (tx) => {
      const [target, role] = await Promise.all([
        tx.user.findUniqueOrThrow({
          where: { id: userId },
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
          where: { id: userId },
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
