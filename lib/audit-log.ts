import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  decodeAuditCursor,
  encodeAuditCursor,
  normalizeAuditFilters,
} from "@/lib/audit-core";

export type AuditLogFilters = {
  from?: string;
  to?: string;
  actor?: string;
  outcome?: string;
  event?: string;
  area?: string;
  targetType?: string;
  q?: string;
  after?: string;
  before?: string;
};

function keyCondition(
  occurredAt: Date,
  id: string,
  direction: "newer" | "older",
): Prisma.AuditLogWhereInput {
  const comparison = direction === "newer" ? "gt" : "lt";
  return {
    OR: [
      { occurredAt: { [comparison]: occurredAt } },
      { occurredAt, id: { [comparison]: id } },
    ],
  };
}

function auditWhere(filters: AuditLogFilters): Prisma.AuditLogWhereInput {
  const { from, to, actor, outcome, event, page, targetType, query } =
    normalizeAuditFilters(filters);

  return {
    ...(from || to
      ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
      : {}),
    ...(actor ? { actorId: actor } : {}),
    ...(outcome ? { outcome } : {}),
    ...(event ? { event } : {}),
    ...(page ? { page } : {}),
    ...(targetType ? { targetType } : {}),
    ...(query ? { searchText: { contains: query, mode: "insensitive" } } : {}),
  };
}

export async function getAuditLogPage(filters: AuditLogFilters) {
  const baseWhere = auditWhere(filters);
  const before = decodeAuditCursor(filters.before);
  const after = before ? null : decodeAuditCursor(filters.after);
  const cursor = before ?? after;
  const direction = before ? "newer" : "older";
  const where: Prisma.AuditLogWhereInput = cursor
    ? {
        AND: [
          baseWhere,
          keyCondition(new Date(cursor.occurredAt), cursor.id, direction),
        ],
      }
    : baseWhere;

  const fetched = await prisma.auditLog.findMany({
    where,
    orderBy:
      direction === "newer"
        ? [{ occurredAt: "asc" }, { id: "asc" }]
        : [{ occurredAt: "desc" }, { id: "desc" }],
    take: 50,
    select: {
      id: true,
      occurredAt: true,
      outcome: true,
      event: true,
      page: true,
      actorId: true,
      actorLabel: true,
      targetType: true,
      targetId: true,
      summary: true,
      metadata: true,
      ipAddress: true,
    },
  });
  const rows = direction === "newer" ? fetched.reverse() : fetched;
  const first = rows[0];
  const last = rows.at(-1);

  const [newer, older] = await Promise.all([
    first
      ? prisma.auditLog.findFirst({
          where: { AND: [baseWhere, keyCondition(first.occurredAt, first.id, "newer")] },
          select: { id: true },
        })
      : null,
    last
      ? prisma.auditLog.findFirst({
          where: { AND: [baseWhere, keyCondition(last.occurredAt, last.id, "older")] },
          select: { id: true },
        })
      : null,
  ]);

  return {
    rows,
    previousCursor:
      newer && first
        ? encodeAuditCursor({ occurredAt: first.occurredAt.toISOString(), id: first.id })
        : null,
    nextCursor:
      older && last
        ? encodeAuditCursor({ occurredAt: last.occurredAt.toISOString(), id: last.id })
        : null,
  };
}

export async function getAuditFilterOptions() {
  const [actors, events, targetTypes] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ username: "asc" }, { email: "asc" }],
      select: { id: true, username: true, email: true },
    }),
    prisma.auditLog.findMany({
      distinct: ["event"],
      orderBy: { event: "asc" },
      select: { event: true },
    }),
    prisma.auditLog.findMany({
      where: { targetType: { not: null } },
      distinct: ["targetType"],
      orderBy: { targetType: "asc" },
      select: { targetType: true },
    }),
  ]);
  return {
    actors,
    events: events.map((entry) => entry.event),
    targetTypes: targetTypes.flatMap((entry) => (entry.targetType ? [entry.targetType] : [])),
  };
}
