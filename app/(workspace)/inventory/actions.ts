"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAuditRequestContext, safeWriteAudit, writeAudit } from "@/lib/audit";
import { requireActionAccess, type AuthorizationContext } from "@/lib/authorization";
import { maldivesDate, measured, measuredPerStockUnit } from "@/lib/pos/inventory";
import { createProductWithGeneratedSku } from "@/lib/pos/products";
import { assignBatchExpiry, PosError, receiveInventory, writeOffBatch } from "@/lib/pos/sales";
import { parseBatchExpiry, parseBatchWriteOff, parseCategoryForm, parseProductForm, parseProductUpdateForm, parseReceiveStock } from "@/lib/pos/validation";

function inventoryRedirect(kind: "success" | "error", message: string): never {
  redirect(`/inventory?${kind}=${encodeURIComponent(message)}`);
}

function actorLabel(authorization: AuthorizationContext) {
  return authorization.user.username ?? authorization.user.email;
}

function refreshInventory() {
  revalidatePath("/inventory");
  revalidatePath("/stock");
  revalidatePath("/registers");
  revalidatePath("/");
  revalidatePath("/", "layout");
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
    page: "INVENTORY",
    actorId: authorization.user.id,
    actorLabel: actorLabel(authorization),
    summary,
    metadata,
    request: await getAuditRequestContext(),
  });
}

export async function createProductAction(formData: FormData) {
  const authorization = await requireActionAccess("INVENTORY", "PRODUCT_CREATE");
  const parsed = parseProductForm(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "PRODUCT_CREATE", parsed.error);
    inventoryRedirect("error", parsed.error);
  }

  const register = await prisma.cashRegister.findFirst({
    where: { id: parsed.data.registerId, active: true },
    select: { id: true, purpose: true },
  });
  if (!register) {
    await auditFailure(authorization, "PRODUCT_CREATE", "Select an active register.");
    inventoryRedirect("error", "Select an active register.");
  }
  if (register.purpose === "RESTAURANT" && parsed.data.openingStock > 0 && !parsed.data.expiryDate) {
    await auditFailure(authorization, "PRODUCT_CREATE", "Restaurant opening stock requires an expiry date.");
    inventoryRedirect("error", "Restaurant opening stock requires an expiry date.");
  }
  if (parsed.data.expiryDate && parsed.data.expiryDate < maldivesDate()) {
    await auditFailure(authorization, "PRODUCT_CREATE", "Opening stock cannot already be expired.");
    inventoryRedirect("error", "Opening stock cannot already be expired.");
  }

  const request = await getAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const { openingStock, expiryDate, categoryId, ...productData } = parsed.data;
      const category = await tx.productCategory.findUnique({ where: { id: categoryId } });
      if (!category) throw new PosError("Select an available category.");
      const product = await createProductWithGeneratedSku(tx, {
        ...productData,
        categoryId: category.id,
        category: category.name,
      });
      if (openingStock > 0) {
        const quantity = measured(measuredPerStockUnit(product) * openingStock);
        await tx.inventoryBatch.create({ data: {
          productId: product.id, registerId: product.registerId, receivedById: authorization.user.id,
          receivedQuantity: quantity, remainingQuantity: quantity, expiryDate,
        } });
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            registerId: product.registerId,
            createdById: authorization.user.id,
            type: "INITIAL",
            quantityDelta: quantity,
            balanceAfter: quantity,
            reason: "Opening stock",
          },
        });
      }
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "PRODUCT_CREATE",
        page: "INVENTORY",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "product",
        targetId: product.id,
        summary: `Product ${product.name} created.`,
        metadata: {
          sku: product.sku,
          registerId: product.registerId,
          openingStock,
          expiryDate,
        },
        request,
      });
    });
  } catch (error) {
    const message = error instanceof PosError
      ? error.message
      : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        ? "That barcode already exists."
        : "The product could not be created.";
    await auditFailure(authorization, "PRODUCT_CREATE", message, { name: parsed.data.name });
    inventoryRedirect("error", message);
  }

  refreshInventory();
  inventoryRedirect("success", "Product added.");
}

export async function updateProductAction(productId: string, formData: FormData) {
  const authorization = await requireActionAccess("INVENTORY", "PRODUCT_UPDATE");
  const parsed = parseProductUpdateForm(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "PRODUCT_UPDATE", parsed.error, { productId });
    inventoryRedirect("error", parsed.error);
  }

  try {
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const category = await tx.productCategory.findUnique({ where: { id: parsed.data.categoryId } });
      if (!category) throw new PosError("Select an available category.");
      const updated = await tx.product.updateMany({
        where: { id: productId, active: true },
        data: { ...parsed.data, category: category.name },
      });
      if (updated.count !== 1) throw new PosError("That inventory item is no longer available.");
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "PRODUCT_UPDATE",
        page: "INVENTORY",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "product",
        targetId: productId,
        summary: `Product ${parsed.data.name} updated.`,
        metadata: { categoryId: category.id, barcode: parsed.data.barcode },
        request,
      });
    });
  } catch (error) {
    const message = error instanceof PosError
      ? error.message
      : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        ? "That barcode already exists."
        : "The product could not be updated.";
    await auditFailure(authorization, "PRODUCT_UPDATE", message, { productId });
    inventoryRedirect("error", message);
  }

  refreshInventory();
  inventoryRedirect("success", "Product updated.");
}

export async function deleteProductAction(productId: string) {
  const authorization = await requireActionAccess("INVENTORY", "PRODUCT_DELETE");
  try {
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, active: true } });
      if (!product) throw new PosError("That inventory item is no longer available.");
      await tx.product.update({ where: { id: product.id }, data: { active: false } });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "PRODUCT_DELETE",
        page: "INVENTORY",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "product",
        targetId: product.id,
        summary: `Product ${product.name} removed from inventory.`,
        metadata: { sku: product.sku },
        request,
      });
    });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The product could not be removed.";
    await auditFailure(authorization, "PRODUCT_DELETE", message, { productId });
    inventoryRedirect("error", message);
  }

  refreshInventory();
  inventoryRedirect("success", "Product removed.");
}

export async function createCategoryAction(formData: FormData) {
  const authorization = await requireActionAccess("INVENTORY", "CATEGORY_CREATE");
  const parsed = parseCategoryForm(formData);
  if (!parsed.ok) inventoryRedirect("error", parsed.error);
  try {
    await prisma.productCategory.create({ data: parsed.data });
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "That category already exists."
      : "The category could not be created.";
    await auditFailure(authorization, "CATEGORY_CREATE", message, parsed.data);
    inventoryRedirect("error", message);
  }
  refreshInventory();
  inventoryRedirect("success", "Category added.");
}

export async function updateCategoryAction(categoryId: string, formData: FormData) {
  const authorization = await requireActionAccess("INVENTORY", "CATEGORY_UPDATE");
  const parsed = parseCategoryForm(formData);
  if (!parsed.ok) inventoryRedirect("error", parsed.error);
  try {
    await prisma.$transaction(async (tx) => {
      const previous = await tx.productCategory.findUnique({ where: { id: categoryId }, select: { name: true } });
      if (!previous) throw new PosError("Category not found.");
      const category = await tx.productCategory.update({ where: { id: categoryId }, data: parsed.data });
      await tx.product.updateMany({ where: { categoryId }, data: { category: category.name } });
      await tx.menuItem.updateMany({ where: { category: previous.name }, data: { category: category.name } });
    });
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "That category already exists."
      : "The category could not be updated.";
    await auditFailure(authorization, "CATEGORY_UPDATE", message, { categoryId });
    inventoryRedirect("error", message);
  }
  refreshInventory();
  inventoryRedirect("success", "Category updated.");
}

export async function deleteCategoryAction(categoryId: string) {
  const authorization = await requireActionAccess("INVENTORY", "CATEGORY_DELETE");
  try {
    const category = await prisma.productCategory.findUnique({ where: { id: categoryId }, select: { name: true } });
    if (!category) throw new PosError("Category not found.");
    const [productUsage, menuUsage] = await Promise.all([
      prisma.product.count({ where: { categoryId } }),
      prisma.menuItem.count({ where: { category: category.name } }),
    ]);
    if (productUsage || menuUsage) throw new PosError("Move or remove the products and menu items in this category first.");
    await prisma.productCategory.delete({ where: { id: categoryId } });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The category could not be removed.";
    await auditFailure(authorization, "CATEGORY_DELETE", message, { categoryId });
    inventoryRedirect("error", message);
  }
  refreshInventory();
  inventoryRedirect("success", "Category removed.");
}

export async function receiveStockAction(productId: string, formData: FormData) {
  const authorization = await requireActionAccess("INVENTORY", "STOCK_ADJUST");
  const parsed = parseReceiveStock(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "STOCK_ADJUST", parsed.error, { productId });
    inventoryRedirect("error", parsed.error);
  }

  try {
    await receiveInventory(prisma, {
      productId,
      createdById: authorization.user.id,
      ...parsed.data,
      audit: {
        actorLabel: actorLabel(authorization),
        request: await getAuditRequestContext(),
      },
    });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "Stock could not be received.";
    await auditFailure(authorization, "STOCK_ADJUST", message, { productId });
    inventoryRedirect("error", message);
  }

  refreshInventory();
  inventoryRedirect("success", "Stock batch received.");
}

export async function assignBatchExpiryAction(batchId: string, formData: FormData) {
  const authorization = await requireActionAccess("INVENTORY", "STOCK_ADJUST");
  const parsed = parseBatchExpiry(formData);
  if (!parsed.ok) inventoryRedirect("error", parsed.error);
  try {
    await assignBatchExpiry(prisma, { batchId, createdById: authorization.user.id, ...parsed.data, audit: { actorLabel: actorLabel(authorization), request: await getAuditRequestContext() } });
  } catch (error) {
    inventoryRedirect("error", error instanceof PosError ? error.message : "Expiry could not be updated.");
  }
  revalidatePath("/inventory"); revalidatePath("/stock"); revalidatePath("/registers");
  inventoryRedirect("success", "Batch expiry updated.");
}

export async function writeOffBatchAction(batchId: string, formData: FormData) {
  const authorization = await requireActionAccess("INVENTORY", "STOCK_ADJUST");
  const parsed = parseBatchWriteOff(formData);
  if (!parsed.ok) inventoryRedirect("error", parsed.error);
  try {
    await writeOffBatch(prisma, { batchId, createdById: authorization.user.id, ...parsed.data, audit: { actorLabel: actorLabel(authorization), request: await getAuditRequestContext() } });
  } catch (error) {
    inventoryRedirect("error", error instanceof PosError ? error.message : "Stock could not be written off.");
  }
  revalidatePath("/inventory"); revalidatePath("/stock"); revalidatePath("/registers"); revalidatePath("/");
  inventoryRedirect("success", "Batch stock written off.");
}
