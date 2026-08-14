import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { PageKey, PermissionLevel } from "@/generated/prisma/enums";
import { safeWriteAudit, getAuditRequestContext } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { authorizationAllows, PAGE_DEFINITIONS, PAGE_KEYS } from "@/lib/permissions";

export type AuthorizationContext = {
  user: {
    id: string;
    name: string;
    email: string;
    username: string | null;
    isSiteAdmin: boolean;
    roleId: string;
    roleName: string;
  };
  permissions: Record<PageKey, PermissionLevel>;
};

export const getAuthorization = cache(async (): Promise<AuthorizationContext | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      isSiteAdmin: true,
      roleId: true,
      role: {
        select: {
          name: true,
          permissions: { select: { page: true, level: true } },
        },
      },
    },
  });
  if (!user) return null;

  const permissions = Object.fromEntries(PAGE_KEYS.map((page) => [page, "NONE"])) as Record<
    PageKey,
    PermissionLevel
  >;
  for (const permission of user.role.permissions) permissions[permission.page] = permission.level;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      isSiteAdmin: user.isSiteAdmin,
      roleId: user.roleId,
      roleName: user.role.name,
    },
    permissions,
  };
});

export function canAccess(
  authorization: AuthorizationContext,
  page: PageKey,
  required: PermissionLevel = "VIEW",
) {
  return authorizationAllows(
    authorization.user.isSiteAdmin,
    authorization.permissions[page],
    required,
  );
}

export function firstAccessiblePath(authorization: AuthorizationContext) {
  return PAGE_DEFINITIONS.find((page) => canAccess(authorization, page.key))?.href ?? null;
}

export async function requireAuthorization() {
  const authorization = await getAuthorization();
  if (!authorization) redirect("/login");
  return authorization;
}

export async function requirePageAccess(
  page: PageKey,
  required: PermissionLevel = "VIEW",
) {
  const authorization = await requireAuthorization();
  if (!canAccess(authorization, page, required)) {
    await auditPageDenial(authorization, page, required);
    redirect("/access-denied");
  }
  return authorization;
}

export async function auditPageDenial(
  authorization: AuthorizationContext,
  page: PageKey,
  required: PermissionLevel = "VIEW",
) {
  await safeWriteAudit({
    outcome: "DENIED",
    event: "PAGE_ACCESS",
    page,
    actorId: authorization.user.id,
    actorLabel: authorization.user.username ?? authorization.user.email,
    summary: "Page access denied by role permissions.",
    metadata: { required },
    request: await getAuditRequestContext(),
  });
}

const deniedPath: Record<PageKey, string> = {
  OVERVIEW: "/?error=You%20do%20not%20have%20permission%20to%20make%20that%20change.",
  REGISTERS: "/registers?error=You%20do%20not%20have%20permission%20to%20edit%20registers.",
  INVENTORY: "/inventory?error=You%20do%20not%20have%20permission%20to%20edit%20inventory.",
  STOCK: "/stock?error=You%20do%20not%20have%20permission%20to%20edit%20stock.",
  REPORTING: "/reporting",
  BILL_HISTORY: "/bill-history",
  SETTINGS: "/settings?error=Site%20administrator%20access%20is%20required.",
  AUDIT_LOG: "/settings/audit-log",
};

export async function requireActionAccess(page: PageKey, event: string) {
  const authorization = await getAuthorization();
  if (!authorization) {
    await safeWriteAudit({
      outcome: "DENIED",
      event,
      page,
      actorLabel: "anonymous",
      summary: "Unauthenticated mutation attempt denied.",
      request: await getAuditRequestContext(),
    });
    redirect("/login");
  }
  if (!canAccess(authorization, page, "EDIT")) {
    await safeWriteAudit({
      outcome: "DENIED",
      event,
      page,
      actorId: authorization.user.id,
      actorLabel: authorization.user.username ?? authorization.user.email,
      summary: "Mutation denied by role permissions.",
      request: await getAuditRequestContext(),
    });
    redirect(deniedPath[page]);
  }
  return authorization;
}

export async function requireSiteAdminAction(event: string) {
  const authorization = await getAuthorization();
  if (!authorization) redirect("/login");
  if (!authorization.user.isSiteAdmin) {
    await safeWriteAudit({
      outcome: "DENIED",
      event,
      page: "SETTINGS",
      actorId: authorization.user.id,
      actorLabel: authorization.user.username ?? authorization.user.email,
      summary: "Site administrator operation denied.",
      request: await getAuditRequestContext(),
    });
    redirect(deniedPath.SETTINGS);
  }
  return authorization;
}
