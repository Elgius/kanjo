"use server";

import { Prisma } from "@/generated/prisma/client";
import type { RegisterPurpose } from "@/generated/prisma/enums";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuditRequestContext, safeWriteAudit, writeAudit } from "@/lib/audit";
import { requireRegisterCapability, requireRegisterOperation, type AuthorizationContext } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { parseAdditionalBillCostForm } from "@/lib/pos/additional-bill-costs";
import { PosError } from "@/lib/pos/sales";

function editRedirect(kind: "success" | "error", message: string): never {
  redirect(`/registers/edit?${kind}=${encodeURIComponent(message)}`);
}

function refreshRegisterManagement(registerId?: string) {
  revalidatePath("/registers/edit");
  revalidatePath("/registers");
  revalidatePath("/registers/sessions");
  if (registerId) revalidatePath(`/registers/${registerId}`);
  revalidatePath("/inventory");
  revalidatePath("/");
  revalidatePath("/", "layout");
}

const dependencyCount = {
  shifts: true,
  products: true,
  menuItems: true,
  restaurantTables: true,
  customerCreditBills: true,
  stockMovements: true,
  batches: true,
} as const;

function hasDependencies(counts: Record<keyof typeof dependencyCount, number>) {
  return Object.values(counts).some((count) => count > 0);
}

async function failure(
  authorization: AuthorizationContext,
  event: string,
  registerId: string,
  summary: string,
) {
  await safeWriteAudit({
    outcome: "FAILURE", event, page: "REGISTERS", actorId: authorization.user.id,
    actorLabel: authorization.user.username ?? authorization.user.email,
    targetType: "register", targetId: registerId, summary, request: await getAuditRequestContext(),
  });
}

export async function renameRegisterAction(registerId: string, formData: FormData) {
  const authorization = await requireRegisterOperation("REGISTER_RENAME", registerId);
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) editRedirect("error", "Register name must be between 2 and 100 characters.");
  try {
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const before = await tx.cashRegister.findUnique({ where: { id: registerId }, select: { name: true } });
      if (!before) throw new PosError("Register not found.");
      const updated = await tx.cashRegister.update({ where: { id: registerId }, data: { name } });
      await writeAudit(tx, { outcome: "SUCCESS", event: "REGISTER_RENAME", page: "REGISTERS",
        actorId: authorization.user.id, actorLabel: authorization.user.username ?? authorization.user.email,
        targetType: "register", targetId: registerId, summary: `Register renamed to ${updated.name}.`,
        metadata: { before: before.name, after: updated.name }, request });
    });
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "That register name already exists." : error instanceof PosError ? error.message : "The register could not be renamed.";
    await failure(authorization, "REGISTER_RENAME", registerId, message);
    editRedirect("error", message);
  }
  refreshRegisterManagement(registerId);
  editRedirect("success", "Register renamed.");
}

export async function changeRegisterTypeAction(registerId: string, formData: FormData) {
  const authorization = await requireRegisterOperation("REGISTER_TYPE_CHANGE", registerId);
  const purpose: RegisterPurpose = formData.get("purpose") === "RESTAURANT" ? "RESTAURANT" : "SHOP";
  try {
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const current = await tx.cashRegister.findUnique({
        where: { id: registerId }, select: { purpose: true, _count: { select: dependencyCount } },
      });
      if (!current) throw new PosError("Register not found.");
      if (current.purpose !== purpose && hasDependencies(current._count)) {
        throw new PosError("A register type can only be changed before it has operational data.");
      }
      await tx.cashRegister.update({ where: { id: registerId }, data: { purpose } });
      await writeAudit(tx, { outcome: "SUCCESS", event: "REGISTER_TYPE_CHANGE", page: "REGISTERS",
        actorId: authorization.user.id, actorLabel: authorization.user.username ?? authorization.user.email,
        targetType: "register", targetId: registerId, summary: "Register type updated.",
        metadata: { before: current.purpose, after: purpose }, request });
    });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The register type could not be changed.";
    await failure(authorization, "REGISTER_TYPE_CHANGE", registerId, message);
    editRedirect("error", message);
  }
  refreshRegisterManagement(registerId);
  editRedirect("success", "Register type updated.");
}

export async function setRegisterActiveAction(registerId: string, formData: FormData) {
  const authorization = await requireRegisterOperation("REGISTER_ARCHIVE", registerId);
  const active = formData.get("status") !== "ARCHIVED";
  try {
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const current = await tx.cashRegister.findUnique({
        where: { id: registerId }, select: { active: true, shifts: { where: { status: "OPEN" }, take: 1, select: { id: true } } },
      });
      if (!current) throw new PosError("Register not found.");
      if (!active && current.shifts.length) throw new PosError("Close the open shift before archiving this register.");
      await tx.cashRegister.update({ where: { id: registerId }, data: { active } });
      await writeAudit(tx, { outcome: "SUCCESS", event: "REGISTER_ARCHIVE", page: "REGISTERS",
        actorId: authorization.user.id, actorLabel: authorization.user.username ?? authorization.user.email,
        targetType: "register", targetId: registerId, summary: active ? "Register restored." : "Register archived.",
        metadata: { before: current.active, after: active }, request });
    });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The register status could not be changed.";
    await failure(authorization, "REGISTER_ARCHIVE", registerId, message);
    editRedirect("error", message);
  }
  refreshRegisterManagement(registerId);
  editRedirect("success", active ? "Register restored." : "Register archived.");
}

export async function deleteRegisterAction(registerId: string, formData: FormData) {
  const authorization = await requireRegisterOperation("REGISTER_DELETE", registerId);
  const confirmation = String(formData.get("confirmationName") ?? "").trim();
  try {
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const register = await tx.cashRegister.findUnique({
        where: { id: registerId }, select: { id: true, name: true, code: true, _count: { select: dependencyCount } },
      });
      if (!register) throw new PosError("Register not found.");
      if (confirmation !== register.name) throw new PosError("Enter the exact register name to confirm deletion.");
      if (hasDependencies(register._count)) throw new PosError("This register has operational data and cannot be deleted. Archive it instead.");
      await tx.cashRegister.delete({ where: { id: register.id } });
      await writeAudit(tx, { outcome: "SUCCESS", event: "REGISTER_DELETE", page: "REGISTERS",
        actorId: authorization.user.id, actorLabel: authorization.user.username ?? authorization.user.email,
        targetType: "register", targetId: register.id, summary: `Unused register ${register.name} deleted.`,
        metadata: { code: register.code }, request });
    });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The register could not be deleted.";
    await failure(authorization, "REGISTER_DELETE", registerId, message);
    editRedirect("error", message);
  }
  refreshRegisterManagement();
  editRedirect("success", "Unused register deleted.");
}

export async function createAdditionalBillCostAction(formData: FormData) {
  const registerId = String(formData.get("registerId") ?? "");
  const authorization = await requireRegisterCapability(
    "REGISTER_TYPE_CHANGE",
    registerId,
    "ADDITIONAL_BILL_COST_CREATE",
  );
  const parsed = parseAdditionalBillCostForm(formData);
  if (!parsed.ok) editRedirect("error", parsed.error);
  const { name, type, percentageBasisPoints, flatAmountLaari } = parsed.data;

  try {
    const created = await prisma.additionalBillCost.create({
      data: {
        registerId,
        name,
        type,
        percentageBasisPoints,
        flatAmountLaari,
      },
    });
    await safeWriteAudit({
      outcome: "SUCCESS",
      event: "ADDITIONAL_BILL_COST_CREATE",
      page: "REGISTERS",
      actorId: authorization.user.id,
      actorLabel: authorization.user.username ?? authorization.user.email,
      targetType: "additional_bill_cost",
      targetId: created.id,
      summary: `${name} added to the register's available bill costs.`,
      metadata: { registerId, type, percentageBasisPoints, flatAmountLaari },
      request: await getAuditRequestContext(),
    });
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "That additional cost name already exists for this register."
      : "The additional bill cost could not be created.";
    await failure(authorization, "ADDITIONAL_BILL_COST_CREATE", registerId, message);
    editRedirect("error", message);
  }

  refreshRegisterManagement(registerId);
  editRedirect("success", "Additional bill cost added.");
}

export async function deleteAdditionalBillCostAction(registerId: string, costId: string) {
  const authorization = await requireRegisterCapability(
    "REGISTER_TYPE_CHANGE",
    registerId,
    "ADDITIONAL_BILL_COST_DELETE",
  );
  try {
    const cost = await prisma.additionalBillCost.findFirst({
      where: { id: costId, registerId },
      select: { id: true, name: true, type: true, percentageBasisPoints: true, flatAmountLaari: true },
    });
    if (!cost) throw new PosError("Additional bill cost not found.");
    await prisma.additionalBillCost.delete({ where: { id: cost.id } });
    await safeWriteAudit({
      outcome: "SUCCESS",
      event: "ADDITIONAL_BILL_COST_DELETE",
      page: "REGISTERS",
      actorId: authorization.user.id,
      actorLabel: authorization.user.username ?? authorization.user.email,
      targetType: "additional_bill_cost",
      targetId: cost.id,
      summary: `${cost.name} removed from the register's available bill costs.`,
      metadata: { registerId, type: cost.type, percentageBasisPoints: cost.percentageBasisPoints, flatAmountLaari: cost.flatAmountLaari },
      request: await getAuditRequestContext(),
    });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The additional bill cost could not be deleted.";
    await failure(authorization, "ADDITIONAL_BILL_COST_DELETE", registerId, message);
    editRedirect("error", message);
  }

  refreshRegisterManagement(registerId);
  editRedirect("success", "Additional bill cost deleted.");
}
