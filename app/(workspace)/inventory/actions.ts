"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAuditRequestContext, safeWriteAudit, writeAudit } from "@/lib/audit";
import { requireActionAccess, type AuthorizationContext } from "@/lib/authorization";
import { adjustInventory, PosError } from "@/lib/pos/sales";
import { parseProductForm, parseStockAdjustment } from "@/lib/pos/validation";

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
    select: { id: true },
  });
  if (!register) {
    await auditFailure(authorization, "PRODUCT_CREATE", "Select an active register.");
    inventoryRedirect("error", "Select an active register.");
  }

  const request = await getAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data: parsed.data });
      if (parsed.data.stockQuantity > 0) {
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            registerId: product.registerId,
            createdById: authorization.user.id,
            type: "INITIAL",
            quantityDelta: parsed.data.stockQuantity,
            balanceAfter: parsed.data.stockQuantity,
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
          openingStock: parsed.data.stockQuantity,
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

export async function adjustStockAction(productId: string, formData: FormData) {
  const authorization = await requireActionAccess("INVENTORY", "STOCK_ADJUST");
  const parsed = parseStockAdjustment(formData);
  if (!parsed.ok) {
    await auditFailure(authorization, "STOCK_ADJUST", parsed.error, { productId });
    inventoryRedirect("error", parsed.error);
  }

  try {
    await adjustInventory(prisma, {
      productId,
      createdById: authorization.user.id,
      ...parsed.data,
      audit: {
        actorLabel: actorLabel(authorization),
        request: await getAuditRequestContext(),
      },
    });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "Stock could not be adjusted.";
    await auditFailure(authorization, "STOCK_ADJUST", message, { productId });
    inventoryRedirect("error", message);
  }

  revalidatePath("/inventory");
  revalidatePath("/stock");
  revalidatePath("/");
  inventoryRedirect("success", "Stock updated.");
}
