import "server-only";

import { Prisma, type RegisterPurpose } from "@/generated/prisma/client";

const REGISTER_CODE_LOCK = 1_240_611_833;

export async function createRegisterWithGeneratedCode(
  tx: Prisma.TransactionClient,
  input: { name: string; purpose: RegisterPurpose },
) {
  await tx.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(${REGISTER_CODE_LOCK}::BIGINT)
  `);
  const [sequence] = await tx.$queryRaw<Array<{ nextNumber: bigint }>>(Prisma.sql`
    SELECT (
      COALESCE(
        MAX(SUBSTRING("code" FROM '^REG-([0-9]+)$')::BIGINT),
        0
      ) + 1
    ) AS "nextNumber"
    FROM "cash_registers"
    WHERE "code" ~ '^REG-[0-9]+$'
  `);
  const nextNumber = sequence?.nextNumber ?? BigInt(1);
  const code = `REG-${nextNumber.toString().padStart(2, "0")}`;

  return tx.cashRegister.create({ data: { ...input, code } });
}
