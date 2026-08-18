"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuditRequestContext, safeWriteAudit, writeAudit } from "@/lib/audit";
import { requireEntityOperation, requireRegisterOperation } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { parseMenuItemForm } from "@/lib/pos/validation";

function menuRedirect(registerId: string, kind: "success" | "error", message: string): never {
  redirect(`/registers/${registerId}/menu?${kind}=${encodeURIComponent(message)}`);
}

async function validateRecipe(registerId: string, formData: FormData) {
  const parsed = parseMenuItemForm(formData);
  if (!parsed.ok) return parsed;
  const register = await prisma.cashRegister.findFirst({ where: { id: registerId, active: true, purpose: "RESTAURANT" }, select: { id: true } });
  if (!register) return { ok: false, error: "Restaurant register not found." } as const;
  const [category, products] = await Promise.all([
    prisma.productCategory.findUnique({
      where: { normalizedName: parsed.data.category.toLocaleLowerCase("en") },
      select: { name: true },
    }),
    prisma.product.findMany({
      where: { id: { in: parsed.data.ingredients.map((item) => item.productId) }, registerId, active: true },
      select: { id: true, name: true, batches: { where: { expiryDate: null, remainingQuantity: { gt: 0 } }, select: { id: true } } },
    }),
  ]);
  if (!category) return { ok: false, error: "Select a category configured in Inventory." } as const;
  if (products.length !== parsed.data.ingredients.length) return { ok: false, error: "Every ingredient must be active and belong to this register." } as const;
  const undated = products.find((product) => product.batches.length > 0);
  if (undated) return { ok: false, error: `${undated.name} has stock with no expiry date. Assign it before using this ingredient.` } as const;
  return { ...parsed, data: { ...parsed.data, category: category.name } };
}

export async function createMenuItemAction(registerId: string, formData: FormData) {
  const authorization = await requireRegisterOperation("MENU_ITEM_CREATE", registerId);
  const parsed = await validateRecipe(registerId, formData);
  if (!parsed.ok) menuRedirect(registerId, "error", parsed.error);
  try {
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const item = await tx.menuItem.create({ data: {
        registerId, name: parsed.data.name, category: parsed.data.category,
        retailPriceLaari: parsed.data.retailPriceLaari,
        ingredients: { create: parsed.data.ingredients },
      } });
      await writeAudit(tx, { outcome: "SUCCESS", event: "MENU_ITEM_CREATE", page: "REGISTERS",
        actorId: authorization.user.id, actorLabel: authorization.user.username ?? authorization.user.email,
        targetType: "menu_item", targetId: item.id, summary: `Menu item ${item.name} created.`,
        metadata: { registerId, ingredientCount: parsed.data.ingredients.length }, request });
    });
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? "That menu item name already exists in this register." : "The menu item could not be created.";
    await safeWriteAudit({ outcome: "FAILURE", event: "MENU_ITEM_CREATE", page: "REGISTERS", actorId: authorization.user.id, actorLabel: authorization.user.email, summary: message });
    menuRedirect(registerId, "error", message);
  }
  revalidatePath(`/registers/${registerId}/menu`); revalidatePath("/registers");
  menuRedirect(registerId, "success", "Menu item added.");
}

export async function updateMenuItemAction(menuItemId: string, registerId: string, formData: FormData) {
  const { authorization, registerId: trustedRegisterId } = await requireEntityOperation("MENU_ITEM_UPDATE", "menuItem", menuItemId);
  if (trustedRegisterId !== registerId) menuRedirect(trustedRegisterId, "error", "That menu item does not belong to this register.");
  const parsed = await validateRecipe(registerId, formData);
  if (!parsed.ok) menuRedirect(registerId, "error", parsed.error);
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.menuItem.findFirst({ where: { id: menuItemId, registerId }, select: { id: true } });
      if (!existing) throw new Error("Missing menu item");
      await tx.menuItemIngredient.deleteMany({ where: { menuItemId } });
      await tx.menuItem.update({ where: { id: menuItemId }, data: {
        name: parsed.data.name, category: parsed.data.category, retailPriceLaari: parsed.data.retailPriceLaari,
        ingredients: { create: parsed.data.ingredients },
      } });
      await writeAudit(tx, { outcome: "SUCCESS", event: "MENU_ITEM_UPDATE", page: "REGISTERS",
        actorId: authorization.user.id, actorLabel: authorization.user.username ?? authorization.user.email,
        targetType: "menu_item", targetId: menuItemId, summary: `Menu item ${parsed.data.name} updated.`,
        metadata: { registerId, ingredientCount: parsed.data.ingredients.length }, request: await getAuditRequestContext() });
    });
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? "That menu item name already exists in this register." : "The menu item could not be updated.";
    menuRedirect(registerId, "error", message);
  }
  revalidatePath(`/registers/${registerId}/menu`); revalidatePath("/registers");
  menuRedirect(registerId, "success", "Menu item updated.");
}

export async function toggleMenuItemAction(menuItemId: string, registerId: string, active: boolean) {
  const { authorization, registerId: trustedRegisterId } = await requireEntityOperation("MENU_ITEM_UPDATE", "menuItem", menuItemId);
  if (trustedRegisterId !== registerId) menuRedirect(trustedRegisterId, "error", "That menu item does not belong to this register.");
  const updated = await prisma.menuItem.updateMany({ where: { id: menuItemId, registerId }, data: { active } });
  if (updated.count !== 1) menuRedirect(registerId, "error", "Menu item not found.");
  await safeWriteAudit({ outcome: "SUCCESS", event: "MENU_ITEM_UPDATE", page: "REGISTERS",
    actorId: authorization.user.id, actorLabel: authorization.user.username ?? authorization.user.email,
    targetType: "menu_item", targetId: menuItemId, summary: active ? "Menu item activated." : "Menu item archived.", metadata: { registerId, operation: active ? "ACTIVATE" : "ARCHIVE" } });
  revalidatePath(`/registers/${registerId}/menu`); revalidatePath("/registers");
  menuRedirect(registerId, "success", active ? "Menu item activated." : "Menu item archived.");
}
