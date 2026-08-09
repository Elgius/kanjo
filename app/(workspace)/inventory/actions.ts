"use server";

import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { adjustInventory, PosError } from "@/lib/pos/sales";
import { requireUser } from "@/lib/pos/session";
import { parseProductForm, parseStockAdjustment } from "@/lib/pos/validation";

function inventoryRedirect(kind: "success" | "error", message: string): never {
  redirect(`/inventory?${kind}=${encodeURIComponent(message)}`);
}

export async function createProductAction(formData: FormData) {
  const user = await requireUser();
  const parsed = parseProductForm(formData);
  if (!parsed.ok) inventoryRedirect("error", parsed.error);

  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data: parsed.data });
      if (parsed.data.stockQuantity > 0) {
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            createdById: user.id,
            type: "INITIAL",
            quantityDelta: parsed.data.stockQuantity,
            reason: "Opening stock",
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      inventoryRedirect("error", "That SKU or barcode already exists.");
    }
    inventoryRedirect("error", "The product could not be created.");
  }

  revalidatePath("/inventory");
  revalidatePath("/");
  inventoryRedirect("success", "Product added.");
}

export async function adjustStockAction(productId: string, formData: FormData) {
  const user = await requireUser();
  const parsed = parseStockAdjustment(formData);
  if (!parsed.ok) inventoryRedirect("error", parsed.error);

  try {
    await adjustInventory(prisma, { productId, createdById: user.id, ...parsed.data });
  } catch (error) {
    inventoryRedirect(
      "error",
      error instanceof PosError ? error.message : "Stock could not be adjusted.",
    );
  }

  revalidatePath("/inventory");
  revalidatePath("/");
  inventoryRedirect("success", "Stock updated.");
}
