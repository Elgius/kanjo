import { prisma } from "@/lib/db";
import { CAPABILITY_KEYS, legacyPermissionProjection, PAGE_KEYS } from "@/lib/permissions";
import { seedProducts, seedRegisters } from "./seed-data";

const seedUser = {
  id: "stock-seed-user",
  name: "Stock Seed",
  email: "stock-seed@kanjo.invalid",
};

async function main() {
  const fullAccessProjection = legacyPermissionProjection(CAPABILITY_KEYS);
  const legacyPermissions = PAGE_KEYS.map((page) => ({ page, level: fullAccessProjection[page] }));
  const fullAccessRole = await prisma.role.upsert({
    where: { normalizedName: "full access" },
    update: {
      registerScopeMode: "ALL",
      capabilities: {
        createMany: {
          data: CAPABILITY_KEYS.map((capability) => ({ capability })),
          skipDuplicates: true,
        },
      },
    },
    create: {
      name: "Full Access",
      normalizedName: "full access",
      description: "Default role for seeded POS data.",
      registerScopeMode: "ALL",
      permissions: {
        create: legacyPermissions,
      },
      capabilities: { create: CAPABILITY_KEYS.map((capability) => ({ capability })) },
    },
    select: { id: true },
  });
  const actor = await prisma.user.upsert({
    where: { email: seedUser.email },
    update: { name: seedUser.name, roleId: fullAccessRole.id },
    create: { ...seedUser, roleId: fullAccessRole.id },
    select: { id: true },
  });

  const registerByCode = new Map<string, string>();
  for (const register of seedRegisters) {
    const stored = await prisma.cashRegister.upsert({
      where: { code: register.code },
      update: { name: register.name, active: true },
      create: register,
      select: { id: true, code: true },
    });
    registerByCode.set(stored.code, stored.id);
  }

  let createdProducts = 0;
  for (const fixture of seedProducts) {
    const { movements, registerCode, stockQuantity, ...productData } = fixture;
    const existing = await prisma.product.findUnique({
      where: { sku: fixture.sku },
      select: { id: true },
    });
    if (existing) continue;

    const registerId = registerByCode.get(registerCode);
    if (!registerId) throw new Error(`Missing register ${registerCode}`);
    await prisma.$transaction(async (tx) => {
      const category = await tx.productCategory.upsert({
        where: { normalizedName: productData.category.toLocaleLowerCase("en") },
        update: {},
        create: {
          name: productData.category,
          normalizedName: productData.category.toLocaleLowerCase("en"),
        },
      });
      const product = await tx.product.create({
        data: { ...productData, registerId, categoryId: category.id },
      });
      const measuredPerUnit = product.kind === "CONSUMABLE" ? Number(product.quantityValue) : 1;
      if (stockQuantity > 0) {
        await tx.inventoryBatch.create({ data: {
          productId: product.id, registerId, receivedById: actor.id,
          receivedQuantity: stockQuantity * measuredPerUnit,
          remainingQuantity: stockQuantity * measuredPerUnit,
          expiryDate: null,
        } });
      }
      await tx.inventoryMovement.createMany({
        data: movements.map((movement, index) => ({
          ...movement,
          quantityDelta: movement.quantityDelta * measuredPerUnit,
          balanceAfter: movement.balanceAfter * measuredPerUnit,
          productId: product.id,
          registerId,
          createdById: actor.id,
          createdAt: new Date(Date.UTC(2026, 7, 10, 3 + index, createdProducts * 4)),
        })),
      });
    });
    createdProducts += 1;
  }

  console.info(`Seed complete: ${seedRegisters.length} registers, ${createdProducts} new stock items.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
