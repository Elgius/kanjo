import type { Prisma } from "@/generated/prisma/client";
import type { AuditOutcome, PageKey } from "@/generated/prisma/enums";

const auditOutcomes = new Set<AuditOutcome>(["SUCCESS", "FAILURE", "DENIED"]);
const auditPages = new Set<PageKey>([
  "OVERVIEW",
  "REGISTERS",
  "INVENTORY",
  "STOCK",
  "REPORTING",
  "SETTINGS",
  "AUDIT_LOG",
]);

export type AuditRequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

export type AuditInput = {
  outcome: AuditOutcome;
  event: string;
  page?: PageKey;
  actorId?: string;
  actorLabel?: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  metadata?: unknown;
  request?: AuditRequestContext;
};

const sensitiveKey = /password|passcode|secret|token|cookie|authorization|credential/i;

export function sanitizeAuditMetadata(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value === null) return undefined;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeAuditMetadata(item))
      .filter((item): item is Prisma.InputJsonValue => item !== undefined);
  }
  if (typeof value === "object") {
    const sanitized: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (sensitiveKey.test(key)) continue;
      const safeValue = sanitizeAuditMetadata(item);
      if (safeValue !== undefined) sanitized[key] = safeValue;
    }
    return sanitized;
  }
  return String(value);
}

function flattenSearchValues(value: Prisma.InputJsonValue | undefined): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenSearchValues);
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => [key, ...flattenSearchValues(item)]);
  }
  return [String(value)];
}

export function buildAuditSearchText(parts: {
  event: string;
  page?: string | null;
  actorLabel?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return [
    parts.event,
    parts.page,
    parts.actorLabel,
    parts.targetType,
    parts.targetId,
    parts.summary,
    ...flattenSearchValues(parts.metadata),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .toLocaleLowerCase("en");
}

export function auditCreateData(input: AuditInput): Prisma.AuditLogUncheckedCreateInput {
  const metadata = sanitizeAuditMetadata(input.metadata);
  return {
    outcome: input.outcome,
    event: input.event,
    page: input.page,
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    targetType: input.targetType,
    targetId: input.targetId,
    summary: input.summary,
    metadata,
    ipAddress: input.request?.ipAddress,
    userAgent: input.request?.userAgent,
    searchText: buildAuditSearchText({
      event: input.event,
      page: input.page,
      actorLabel: input.actorLabel,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      metadata,
    }),
  };
}

export type AuditCursor = { occurredAt: string; id: string };

export function encodeAuditCursor(cursor: AuditCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeAuditCursor(value: string | undefined): AuditCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as AuditCursor;
    if (!parsed.id || Number.isNaN(new Date(parsed.occurredAt).getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseMaldivesDateBoundary(value: string | undefined, endExclusive = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00+05:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endExclusive) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export function normalizeAuditFilters(filters: {
  from?: string;
  to?: string;
  actor?: string;
  outcome?: string;
  event?: string;
  area?: string;
  targetType?: string;
  q?: string;
}) {
  const outcome = auditOutcomes.has(filters.outcome as AuditOutcome)
    ? (filters.outcome as AuditOutcome)
    : undefined;
  const page = auditPages.has(filters.area as PageKey)
    ? (filters.area as PageKey)
    : undefined;
  const clean = (value: string | undefined, length: number) =>
    value?.trim().slice(0, length) || undefined;

  return {
    from: parseMaldivesDateBoundary(filters.from),
    to: parseMaldivesDateBoundary(filters.to, true),
    actor: clean(filters.actor, 100),
    outcome,
    event: clean(filters.event, 100),
    page,
    targetType: clean(filters.targetType, 100),
    query: clean(filters.q, 100),
  };
}
