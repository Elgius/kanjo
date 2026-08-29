import "server-only";

import { prisma } from "@/lib/db";

const dependencyCount = {
  shifts: true,
  products: true,
  menuItems: true,
  restaurantTables: true,
  customerCreditBills: true,
  stockMovements: true,
  batches: true,
} as const;

export type RegisterAdministrationStatus = "ALL" | "ACTIVE" | "ARCHIVED";

export async function getRegisterAdministrationData(
  status: RegisterAdministrationStatus = "ALL",
  authorizedRegisterIds: readonly string[] | null = null,
) {
  const registers = await prisma.cashRegister.findMany({
    where: {
      ...(authorizedRegisterIds ? { id: { in: Array.from(authorizedRegisterIds) } } : {}),
      ...(status === "ACTIVE" ? { active: true } : status === "ARCHIVED" ? { active: false } : {}),
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      purpose: true,
      active: true,
      updatedAt: true,
      shifts: { where: { status: "OPEN" }, take: 1, select: { id: true } },
      _count: { select: dependencyCount },
    },
  });

  return registers.map((register) => {
    const usageCount = Object.values(register._count).reduce((total, count) => total + count, 0);
    return {
      ...register,
      hasOpenShift: register.shifts.length > 0,
      usageCount,
      canChangePurpose: usageCount === 0,
      canDelete: usageCount === 0,
    };
  });
}

export async function getAdditionalBillCosts(
  authorizedRegisterIds: readonly string[] | null = null,
) {
  return prisma.additionalBillCost.findMany({
    where: authorizedRegisterIds
      ? { registerId: { in: Array.from(authorizedRegisterIds) } }
      : undefined,
    orderBy: [
      { register: { name: "asc" } },
      { name: "asc" },
    ],
    select: {
      id: true,
      registerId: true,
      name: true,
      type: true,
      percentageBasisPoints: true,
      flatAmountLaari: true,
      register: { select: { name: true, code: true } },
    },
  });
}
