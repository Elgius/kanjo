"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuditRequestContext, safeWriteAudit, writeAudit } from "@/lib/audit";
import { requireActionAccess } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { parseRestaurantTableForm } from "@/lib/pos/validation";

function restaurantRedirect(registerId: string, kind: "success" | "error", message: string): never {
  redirect(`/registers/${registerId}/restaurant?${kind}=${encodeURIComponent(message)}`);
}

function refreshRestaurant(registerId: string) {
  revalidatePath(`/registers/${registerId}/restaurant`);
  revalidatePath(`/registers/${registerId}`);
}

export async function createRestaurantTableAction(registerId: string, formData: FormData) {
  const authorization = await requireActionAccess("REGISTERS", "RESTAURANT_TABLE_CREATE");
  const parsed = parseRestaurantTableForm(formData);
  if (!parsed.ok) restaurantRedirect(registerId, "error", parsed.error);

  const request = await getAuditRequestContext();
  try {
    await prisma.$transaction(async (tx) => {
      const register = await tx.cashRegister.findFirst({
        where: { id: registerId, active: true, purpose: "RESTAURANT" },
        select: { id: true },
      });
      if (!register) throw new Error("REGISTER_NOT_FOUND");
      const table = await tx.restaurantTable.create({
        data: { registerId, ...parsed.data },
      });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "RESTAURANT_TABLE_CREATE",
        page: "REGISTERS",
        actorId: authorization.user.id,
        actorLabel: authorization.user.username ?? authorization.user.email,
        targetType: "restaurant_table",
        targetId: table.id,
        summary: `${table.name} created with ${table.seats} seats.`,
        metadata: { registerId, seats: table.seats },
        request,
      });
    });
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "A table with that name already exists."
      : error instanceof Error && error.message === "REGISTER_NOT_FOUND"
        ? "Restaurant register not found."
        : "The table could not be created.";
    await safeWriteAudit({
      outcome: "FAILURE",
      event: "RESTAURANT_TABLE_CREATE",
      page: "REGISTERS",
      actorId: authorization.user.id,
      actorLabel: authorization.user.username ?? authorization.user.email,
      summary: message,
      metadata: { registerId },
      request,
    });
    restaurantRedirect(registerId, "error", message);
  }

  refreshRestaurant(registerId);
  restaurantRedirect(registerId, "success", "Table added.");
}

export async function updateRestaurantTableAction(tableId: string, registerId: string, formData: FormData) {
  const authorization = await requireActionAccess("REGISTERS", "RESTAURANT_TABLE_UPDATE");
  const parsed = parseRestaurantTableForm(formData);
  if (!parsed.ok) restaurantRedirect(registerId, "error", parsed.error);

  try {
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const before = await tx.restaurantTable.findFirst({
        where: { id: tableId, registerId, register: { purpose: "RESTAURANT", active: true } },
        select: { name: true, seats: true },
      });
      if (!before) throw new Error("TABLE_NOT_FOUND");
      const table = await tx.restaurantTable.update({
        where: { id: tableId },
        data: parsed.data,
      });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "RESTAURANT_TABLE_UPDATE",
        page: "REGISTERS",
        actorId: authorization.user.id,
        actorLabel: authorization.user.username ?? authorization.user.email,
        targetType: "restaurant_table",
        targetId: table.id,
        summary: `${table.name} updated.`,
        metadata: { registerId, before, after: parsed.data },
        request,
      });
    });
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "A table with that name already exists."
      : error instanceof Error && error.message === "TABLE_NOT_FOUND"
        ? "Restaurant table not found."
        : "The table could not be updated.";
    restaurantRedirect(registerId, "error", message);
  }

  refreshRestaurant(registerId);
  restaurantRedirect(registerId, "success", "Table updated.");
}
