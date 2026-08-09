"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { PosError, recordSale } from "@/lib/pos/sales";
import { requireUser } from "@/lib/pos/session";
import {
  parseClosingCash,
  parseOpeningCash,
  parseRegisterForm,
  parseSaleForm,
} from "@/lib/pos/validation";

function registersRedirect(kind: "success" | "error", message: string, registerId?: string): never {
  const params = new URLSearchParams({ [kind]: message });
  if (registerId) params.set("register", registerId);
  redirect(`/registers?${params.toString()}`);
}

function refreshRegisters() {
  revalidatePath("/registers");
  revalidatePath("/");
  revalidatePath("/", "layout");
}

export async function createRegisterAction(formData: FormData) {
  await requireUser();
  const parsed = parseRegisterForm(formData);
  if (!parsed.ok) registersRedirect("error", parsed.error);

  let register;
  try {
    register = await prisma.cashRegister.create({ data: parsed.data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      registersRedirect("error", "That register code or name already exists.");
    }
    registersRedirect("error", "The register could not be created.");
  }

  refreshRegisters();
  registersRedirect("success", "Register added.", register.id);
}

export async function openShiftAction(registerId: string, formData: FormData) {
  const user = await requireUser();
  const parsed = parseOpeningCash(formData);
  if (!parsed.ok) registersRedirect("error", parsed.error, registerId);

  try {
    await prisma.registerShift.create({
      data: { registerId, openedById: user.id, openingCashLaari: parsed.data.openingCashLaari },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      registersRedirect("error", "This register already has an open shift.", registerId);
    }
    registersRedirect("error", "The shift could not be opened.", registerId);
  }

  refreshRegisters();
  registersRedirect("success", "Shift opened.", registerId);
}

export async function closeShiftAction(shiftId: string, registerId: string, formData: FormData) {
  const user = await requireUser();
  const parsed = parseClosingCash(formData);
  if (!parsed.ok) registersRedirect("error", parsed.error, registerId);

  const updated = await prisma.registerShift.updateMany({
    where: { id: shiftId, registerId, status: "OPEN" },
    data: {
      status: "CLOSED",
      closedById: user.id,
      closingCashLaari: parsed.data.closingCashLaari,
      closedAt: new Date(),
    },
  });
  if (updated.count !== 1) registersRedirect("error", "That shift is no longer open.", registerId);

  refreshRegisters();
  registersRedirect("success", "Shift closed.", registerId);
}

export async function recordSaleAction(shiftId: string, registerId: string, formData: FormData) {
  const user = await requireUser();
  const parsed = parseSaleForm(formData);
  if (!parsed.ok) registersRedirect("error", parsed.error, registerId);

  let receiptNumber: bigint;
  try {
    const sale = await recordSale(prisma, {
      shiftId,
      createdById: user.id,
      paymentMethod: parsed.data.paymentMethod,
      items: parsed.data.items,
    });
    receiptNumber = sale.receiptNumber;
  } catch (error) {
    registersRedirect(
      "error",
      error instanceof PosError ? error.message : "The sale could not be recorded.",
      registerId,
    );
  }

  refreshRegisters();
  registersRedirect("success", `Receipt #${receiptNumber} recorded.`, registerId);
}
