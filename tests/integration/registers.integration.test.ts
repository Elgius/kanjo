import { afterAll, beforeAll, expect, test } from "bun:test";

import type { PrismaClient } from "@/generated/prisma/client";
import { databaseDescribe, testDatabaseUrl } from "@/tests/integration/database";

databaseDescribe("generated register codes", () => {
  let db: PrismaClient;
  let createRegisterWithGeneratedCode: typeof import("@/lib/pos/registers").createRegisterWithGeneratedCode;
  const marker = `generated-register-${crypto.randomUUID()}`;

  beforeAll(async () => {
    process.env.NEON_DB = testDatabaseUrl;
    ({ prisma: db } = await import("@/lib/db"));
    ({ createRegisterWithGeneratedCode } = await import("@/lib/pos/registers"));
  });

  afterAll(async () => {
    if (!db) return;
    await db.cashRegister.deleteMany({ where: { name: { startsWith: marker } } });
  });

  test("allocates consecutive unique codes for simultaneous creates", async () => {
    const created = await Promise.all([
      db.$transaction((tx) => createRegisterWithGeneratedCode(tx, { name: `${marker}-one`, purpose: "SHOP" })),
      db.$transaction((tx) => createRegisterWithGeneratedCode(tx, { name: `${marker}-two`, purpose: "RESTAURANT" })),
    ]);
    const codeNumbers = created
      .map((register) => Number(register.code.replace("REG-", "")))
      .sort((left, right) => left - right);

    expect(created[0]?.code === created[1]?.code).toBe(false);
    expect(created.every((register) => /^REG-\d{2,}$/.test(register.code))).toBe(true);
    expect(codeNumbers[1] - codeNumbers[0]).toBe(1);
  });
});
