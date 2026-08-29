"use server";

import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseBillSnapshot } from "@/lib/pos/bill-revisions";
import {
  detectPaymentSlipContentType,
  MAX_PAYMENT_SLIP_BYTES,
  normalizePaymentPhone,
  type PaymentSlipContentType,
} from "@/lib/pos/payment-links";
import { deletePrivateObject, uploadPrivateObject } from "@/lib/storage/bunny-s3";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PaymentBillLookupState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | {
      status: "success";
      bill: {
        billNumber: string;
        status: string;
        registerName: string;
        registerCode: string;
        openedAt: string;
        subtotalLaari: number;
        totalLaari: number;
        items: Array<{ id: string; name: string; quantity: number; unitPriceLaari: number; lineTotalLaari: number }>;
        additionalCosts: Array<{ id: string; name: string; type: "FLAT_RATE" | "PERCENTAGE"; percentageBasisPoints: number | null; amountLaari: number }>;
      };
    };

export type PaymentSlipUploadState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "success"; fileName: string };

const paymentSlipExtensions: Record<PaymentSlipContentType, string> = {
  "application/pdf": "pdf",
  "image/heic": "heic",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function cleanFileName(value: string) {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "payment-slip").slice(0, 255);
}

export async function lookupPaymentBillAction(
  billId: string,
  _previousState: PaymentBillLookupState,
  formData: FormData,
): Promise<PaymentBillLookupState> {
  const countryCode = String(formData.get("countryCode") ?? "");
  const phoneNumber = String(formData.get("phoneNumber") ?? "");
  const phone = normalizePaymentPhone(`${countryCode}${phoneNumber}`);
  if (!uuidPattern.test(billId) || !phone) {
    return { status: "error", error: "Enter the phone number used for this payment link." };
  }

  const paymentLink = await prisma.paymentLink.findFirst({
    where: { billId, normalizedPhoneNumber: phone.normalized, expiresAt: { gt: new Date() } },
    select: {
      bill: {
        select: {
          billNumber: true, status: true, registerName: true, registerCode: true,
          paymentMethod: true, subtotalLaari: true, totalLaari: true, additionalCosts: true,
          items: true, customerNote: true, restaurantTableId: true, restaurantTableName: true, openedAt: true,
        },
      },
    },
  });
  if (!paymentLink) {
    return { status: "error", error: "No active bill was found for that phone number." };
  }

  const { bill } = paymentLink;
  const snapshot = parseBillSnapshot({
    items: bill.items,
    subtotalLaari: bill.subtotalLaari,
    totalLaari: bill.totalLaari,
    additionalCosts: bill.additionalCosts,
    paymentMethod: bill.paymentMethod,
    customerNote: bill.customerNote,
    restaurantTableId: bill.restaurantTableId,
    restaurantTableName: bill.restaurantTableName,
  } as unknown as Prisma.JsonValue);
  if (!snapshot) return { status: "error", error: "This bill could not be displayed." };

  return {
    status: "success",
    bill: {
      billNumber: bill.billNumber.toString(),
      status: bill.status,
      registerName: bill.registerName,
      registerCode: bill.registerCode,
      openedAt: bill.openedAt.toISOString(),
      subtotalLaari: snapshot.subtotalLaari,
      totalLaari: snapshot.totalLaari,
      items: snapshot.items.map((item, index) => ({
        id: `${item.productId ?? item.menuItemId ?? item.productName}-${index}`,
        name: item.productName,
        quantity: item.quantity,
        unitPriceLaari: item.unitPriceLaari,
        lineTotalLaari: item.lineTotalLaari,
      })),
      additionalCosts: snapshot.additionalCosts,
    },
  };
}

export async function uploadPaymentSlipAction(
  billId: string,
  _previousState: PaymentSlipUploadState,
  formData: FormData,
): Promise<PaymentSlipUploadState> {
  const phone = normalizePaymentPhone(
    `${String(formData.get("countryCode") ?? "")}${String(formData.get("phoneNumber") ?? "")}`,
  );
  const file = formData.get("paymentSlip");

  if (!uuidPattern.test(billId) || !phone) {
    return { status: "error", error: "Your bill verification expired. Look up the bill again." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", error: "Choose an image or PDF to upload." };
  }
  if (file.size > MAX_PAYMENT_SLIP_BYTES) {
    return { status: "error", error: "The payment slip must be 5 MB or smaller." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = detectPaymentSlipContentType(bytes);
  if (!contentType) {
    return { status: "error", error: "Upload a valid JPEG, PNG, WebP, HEIC, or PDF file." };
  }

  const paymentLink = await prisma.paymentLink.findFirst({
    where: {
      billId,
      normalizedPhoneNumber: phone.normalized,
      expiresAt: { gt: new Date() },
      bill: { status: "UNPAID" },
    },
    select: {
      paymentSlipKey: true,
      bill: { select: { registerId: true, registerShiftId: true } },
    },
  });
  if (!paymentLink) {
    return { status: "error", error: "This payment link is invalid, expired, or already settled." };
  }

  const key = `kanjo/payment-slips/${billId}/${randomUUID()}.${paymentSlipExtensions[contentType]}`;
  const fileName = cleanFileName(file.name);

  try {
    await uploadPrivateObject({ key, body: bytes, contentType });

    let updated;
    try {
      updated = await prisma.paymentLink.updateMany({
        where: {
          billId,
          normalizedPhoneNumber: phone.normalized,
          expiresAt: { gt: new Date() },
          bill: { status: "UNPAID" },
        },
        data: {
          paymentSlipKey: key,
          paymentSlipFileName: fileName,
          paymentSlipContentType: contentType,
          paymentSlipSizeBytes: file.size,
          paymentSlipUploadedAt: new Date(),
        },
      });
    } catch (error) {
      await deletePrivateObject(key).catch(() => undefined);
      throw error;
    }

    if (updated.count !== 1) {
      await deletePrivateObject(key).catch(() => undefined);
      return { status: "error", error: "This payment link expired or the bill was already settled." };
    }

    if (paymentLink.paymentSlipKey && paymentLink.paymentSlipKey !== key) {
      await deletePrivateObject(paymentLink.paymentSlipKey).catch((error: unknown) => {
        console.error("Failed to remove the replaced payment slip from Bunny S3.", error);
      });
    }

    revalidatePath(`/registers/${paymentLink.bill.registerId}`);
    revalidatePath(`/registers/sessions/${paymentLink.bill.registerId}/${paymentLink.bill.registerShiftId}`);
    revalidatePath("/bill-history");

    return { status: "success", fileName };
  } catch (error) {
    console.error("Failed to upload a payment slip to Bunny S3.", error);
    if (error instanceof Error && error.message.startsWith("Missing required environment variable:")) {
      return { status: "error", error: "Payment slip storage is not configured on the server." };
    }
    return { status: "error", error: "The payment slip could not be uploaded. Please try again." };
  }
}
