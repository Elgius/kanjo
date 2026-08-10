import "server-only";

import { headers } from "next/headers";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  auditCreateData,
  type AuditInput,
  type AuditRequestContext,
} from "@/lib/audit-core";

type AuditWriter = Pick<Prisma.TransactionClient, "auditLog">;

export type { AuditRequestContext } from "@/lib/audit-core";

export type { AuditInput } from "@/lib/audit-core";

export function auditRequestContextFromHeaders(
  source: Pick<Headers, "get">,
): AuditRequestContext {
  const forwardedFor = source.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwardedFor || source.get("x-real-ip") || undefined,
    userAgent: source.get("user-agent")?.slice(0, 500) || undefined,
  };
}

export async function getAuditRequestContext() {
  return auditRequestContextFromHeaders(await headers());
}

export async function writeAudit(db: AuditWriter, input: AuditInput) {
  return db.auditLog.create({ data: auditCreateData(input) });
}

export async function safeWriteAudit(input: AuditInput) {
  try {
    await writeAudit(prisma, input);
  } catch (error) {
    console.error("Unable to persist audit event", input.event, error);
  }
}
