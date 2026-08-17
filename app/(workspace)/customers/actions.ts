"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuditRequestContext, safeWriteAudit, writeAudit } from "@/lib/audit";
import { requireActionAccess } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { settleCustomerCredit } from "@/lib/pos/customers";
import { PosError } from "@/lib/pos/sales";
import { parseCreditSettlementForm, parseCustomerForm } from "@/lib/pos/validation";

function customerRedirect(
  path: "/customers" | `/customers/${string}`,
  kind: "success" | "error",
  message: string,
): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

function actorLabel(authorization: Awaited<ReturnType<typeof requireActionAccess>>) {
  return authorization.user.username ?? authorization.user.email;
}

export async function createCustomerAction(formData: FormData) {
  const authorization = await requireActionAccess("CUSTOMERS", "CUSTOMER_CREATE");
  const parsed = parseCustomerForm(formData);
  if (!parsed.ok) customerRedirect("/customers", "error", parsed.error);
  const request = await getAuditRequestContext();

  try {
    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({ data: parsed.data });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "CUSTOMER_CREATE",
        page: "CUSTOMERS",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "customer",
        targetId: created.id,
        summary: `Customer ${created.name} created.`,
        metadata: { creditLimitLaari: created.creditLimitLaari },
        request,
      });
      return created;
    });
    revalidatePath("/customers");
    revalidatePath("/registers", "layout");
    customerRedirect(`/customers/${customer.id}`, "success", "Customer created.");
  } catch {
    await safeWriteAudit({
      outcome: "FAILURE",
      event: "CUSTOMER_CREATE",
      page: "CUSTOMERS",
      actorId: authorization.user.id,
      actorLabel: actorLabel(authorization),
      summary: "The customer could not be created.",
      request,
    });
    customerRedirect("/customers", "error", "The customer could not be created.");
  }
}

export async function updateCustomerAction(customerId: string, formData: FormData) {
  const authorization = await requireActionAccess("CUSTOMERS", "CUSTOMER_UPDATE");
  const parsed = parseCustomerForm(formData);
  if (!parsed.ok) customerRedirect(`/customers/${customerId}`, "error", parsed.error);

  try {
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const before = await tx.customer.findFirst({
        where: { id: customerId, active: true },
        select: { name: true, creditLimitLaari: true },
      });
      if (!before) throw new PosError("Customer not found.");
      const customer = await tx.customer.update({ where: { id: customerId }, data: parsed.data });
      await writeAudit(tx, {
        outcome: "SUCCESS",
        event: "CUSTOMER_UPDATE",
        page: "CUSTOMERS",
        actorId: authorization.user.id,
        actorLabel: actorLabel(authorization),
        targetType: "customer",
        targetId: customer.id,
        summary: `Customer ${customer.name} updated.`,
        metadata: { before, after: { name: customer.name, creditLimitLaari: customer.creditLimitLaari } },
        request,
      });
    });
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The customer could not be updated.";
    customerRedirect(`/customers/${customerId}`, "error", message);
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/registers", "layout");
  customerRedirect(`/customers/${customerId}`, "success", "Customer updated.");
}

export async function settleCustomerCreditAction(
  customerId: string,
  creditBillId: string,
  formData: FormData,
) {
  const authorization = await requireActionAccess("CUSTOMERS", "CUSTOMER_CREDIT_SETTLE");
  const parsed = parseCreditSettlementForm(formData);
  if (!parsed.ok) customerRedirect(`/customers/${customerId}`, "error", parsed.error);

  let receiptNumber: bigint;
  try {
    const sale = await settleCustomerCredit(prisma, {
      creditBillId,
      settledById: authorization.user.id,
      cashierName: authorization.user.name,
      paymentMethod: parsed.data.paymentMethod,
      audit: {
        actorLabel: actorLabel(authorization),
        request: await getAuditRequestContext(),
      },
    });
    receiptNumber = sale.receiptNumber;
  } catch (error) {
    const message = error instanceof PosError ? error.message : "The customer payment could not be recorded.";
    await safeWriteAudit({
      outcome: "FAILURE",
      event: "CUSTOMER_CREDIT_SETTLE",
      page: "CUSTOMERS",
      actorId: authorization.user.id,
      actorLabel: actorLabel(authorization),
      summary: message,
      metadata: { customerId, creditBillId },
      request: await getAuditRequestContext(),
    });
    customerRedirect(`/customers/${customerId}`, "error", message);
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/registers");
  revalidatePath("/registers/sessions");
  revalidatePath("/bill-history");
  revalidatePath("/stock");
  revalidatePath("/");
  revalidatePath("/", "layout");
  customerRedirect(`/customers/${customerId}`, "success", `Receipt #${receiptNumber} recorded.`);
}
