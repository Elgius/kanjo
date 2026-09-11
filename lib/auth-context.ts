import "server-only";

import type { CapabilityKey, PageKey, PermissionLevel, RegisterScopeMode } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { capabilitiesFromLegacyPermissions, PAGE_KEYS } from "@/lib/permissions";

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
  capabilities: ReadonlySet<CapabilityKey>;
  registerScopeMode: RegisterScopeMode;
  registerIds: ReadonlySet<string>;
  /** Kept during the additive rollout for rollback diagnostics only. */
  permissions: Record<PageKey, PermissionLevel>;
};

export async function getAuthorizationFromHeaders(requestHeaders: Headers): Promise<AuthorizationContext | null> {
  const session = await auth.api.getSession({ headers: requestHeaders, query: { disableCookieCache: true } });
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
      registerScopeMode: true,
      registerAccess: { select: { registerId: true } },
      role: {
        select: {
          name: true,
          permissions: { select: { page: true, level: true } },
          capabilities: { select: { capability: true } },
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

  // Roles without capability rows retain their legacy permission mapping.
  const storedCapabilities = user.role.capabilities.map(({ capability }) => capability);
  const capabilities = new Set(
    storedCapabilities.length
      ? storedCapabilities
      : capabilitiesFromLegacyPermissions(user.role.permissions),
  );

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
    capabilities,
    registerScopeMode: user.registerScopeMode,
    registerIds: new Set(user.registerAccess.map(({ registerId }) => registerId)),
    permissions,
  };
}
