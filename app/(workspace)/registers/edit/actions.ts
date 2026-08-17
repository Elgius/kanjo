"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuditRequestContext, safeWriteAudit, writeAudit } from "@/lib/audit";
import { requireActionAccess } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { PosError } from "@/lib/pos/sales";
import { parseRegisterEditForm } from "@/lib/pos/validation";

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

export async function updateRegisterAction(registerId: string, formData: FormData) {
  const authorization = await requireActionAccess("REGISTERS", "REGISTER_UPDATE");
  const parsed = parseRegisterEditForm(formData);
  if (!parsed.ok) editRedirect("error", parsed.error);

  try {
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const current = await tx.cashRegister.findUnique({
        where: { id: registerId },
        select: {
          id: true,
          name: true,
          purpose: true,
          active: true,
          shifts: { where: { status: "OPEN" }, take: 1, select: { id: true } },
          _count: { select: dependencyCount },
        },
      });
      if (!current) throw new PosError("Register not found.");
      if (current.purpose !== parsed.data.purpose && hasDependencies(current._count)) {
        throw new PosError("A register type can only be changed before it has inventory, shifts, tables, menus, or account history.");
      }
      if (!parsed.data.active && current.shifts.length) {
        throw new PosError("Close the open shift before archiving this register.");
      }

      const updated = await tx.cashRegister.update({
        where: { id: registerId },
        data: parsed.data,
      });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "REGISTER_UPDATE",
        page: "REGISTERS",
        actorId: authorization.user.id,
        actorLabel: authorization.user.username ?? authorization.user.email,
        targetType: "register",
        targetId: updated.id,
        summary: `Register ${updated.name} updated.`,
        metadata: {
          before: { name: current.name, purpose: current.purpose, active: current.active },
          after: { name: updated.name, purpose: updated.purpose, active: updated.active },
        },
        request,
      });
    });
  } catch (error) {
    const message = error instanceof PosError
      ? error.message
      : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        ? "That register name already exists."
        : "The register could not be updated.";
    await safeWriteAudit({
      outcome: "FAILURE",
      event: "REGISTER_UPDATE",
      page: "REGISTERS",
      actorId: authorization.user.id,
      actorLabel: authorization.user.username ?? authorization.user.email,
      targetType: "register",
      targetId: registerId,
      summary: message,
      request: await getAuditRequestContext(),
    });
    editRedirect("error", message);
  }

  refreshRegisterManagement(registerId);
  editRedirect("success", "Register updated.");
}

export async function deleteRegisterAction(registerId: string, formData: FormData) {
  const authorization = await requireActionAccess("REGISTERS", "REGISTER_DELETE");
  const confirmation = String(formData.get("confirmationName") ?? "").trim();

  try {
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const register = await tx.cashRegister.findUnique({
        where: { id: registerId },
        select: { id: true, name: true, code: true, _count: { select: dependencyCount } },
      });
      if (!register) throw new PosError("Register not found.");
      if (confirmation !== register.name) throw new PosError("Enter the exact register name to confirm deletion.");
      if (hasDependencies(register._count)) {
        throw new PosError("This register has operational data and cannot be deleted. Archive it instead.");
      }
      await tx.cashRegister.delete({ where: { id: register.id } });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "REGISTER_DELETE",
        page: "REGISTERS",
        actorId: authorization.user.id,
        actorLabel: authorization.user.username ?? authorization.user.email,
        targetType: "register",
        targetId: register.id,
        summary: `Unused register ${register.name} deleted.`,
        metadata: { code: register.code },
        request,
      });
    });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The register could not be deleted.";
    await safeWriteAudit({
      outcome: "FAILURE",
      event: "REGISTER_DELETE",
      page: "REGISTERS",
      actorId: authorization.user.id,
      actorLabel: authorization.user.username ?? authorization.user.email,
      targetType: "register",
      targetId: registerId,
      summary: message,
      request: await getAuditRequestContext(),
    });
    editRedirect("error", message);
  }

  refreshRegisterManagement();
  editRedirect("success", "Unused register deleted.");
}
