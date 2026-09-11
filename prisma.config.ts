import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";
import { normalizePostgresSslMode } from "./lib/postgres-url";

// Match Next.js local overrides; explicitly supplied CI/test variables still take precedence.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: normalizePostgresSslMode(env("NEON_DB")),
  },
});
