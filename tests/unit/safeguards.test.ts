import { expect, test } from "bun:test";
import { creditReviewError, normalizeCustomerName, LARGE_CREDIT_LIMIT_LAARI } from "@/lib/pos/safeguards";
import { requestKey } from "@/lib/pos/mutation";
test("large limits require explicit review and meaningful explanation", () => {
  expect(creditReviewError(LARGE_CREDIT_LIMIT_LAARI - 1, false, "")).toBeNull();
  expect(Boolean(creditReviewError(LARGE_CREDIT_LIMIT_LAARI, false, "Approved supplier account"))).toBe(true);
  expect(Boolean(creditReviewError(LARGE_CREDIT_LIMIT_LAARI, true, " "))).toBe(true);
  expect(creditReviewError(LARGE_CREDIT_LIMIT_LAARI, true, "Approved supplier account")).toBeNull();
  expect(Boolean(creditReviewError(2147483648, true, "Reviewed"))).toBe(true);
});
test("duplicate name matching ignores case and repeated whitespace", () => {
  expect(normalizeCustomerName("  IBU   Shareer ")).toBe(normalizeCustomerName("Ibu Shareer"));
});
test("mutation forms must carry a valid request key", () => {
  const form = new FormData(); expect(()=>requestKey(form)).toThrow("Reload");
  form.set("requestId",crypto.randomUUID()); expect(requestKey(form)).toBe(form.get("requestId") as string);
});
