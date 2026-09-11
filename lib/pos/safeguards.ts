export const LARGE_CREDIT_LIMIT_LAARI = 1_000_000; // MVR 10,000: review, not a hard limit.
export const CASH_VARIANCE_THRESHOLD_LAARI = 500; // MVR 5 default.
export function normalizeCustomerName(name: string) { return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en"); }
export function creditReviewError(amount: number, confirmed: boolean, reason: string) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) return "Enter a credit limit within the supported range.";
  if (amount >= LARGE_CREDIT_LIMIT_LAARI && (!confirmed || reason.trim().length < 5 || reason.length > 500)) return "Review this unusually large credit limit and give a reason (at least 5 characters).";
  return null;
}
export function cashVarianceThreshold() {
  const configured = Number(process.env.CASH_VARIANCE_THRESHOLD_LAARI ?? CASH_VARIANCE_THRESHOLD_LAARI);
  return Number.isSafeInteger(configured) && configured >= 0 ? configured : CASH_VARIANCE_THRESHOLD_LAARI;
}
