import "server-only";

import { prisma } from "@/lib/db";
import { capabilitiesFromLegacyPermissions } from "@/lib/permissions";

export async function getSettingsAccounts() {
  return prisma.user.findMany({
    where: { accounts: { some: {} } },
    orderBy: [{ username: "asc" }, { email: "asc" }],
    select: {
      id: true, name: true, email: true, username: true, isSiteAdmin: true,
      createdAt: true, roleId: true, registerScopeMode: true,
      registerAccess: { select: { registerId: true, register: { select: { name: true, active: true } } } },
      role: { select: { name: true, workspace: true } },
    },
  });
}

export async function getSettingsRoles() {
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: { capabilities: true, permissions: true, _count: { select: { users: true } } },
  });
  return roles.map((role) => ({ ...role, effectiveCapabilities: role.capabilities.length ? role.capabilities.map(({ capability }) => capability) : capabilitiesFromLegacyPermissions(role.permissions) }));
}

export async function getSettingsRoleOptions() {
  const roles = await getSettingsRoles();
  return roles.map(({ id, name, workspace, effectiveCapabilities }) => ({ id, name, workspace, capabilities: effectiveCapabilities }));
}

export async function getSettingsRegisterOptions() {
  return prisma.cashRegister.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, code: true, active: true },
  });
}
