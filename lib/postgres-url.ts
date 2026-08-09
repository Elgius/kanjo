const STRICT_SSL_ALIASES = new Set(["prefer", "require", "verify-ca"]);

export function normalizePostgresSslMode(connectionString: string) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode");

  if (sslMode && STRICT_SSL_ALIASES.has(sslMode)) {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}
