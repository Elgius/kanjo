"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAuditRequestContext, safeWriteAudit, writeAudit } from "@/lib/audit";
import { requireActionAccess, type AuthorizationContext } from "@/lib/authorization";
import { PosError, recordSale } from "@/lib/pos/sales";
import { createRegisterWithGeneratedCode } from "@/lib/pos/registers";
import {
  parseClosingCash,
  parseOpeningCash,
  parseRegisterForm,
  parseSaleForm,
} from "@/lib/pos/validation";

function registersRedirect(kind: "success" | "error", message: string, registerId?: string): never {
  const params = new URLSearchParams({ [kind]: message });
  redirect(registerId
    ? `/registers/${registerId}?${params.toString()}`
    : `/registers?${params.toString()}`);
}

function refreshRegisters(registerId?: string) {
  revalidatePath("/registers");
  if (registerId) revalidatePath(`/registers/${registerId}`);
  revalidatePath("/inventory");
  revalidatePath("/stock");
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
  const authorization = await requireActionAccess("REGISTERS", "REGISTER_CREATE");
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
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "That register name already exists."
      : "The register could not be created.";
    await auditFailure(authorization, "REGISTER_CREATE", message, parsed.data);
    registersRedirect("error", message);
  }

  refreshRegisters(register.id);
  registersRedirect("success", "Register added.", register.id);
}

export async function openShiftAction(registerId: string, formData: FormData) {
  const authorization = await requireActionAccess("REGISTERS", "SHIFT_OPEN");
  const parsed = parseOpeningCash(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "SHIFT_OPEN", parsed.error, { registerId });
    registersRedirect("error", parsed.error, registerId);
  }

  try {
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
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
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "This register already has an open shift."
      : "The shift could not be opened.";
    await auditFailure(authorization, "SHIFT_OPEN", message, { registerId });
    registersRedirect("error", message, registerId);
  }

  refreshRegisters(registerId);
  registersRedirect("success", "Shift opened.", registerId);
}

export async function closeShiftAction(shiftId: string, registerId: string, formData: FormData) {
  const authorization = await requireActionAccess("REGISTERS", "SHIFT_CLOSE");
  const parsed = parseClosingCash(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "SHIFT_CLOSE", parsed.error, { shiftId, registerId });
    registersRedirect("error", parsed.error, registerId);
  }

  try {
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.registerShift.updateMany({
        where: { id: shiftId, registerId, status: "OPEN" },
        data: {
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
        metadata: { registerId, closingCashLaari: parsed.data.closingCashLaari },
        request,
      });
    });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The shift could not be closed.";
    await auditFailure(authorization, "SHIFT_CLOSE", message, { shiftId, registerId });
    registersRedirect("error", message, registerId);
  }

  refreshRegisters(registerId);
  registersRedirect("success", "Shift closed.", registerId);
}

export async function recordSaleAction(shiftId: string, registerId: string, formData: FormData) {
  const authorization = await requireActionAccess("REGISTERS", "SALE_RECORD");
  const parsed = parseSaleForm(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "SALE_RECORD", parsed.error, { shiftId, registerId });
    registersRedirect("error", parsed.error, registerId);
  }

  let receiptNumber: bigint;
  try {
    const sale = await recordSale(prisma, {
      shiftId,
      createdById: authorization.user.id,
      paymentMethod: parsed.data.paymentMethod,
      items: parsed.data.items,
      audit: {
        actorLabel: actorLabel(authorization),
        request: await getAuditRequestContext(),
      },
    });
    receiptNumber = sale.receiptNumber;
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The sale could not be recorded.";
    await auditFailure(authorization, "SALE_RECORD", message, { shiftId, registerId });
    registersRedirect("error", message, registerId);
  }

  refreshRegisters(registerId);
  registersRedirect("success", `Receipt #${receiptNumber} recorded.`, registerId);
}
