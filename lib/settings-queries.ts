import "server-only";

import { prisma } from "@/lib/db";

export async function getSettingsAccounts() {
  return prisma.user.findMany({
    where: { accounts: { some: {} } },
    orderBy: [{ username: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      isSiteAdmin: true,
      createdAt: true,
      roleId: true,
      role: { select: { name: true } },
    },
  });
}

export async function getSettingsRoles() {
  return prisma.role.findMany({
    orderBy: { name: "asc" },
    include: {
      capabilities: true,
      registerAccess: {
        include: { register: { select: { id: true, code: true, name: true, active: true } } },
      },
      _count: { select: { users: true } },
    },
  });
}

export async function getSettingsRoleOptions() {
  return prisma.role.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
