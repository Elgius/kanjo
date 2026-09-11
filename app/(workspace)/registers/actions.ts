"use server";
import { mutateOnce, requestKey, MutationError } from "@/lib/pos/mutation";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { getRegisterRedirect } from "@/lib/register-navigation";

import { cashVarianceThreshold } from "@/lib/pos/safeguards";
import { parseMvr } from "@/lib/pos/money";
import { prisma } from "@/lib/db";
import { getAuditRequestContext, safeWriteAudit, writeAudit } from "@/lib/audit";
import {
  requireGlobalOperation,
  requireRegisterOperation,
  requireShiftPolicy,
  type AuthorizationContext,
} from "@/lib/authorization";
import { PosError, recordSale } from "@/lib/pos/sales";
import { createRegisterWithGeneratedCode } from "@/lib/pos/registers";
import {
  parseClosingCash,
  parseOpeningCash,
  parseRegisterForm,
  parseSaleForm,
} from "@/lib/pos/validation";

async function getRegistersRedirect() {
  const result = await getRegisterRedirect();
  return (kind: "success" | "error", message: string, registerId?: string): never => result(registerId, kind, message);
}

function refreshRegisters(registerId?: string) {
  revalidatePath("/live_register", "layout");
  revalidatePath("/registers");
  if (registerId) {
    revalidatePath(`/registers/${registerId}`);
    revalidatePath(`/registers/${registerId}/restaurant`);
  }
  revalidatePath("/inventory");
  revalidatePath("/stock");
  revalidatePath("/bill-history");
  revalidatePath("/");
  revalidatePath("/", "layout");
}

function actorLabel(authorization: AuthorizationContext) {
  return authorization.user.username ?? authorization.user.email;
}

async function auditFailure(
  authorization: AuthorizationContext,
  event: string,
  summary: string,
  metadata?: unknown,
) {
  await safeWriteAudit({
    outcome: "FAILURE",
    event,
    page: "REGISTERS",
    actorId: authorization.user.id,
    actorLabel: actorLabel(authorization),
    summary,
    metadata,
    request: await getAuditRequestContext(),
  });
}

export async function createRegisterAction(formData: FormData) {
  const registersRedirect: Awaited<ReturnType<typeof getRegistersRedirect>> = await getRegistersRedirect();
  const authorization = await requireGlobalOperation("REGISTER_CREATE");
  const parsed = parseRegisterForm(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "REGISTER_CREATE", parsed.error);
    registersRedirect("error", parsed.error);
  }

  let register;
  try {
    const request = await getAuditRequestContext();
    register = await prisma.$transaction(async (tx) => {
      const created = await createRegisterWithGeneratedCode(tx, parsed.data);
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "REGISTER_CREATE",
        page: "REGISTERS",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "register",
        targetId: created.id,
        summary: `Register ${created.name} created.`,
        metadata: { code: created.code, purpose: created.purpose },
        request,
      });
      return created;
    });
  } catch (error) {
    const message = error instanceof MutationError ? error.message : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "That register name already exists."
      : "The register could not be created.";
    await auditFailure(authorization, "REGISTER_CREATE", message, parsed.data);
    registersRedirect("error", message);
  }

  refreshRegisters(register.id);
  registersRedirect("success", "Register added.", register.id);
}

export async function openShiftAction(registerId: string, formData: FormData) {
  const registersRedirect: Awaited<ReturnType<typeof getRegistersRedirect>> = await getRegistersRedirect();
  const authorization = await requireRegisterOperation("SHIFT_OPEN", registerId);
  const parsed = parseOpeningCash(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "SHIFT_OPEN", parsed.error, { registerId });
    registersRedirect("error", parsed.error, registerId);
  }

  try {
    const request = await getAuditRequestContext();
    await mutateOnce(prisma, `open:${authorization.user.id}:${registerId}`, requestKey(formData), { ...parsed.data }, async (tx) => {
      const shift = await tx.registerShift.create({
        data: { registerId, openedById: authorization.user.id, openingCashLaari: parsed.data.openingCashLaari },
      });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "SHIFT_OPEN",
        page: "REGISTERS",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "register_shift",
        targetId: shift.id,
        summary: "Register shift opened.",
        metadata: { registerId, openingCashLaari: parsed.data.openingCashLaari },
        request,
      });
    });
  } catch (error) {
    const message = error instanceof MutationError ? error.message : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "This register already has an open shift."
      : "The shift could not be opened.";
    await auditFailure(authorization, "SHIFT_OPEN", message, { registerId });
    registersRedirect("error", message, registerId);
  }

  refreshRegisters(registerId);
  registersRedirect("success", "Shift opened.", registerId);
}

export async function closeShiftAction(shiftId: string, registerId: string, formData: FormData) {
  const registersRedirect: Awaited<ReturnType<typeof getRegistersRedirect>> = await getRegistersRedirect();
  const { authorization, shift } = await requireShiftPolicy("SHIFT_CLOSE", shiftId);
  if (shift.registerId !== registerId) registersRedirect("error", "That shift does not belong to this register.", shift.registerId);
  const parsed = parseClosingCash(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "SHIFT_CLOSE", parsed.error, { shiftId, registerId });
    registersRedirect("error", parsed.error, registerId);
  }

  try {
    const request = await getAuditRequestContext();
    await mutateOnce(prisma, `close:${authorization.user.id}:${registerId}`, requestKey(formData), { ...parsed.data, shiftId, reviewedExpectedCash: formData.get("reviewedExpectedCash"), cashVarianceReason: formData.get("cashVarianceReason") }, async (tx) => {
      const current = await tx.registerShift.findUnique({ where: { id: shiftId }, select: { openingCashLaari: true } });
      const cash = await tx.sale.aggregate({ where: { registerShiftId: shiftId, status: "COMPLETED", paymentMethod: "CASH" }, _sum: { totalLaari: true } });
      const expectedCashLaari = (current?.openingCashLaari ?? 0) + (cash._sum.totalLaari ?? 0);
      if (formData.get("reviewedExpectedCash") !== String(expectedCashLaari)) throw new PosError("The cash balance changed or has not been reviewed. Review your cash count again.");
      const cashVarianceLaari = parsed.data.closingCashLaari - expectedCashLaari;
      const cashVarianceReason = String(formData.get("cashVarianceReason") ?? "").trim();
      if (cashVarianceReason.length > 500 || (Math.abs(cashVarianceLaari) > cashVarianceThreshold() && cashVarianceReason.length < 5)) throw new PosError("Explain the cash difference (5–500 characters) before closing.");
      const heldOrderCount = await tx.registerOrder.count({
        where: { registerShiftId: shiftId, status: "HELD" },
      });
      if (heldOrderCount > 0) {
        throw new PosError(
          `Complete or cancel ${heldOrderCount} held ${heldOrderCount === 1 ? "bill" : "bills"} before closing this shift.`,
        );
      }
      const updated = await tx.registerShift.updateMany({
        where: { id: shiftId, registerId, status: "OPEN" },
        data: {
          expectedCashLaari, cashVarianceLaari, cashVarianceReason: cashVarianceReason || null,
          status: "CLOSED",
          closedById: authorization.user.id,
          closingCashLaari: parsed.data.closingCashLaari,
          closedAt: new Date(),
        },
      });
      if (updated.count !== 1) throw new PosError("That shift is no longer open.");
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "SHIFT_CLOSE",
        page: "REGISTERS",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "register_shift",
        targetId: shiftId,
        summary: "Register shift closed.",
        metadata: { registerId, closingCashLaari: parsed.data.closingCashLaari, expectedCashLaari, cashVarianceLaari, cashVarianceReason },
        request,
      });
    });
  } catch (error) {
    const message = error instanceof PosError || error instanceof MutationError ? error.message : "The shift could not be closed.";
    await auditFailure(authorization, "SHIFT_CLOSE", message, { shiftId, registerId });
    registersRedirect("error", message, registerId);
  }

  refreshRegisters(registerId);
  registersRedirect("success", "Shift closed.", registerId);
}

export async function recordSaleAction(shiftId: string, registerId: string, formData: FormData) {
  const registersRedirect: Awaited<ReturnType<typeof getRegistersRedirect>> = await getRegistersRedirect();
  const { authorization, shift } = await requireShiftPolicy("SALE_RECORD", shiftId);
  if (shift.registerId !== registerId) registersRedirect("error", "That shift does not belong to this register.", shift.registerId);
  const parsed = parseSaleForm(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "SALE_RECORD", parsed.error, { shiftId, registerId });
    registersRedirect("error", parsed.error, registerId);
  }

  let completedSale: { id: string; receiptNumber: bigint };
  try {
    const sale = await recordSale(prisma, {
      requestId: requestKey(formData),
      shiftId,
      createdById: authorization.user.id,
      cashierName: authorization.user.name,
      paymentMethod: parsed.data.paymentMethod,
      items: parsed.data.items,
      audit: {
        actorLabel: actorLabel(authorization),
        request: await getAuditRequestContext(),
      },
    });
    completedSale = { id: sale.id, receiptNumber: sale.receiptNumber };
  } catch (error) {
    const message = error instanceof PosError || error instanceof MutationError ? error.message : "The sale could not be recorded.";
    await auditFailure(authorization, "SALE_RECORD", message, { shiftId, registerId });
    registersRedirect("error", message, registerId);
  }

  refreshRegisters(registerId);
  const params = new URLSearchParams({
    success: `Receipt #${completedSale.receiptNumber} recorded.`,
    receipt: completedSale.id,
  });
  const result = await getRegisterRedirect();
  result(registerId, "success", params.get("success") ?? "Sale recorded.", Object.fromEntries(params));
}

export async function reviewClosingCashAction(shiftId: string, registerId: string, count: string) {
  const { shift } = await requireShiftPolicy("SHIFT_CLOSE", shiftId);
  if (shift.registerId !== registerId) return { ok: false as const, error: "That shift does not belong to this register." };
  const counted = parseMvr(count);
  if (counted === null || counted > 2147483647) return { ok: false as const, error: "Enter a valid cash count." };
  const current = await prisma.registerShift.findUnique({ where: { id: shiftId } });
  if (!current || current.status !== "OPEN") return { ok: false as const, error: "That shift is no longer open." };
  const held = await prisma.registerOrder.count({ where: { registerShiftId: shiftId, status: "HELD" } });
  if (held) return { ok: false as const, error: "Held bills remain. Reload and resolve them before closing." };
  const cash = await prisma.sale.aggregate({ where: { registerShiftId: shiftId, status: "COMPLETED", paymentMethod: "CASH" }, _sum: { totalLaari: true } });
  const expectedCashLaari = current.openingCashLaari + (cash._sum.totalLaari ?? 0);
  return { ok: true as const, expectedCashLaari, varianceLaari: counted - expectedCashLaari, thresholdLaari: cashVarianceThreshold() };
}
