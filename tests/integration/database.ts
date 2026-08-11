import { describe, mock } from "bun:test";

mock.module("server-only", () => ({}));

function databaseIdentity(value: string) {
  const url = new URL(value);
  return `${url.hostname.toLocaleLowerCase()}:${url.port || "5432"}${url.pathname}`;
}

const databaseTestsRequested = process.env.RUN_DB_TESTS === "1";
const configuredTestDatabaseUrl = process.env.TEST_NEON_DB;

if (databaseTestsRequested && !configuredTestDatabaseUrl) {
  throw new Error("RUN_DB_TESTS=1 requires TEST_NEON_DB. Production NEON_DB fallback is disabled.");
}

if (
  databaseTestsRequested &&
  configuredTestDatabaseUrl &&
  process.env.NEON_DB &&
  databaseIdentity(configuredTestDatabaseUrl) === databaseIdentity(process.env.NEON_DB)
) {
  throw new Error("TEST_NEON_DB must point to an isolated database branch, not NEON_DB.");
}

export const testDatabaseUrl = configuredTestDatabaseUrl;
export const databaseDescribe = databaseTestsRequested ? describe : describe.skip;
