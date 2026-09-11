import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type {
  CapabilityKey,
  PageKey,
  PermissionLevel,
} from "@/generated/prisma/enums";
import { safeWriteAudit, getAuditRequestContext } from "@/lib/audit";
import { getAuthorizationFromHeaders, type AuthorizationContext } from "@/lib/auth-context";
import { resolveLandingPath } from "@/lib/landing";
import { prisma } from "@/lib/db";
import type { OperationEvent } from "@/lib/operation-policies";
import { operationPolicy } from "@/lib/operation-policies";
import {
  CAPABILITY_BY_KEY,
  capabilityAllows,
  registerScopeAllows,
} from "@/lib/permissions";

export type { AuthorizationContext } from "@/lib/auth-context";
export const getAuthorization = cache(async () => getAuthorizationFromHeaders(await headers()));

export function can(authorization: AuthorizationContext, capability: CapabilityKey) {
  return capabilityAllows(authorization.user.isSiteAdmin, authorization.capabilities, capability);
}

export function canAccessRegister(authorization: AuthorizationContext, registerId: string) {
  return registerScopeAllows(
    authorization.user.isSiteAdmin,
    authorization.registerScopeMode,
    authorization.registerIds,
    registerId,
  );
}

/** `null` means no register predicate is required; an array must be applied with `in`. */
export function authorizedRegisterIds(authorization: AuthorizationContext): string[] | null {
  return authorization.user.isSiteAdmin || authorization.registerScopeMode === "ALL"
    ? null
    : Array.from(authorization.registerIds);
}

/** Compatibility name used by UI while page components migrate to exact capabilities. */
export function canAccess(
  authorization: AuthorizationContext,
  page: PageKey,
  required: PermissionLevel = "VIEW",
) {
  if (authorization.user.isSiteAdmin) return true;
  const definitions = Object.values(CAPABILITY_BY_KEY).filter(({ page: itemPage }) => itemPage === page);
  return definitions.some(({ key, mutation }) =>
    authorization.capabilities.has(key) && (required === "VIEW" || mutation),
  );
}

export function firstAccessiblePath(authorization: AuthorizationContext) {
  return resolveLandingPath(authorization);
}

export async function requireAuthorization() {
  const authorization = await getAuthorization();
  if (!authorization) redirect("/login");
  return authorization;
}

const deniedPath: Record<PageKey, string> = {
  OVERVIEW: "/access-denied",
  AI_COO: "/access-denied",
  REGISTERS: "/registers?error=You%20do%20not%20have%20permission%20for%20that%20register%20operation.",
  INVENTORY: "/inventory?error=You%20do%20not%20have%20permission%20for%20that%20inventory%20operation.",
  STOCK: "/stock?error=You%20do%20not%20have%20permission%20for%20that%20stock%20operation.",
  REPORTING: "/access-denied",
  BILL_HISTORY: "/bill-history?error=You%20do%20not%20have%20permission%20for%20that%20bill.",
  CUSTOMERS: "/customers?error=You%20do%20not%20have%20permission%20for%20that%20customer%20operation.",
  SETTINGS: "/settings?error=Site%20administrator%20access%20is%20required.",
  AUDIT_LOG: "/settings/audit-log",
};

async function deny(
  authorization: AuthorizationContext | null,
  capability: CapabilityKey,
  event: string,
  page: PageKey,
  metadata?: Record<string, unknown>,
): Promise<never> {
  await safeWriteAudit({
    outcome: "DENIED",
    event,
    page,
    actorId: authorization?.user.id,
    actorLabel: authorization
      ? authorization.user.username ?? authorization.user.email
      : "anonymous",
    summary: authorization ? "Operation denied by capability policy." : "Unauthenticated operation denied.",
    metadata: { requiredCapability: capability, ...metadata },
    request: await getAuditRequestContext(),
  });
  redirect(authorization ? (capability === "REGISTERS_VIEW" ? "/access-denied" : deniedPath[page]) : "/login");
}

export async function requireCapability(capability: CapabilityKey, event: string) {
  const authorization = await getAuthorization();
  const page = CAPABILITY_BY_KEY[capability].page;
  if (!authorization || !can(authorization, capability)) {
    return deny(authorization, capability, event, page);
  }
  return authorization;
}

export async function requireRegisterCapability(
  capability: CapabilityKey,
  registerId: string,
  event: string,
) {
  const register = await prisma.cashRegister.findUnique({
    where: { id: registerId },
    select: { id: true },
  });
  const authorization = await getAuthorization();
  const page = CAPABILITY_BY_KEY[capability].page;
  if (!register || !authorization || !can(authorization, capability) || !canAccessRegister(authorization, register.id)) {
    return deny(authorization, capability, event, page, { registerId });
  }
  return authorization;
}

export async function requireShiftOperation(
  capability: CapabilityKey,
  shiftId: string,
  event: string,
) {
  const shift = await prisma.registerShift.findUnique({
    where: { id: shiftId },
    select: { id: true, registerId: true, openedById: true },
  });
  const authorization = await getAuthorization();
  const page = CAPABILITY_BY_KEY[capability].page;
  const ownsShift = shift?.openedById === authorization?.user.id;
  const canOverride = authorization ? can(authorization, "SHIFT_OVERRIDE") : false;
  if (
    !shift
    || !authorization
    || !can(authorization, capability)
    || !canAccessRegister(authorization, shift.registerId)
    || (!ownsShift && !canOverride)
  ) {
    return deny(authorization, capability, event, page, {
      shiftId,
      registerId: shift?.registerId,
      ownershipRequired: true,
    });
  }
  return { authorization, shift };
}

export type RegisterEntity = "product" | "batch" | "menuItem" | "restaurantTable" | "order" | "creditBill";

export async function requireEntityRegisterCapability(
  capability: CapabilityKey,
  entity: RegisterEntity,
  entityId: string,
  event: string,
) {
  let record: { registerId: string } | null = null;
  if (entity === "product") {
    record = await prisma.product.findUnique({ where: { id: entityId }, select: { registerId: true } });
  } else if (entity === "batch") {
    record = await prisma.inventoryBatch.findUnique({ where: { id: entityId }, select: { registerId: true } });
  } else if (entity === "menuItem") {
    record = await prisma.menuItem.findUnique({ where: { id: entityId }, select: { registerId: true } });
  } else if (entity === "restaurantTable") {
    record = await prisma.restaurantTable.findUnique({ where: { id: entityId }, select: { registerId: true } });
  } else if (entity === "order") {
    record = await prisma.registerOrder.findUnique({
      where: { id: entityId },
      select: { registerShift: { select: { registerId: true } } },
    }).then((order) => order?.registerShift ?? null);
  } else {
    record = await prisma.customerCreditBill.findUnique({ where: { id: entityId }, select: { registerId: true } });
  }
  if (!record) {
    const authorization = await getAuthorization();
    return deny(authorization, capability, event, CAPABILITY_BY_KEY[capability].page, {
      entity,
      entityId,
      reason: "RESOURCE_NOT_FOUND",
    });
  }
  const authorization = await requireRegisterCapability(capability, record.registerId, event);
  return { authorization, registerId: record.registerId };
}

export async function requireCreditSettlementOperation(creditBillId: string, event: OperationEvent) {
  const policy = operationPolicy(event);
  if (policy.scope !== "ENTITY" || policy.capability !== "CUSTOMER_CREDIT_SETTLE") {
    throw new Error(`Operation ${event} is not a credit settlement policy.`);
  }
  const bill = await prisma.customerCreditBill.findUnique({
    where: { id: creditBillId },
    select: {
      registerId: true,
      register: {
        select: {
          shifts: {
            where: { status: "OPEN" },
            orderBy: { openedAt: "desc" },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });
  if (!bill?.register.shifts[0]) {
    const authorization = await getAuthorization();
    return deny(authorization, policy.capability, event, policy.page, {
      creditBillId,
      registerId: bill?.registerId,
      reason: bill ? "NO_OPEN_SHIFT" : "RESOURCE_NOT_FOUND",
    });
  }
  const result = await requireShiftOperation(
    policy.capability,
    bill.register.shifts[0].id,
    event,
  );
  return { ...result, registerId: bill.registerId };
}

export async function requireOperation(event: OperationEvent, resourceId?: string) {
  const policy = operationPolicy(event);
  if ("siteAdmin" in policy) return requireSiteAdminAction(event);
  if (policy.scope === "GLOBAL") return requireCapability(policy.capability, event);
  if (policy.scope === "REGISTER" && resourceId) {
    return requireRegisterCapability(policy.capability, resourceId, event);
  }
  if (policy.scope === "SHIFT" && resourceId) {
    return requireShiftOperation(policy.capability, resourceId, event);
  }
  throw new Error(`Operation ${event} requires a trusted resource identifier.`);
}

export async function requireGlobalOperation(event: OperationEvent) {
  const policy = operationPolicy(event);
  if ("siteAdmin" in policy) throw new Error(`Operation ${event} requires site administration.`);
  if (policy.scope !== "GLOBAL") throw new Error(`Operation ${event} is not global.`);
  const authorization = await requireCapability(policy.capability, event);
  if (
    event === "REGISTER_CREATE"
    && !authorization.user.isSiteAdmin
    && authorization.registerScopeMode !== "ALL"
  ) {
    return deny(authorization, policy.capability, event, policy.page, {
      reason: "ALL_REGISTER_SCOPE_REQUIRED",
    });
  }
  return authorization;
}

export async function requireRegisterOperation(event: OperationEvent, registerId: string) {
  const policy = operationPolicy(event);
  if ("siteAdmin" in policy) throw new Error(`Operation ${event} requires site administration.`);
  if (policy.scope !== "REGISTER") throw new Error(`Operation ${event} is not register-scoped.`);
  return requireRegisterCapability(policy.capability, registerId, event);
}

export async function requireShiftPolicy(event: OperationEvent, shiftId: string) {
  const policy = operationPolicy(event);
  if ("siteAdmin" in policy) throw new Error(`Operation ${event} requires site administration.`);
  if (policy.scope !== "SHIFT") throw new Error(`Operation ${event} is not shift-scoped.`);
  return requireShiftOperation(policy.capability, shiftId, event);
}

export async function requireEntityOperation(
  event: OperationEvent,
  entity: RegisterEntity,
  entityId: string,
) {
  const policy = operationPolicy(event);
  if ("siteAdmin" in policy) throw new Error(`Operation ${event} requires site administration.`);
  if (policy.scope !== "ENTITY") throw new Error(`Operation ${event} is not entity-scoped.`);
  return requireEntityRegisterCapability(policy.capability, entity, entityId, event);
}

export async function auditPageDenial(
  authorization: AuthorizationContext,
  page: PageKey,
  required: PermissionLevel = "VIEW",
) {
  await safeWriteAudit({
    outcome: "DENIED",
    event: "PAGE_ACCESS",
    page,
    actorId: authorization.user.id,
    actorLabel: authorization.user.username ?? authorization.user.email,
    summary: "Page access denied by capability policy.",
    metadata: { requiredLegacyLevel: required },
    request: await getAuditRequestContext(),
  });
}

export async function requireSiteAdminAction(event: OperationEvent) {
  const policy = operationPolicy(event);
  if (!("siteAdmin" in policy)) throw new Error(`Operation ${event} is governed by a capability.`);
  const authorization = await getAuthorization();
  if (!authorization) redirect("/login");
  if (!authorization.user.isSiteAdmin) {
    await safeWriteAudit({
      outcome: "DENIED",
      event,
      page: policy.page,
      actorId: authorization.user.id,
      actorLabel: authorization.user.username ?? authorization.user.email,
      summary: "Site administrator operation denied.",
      request: await getAuditRequestContext(),
    });
    redirect(deniedPath[policy.page]);
  }
  return authorization;
}
