import "server-only";

import type { Prisma } from "@/generated/prisma/client";

export async function getRegisterAdditionalBillCostRates(
  tx: Prisma.TransactionClient,
  registerId: string,
) {
  return tx.additionalBillCost.findMany({
    where: { registerId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      percentageBasisPoints: true,
      flatAmountLaari: true,
    },
  });
}
