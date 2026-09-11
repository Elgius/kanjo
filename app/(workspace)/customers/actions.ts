"use server";
import { mutateOnce, requestKey, MutationError } from "@/lib/pos/mutation";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuditRequestContext, safeWriteAudit, writeAudit } from "@/lib/audit";
import {
  requireCreditSettlementOperation,
  requireGlobalOperation,
  type AuthorizationContext,
} from "@/lib/authorization";
import { creditReviewError, normalizeCustomerName } from "@/lib/pos/safeguards";
import { prisma } from "@/lib/db";
import { settleCustomerCredit } from "@/lib/pos/customers";
import { PosError } from "@/lib/pos/sales";
import { parseMvr } from "@/lib/pos/money";
import { parseCreditSettlementForm, parseCustomerForm } from "@/lib/pos/validation";

function customerRedirect(
  path: "/customers" | `/customers/${string}`,
  kind: "success" | "error",
  message: string,
): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

function actorLabel(authorization: AuthorizationContext) {
  return authorization.user.username ?? authorization.user.email;
}

export async function createCustomerAction(formData: FormData) {
  const authorization = await requireGlobalOperation("CUSTOMER_CREATE");
  const parsed = parseCustomerForm(formData);
  if (!parsed.ok) customerRedirect("/customers", "error", parsed.error);
  const request = await getAuditRequestContext();

  let customer;
  try {
    const reviewReason = String(formData.get("creditLimitReason") ?? "").trim();
    const reviewError = creditReviewError(parsed.data.creditLimitLaari, formData.get("creditLimitReviewed") === "on", reviewReason);
    if (reviewError) throw new MutationError(reviewError);
    customer = await mutateOnce(prisma, `customer:${authorization.user.id}`, requestKey(formData), parsed.data, async (tx) => {
      const candidates = await tx.customer.findMany({ where: { active: true }, select: { id: true, name: true, email: true, phoneNumber: true } });
      const matches = candidates.filter(c => normalizeCustomerName(c.name) === normalizeCustomerName(parsed.data.name)
        || (parsed.data.email && c.email?.toLowerCase() === parsed.data.email.toLowerCase())
        || (parsed.data.phoneNumber && c.phoneNumber?.replace(/\D/g, "") === parsed.data.phoneNumber.replace(/\D/g, "")));
      const duplicateReason = String(formData.get("duplicateReason") ?? "").trim();
      if (matches.length && (formData.get("distinctCustomer") !== "on" || duplicateReason.length < 5)) {
        throw new MutationError(`Possible duplicate customer: ${matches.map(c => c.name).join(", ")}. Review the existing accounts before creating another.`);
      }
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
        metadata: { creditLimitLaari: created.creditLimitLaari, reviewReason, duplicateReason, matchingCustomerIds: matches.map(c => c.id) },
        request,
      });
      return created;
    });
  } catch (error) {
    await safeWriteAudit({
      outcome: "FAILURE",
      event: "CUSTOMER_CREATE",
      page: "CUSTOMERS",
      actorId: authorization.user.id,
      actorLabel: actorLabel(authorization),
      summary: "The customer could not be created.",
      request,
    });
    customerRedirect("/customers", "error", error instanceof MutationError ? error.message : "The customer could not be created.");
  }
  revalidatePath("/customers");
  revalidatePath("/registers", "layout");
  customerRedirect(`/customers/${customer.id}`, "success", "Customer created.");
}

export async function updateCustomerAction(customerId: string, formData: FormData) {
  const authorization = await requireGlobalOperation("CUSTOMER_UPDATE");
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
      const customer = await tx.customer.update({
        where: { id: customerId },
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          address: parsed.data.address,
          phoneNumber: parsed.data.phoneNumber,
          nationality: parsed.data.nationality,
        },
      });
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
    const message = error instanceof PosError || error instanceof MutationError ? error.message : "The customer could not be updated.";
    customerRedirect(`/customers/${customerId}`, "error", message);
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/registers", "layout");
  customerRedirect(`/customers/${customerId}`, "success", "Customer updated.");
}

export async function updateCustomerCreditLimitAction(customerId: string, formData: FormData) {
  const authorization = await requireGlobalOperation("CUSTOMER_CREDIT_LIMIT_UPDATE");
  const creditLimitLaari = parseMvr(formData.get("creditLimit"));
  if (creditLimitLaari === null) customerRedirect(`/customers/${customerId}`, "error", "Enter a valid credit limit.");
  try {
    const reviewReason = String(formData.get("creditLimitReason") ?? "").trim();
    const reviewError = creditReviewError(creditLimitLaari, formData.get("creditLimitReviewed") === "on", reviewReason);
    if (reviewError) throw new MutationError(reviewError);
    const request = await getAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const before = await tx.customer.findFirst({ where: { id: customerId, active: true }, select: { name: true, creditLimitLaari: true } });
      if (!before) throw new PosError("Customer not found.");
      await tx.customer.update({ where: { id: customerId }, data: { creditLimitLaari } });
      await writeAudit(tx, { outcome: "SUCCESS", event: "CUSTOMER_CREDIT_LIMIT_UPDATE", page: "CUSTOMERS",
        actorId: authorization.user.id, actorLabel: actorLabel(authorization), targetType: "customer",
        targetId: customerId, summary: `Credit limit updated for ${before.name}.`,
        metadata: { before: before.creditLimitLaari, after: creditLimitLaari, reviewReason }, request });
    });
  } catch (error) {
    customerRedirect(`/customers/${customerId}`, "error", error instanceof PosError || error instanceof MutationError ? error.message : "The credit limit could not be updated.");
  }
  revalidatePath("/customers"); revalidatePath(`/customers/${customerId}`); revalidatePath("/registers", "layout");
  customerRedirect(`/customers/${customerId}`, "success", "Credit limit updated.");
}

export async function settleCustomerCreditAction(
  customerId: string,
  creditBillId: string,
  formData: FormData,
) {
  const { authorization } = await requireCreditSettlementOperation(creditBillId, "CUSTOMER_CREDIT_SETTLE");
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
    const message = error instanceof PosError || error instanceof MutationError ? error.message : "The customer payment could not be recorded.";
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

export async function mergeCustomerAction(sourceId: string, formData: FormData) {
  const authorization = await requireGlobalOperation("CUSTOMER_UPDATE");
  // Merging moves all credit history, including bills from other registers.
  if (!authorization.user.isSiteAdmin) customerRedirect(`/customers/${sourceId}`, "error", "A site administrator must review customer merges.");
  const targetId = String(formData.get("targetId") ?? "");
  try {
    if (formData.get("confirmMerge") !== "on") throw new MutationError("Confirm that these accounts belong to the same person.");
    const { mergeCustomers } = await import("@/lib/pos/customer-merge");
    await mergeCustomers(prisma, { sourceId, targetId, sourceUpdatedAt: String(formData.get("sourceUpdatedAt")), targetUpdatedAt: String(formData.get("targetUpdatedAt")), reason: String(formData.get("mergeReason") ?? ""), requestId: requestKey(formData), actorId: authorization.user.id, actorLabel: actorLabel(authorization) });
  } catch (error) {
    customerRedirect(`/customers/${sourceId}`, "error", error instanceof MutationError ? error.message : "The accounts could not be merged.");
  }
  revalidatePath("/customers", "layout"); revalidatePath("/registers", "layout");
  customerRedirect(`/customers/${targetId}`, "success", "Accounts merged. Credit history retained; source account archived.");
}
