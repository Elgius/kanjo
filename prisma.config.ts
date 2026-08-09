import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { normalizePostgresSslMode } from "./lib/postgres-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: normalizePostgresSslMode(env("NEON_DB")),
  },
});
