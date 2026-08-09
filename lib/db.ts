import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { normalizePostgresSslMode } from "@/lib/postgres-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.NEON_DB;

  if (!connectionString) {
    throw new Error("NEON_DB is not set");
  }

  const adapter = new PrismaPg({
    connectionString: normalizePostgresSslMode(connectionString),
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
