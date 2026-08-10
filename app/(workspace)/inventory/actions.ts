"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAuditRequestContext, safeWriteAudit, writeAudit } from "@/lib/audit";
import { requireActionAccess, type AuthorizationContext } from "@/lib/authorization";
import { maldivesDate, measured, measuredPerStockUnit } from "@/lib/pos/inventory";
import { assignBatchExpiry, PosError, receiveInventory, writeOffBatch } from "@/lib/pos/sales";
import { parseBatchExpiry, parseBatchWriteOff, parseProductForm, parseReceiveStock } from "@/lib/pos/validation";

function inventoryRedirect(kind: "success" | "error", message: string): never {
  redirect(`/inventory?${kind}=${encodeURIComponent(message)}`);
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
      const { openingStock, expiryDate, ...productData } = parsed.data;
      const product = await tx.product.create({ data: productData });
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
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "That SKU or barcode already exists."
      : "The product could not be created.";
    await auditFailure(authorization, "PRODUCT_CREATE", message, { sku: parsed.data.sku });
    inventoryRedirect("error", message);
  }

  revalidatePath("/inventory");
  revalidatePath("/stock");
  revalidatePath("/");
  inventoryRedirect("success", "Product added.");
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

  revalidatePath("/inventory");
  revalidatePath("/stock");
  revalidatePath("/");
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
