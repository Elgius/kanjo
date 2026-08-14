import "server-only";

import { Prisma } from "@/generated/prisma/client";

const PRODUCT_SKU_LOCK = 1_240_611_834;

export async function createProductWithGeneratedSku(
  tx: Prisma.TransactionClient,
  data: Omit<Prisma.ProductUncheckedCreateInput, "sku">,
) {
  await tx.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(${PRODUCT_SKU_LOCK}::BIGINT)
  `);
  const [sequence] = await tx.$queryRaw<Array<{ nextNumber: bigint }>>(Prisma.sql`
    SELECT (
      COALESCE(
        MAX(SUBSTRING("sku" FROM '^SKU-([0-9]+)$')::BIGINT),
        0
      ) + 1
    ) AS "nextNumber"
    FROM "products"
    WHERE "sku" ~ '^SKU-[0-9]+$'
  `);
  const nextNumber = sequence?.nextNumber ?? BigInt(1);
  const sku = `SKU-${nextNumber.toString().padStart(6, "0")}`;

  return tx.product.create({ data: { ...data, sku } });
}
