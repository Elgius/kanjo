"use client";
import { useState } from "react";
import { LARGE_CREDIT_LIMIT_LAARI } from "@/lib/pos/safeguards";
import { parseMvr, formatMvr } from "@/lib/pos/money";
export function CreditReview({ defaultValue = "0.00" }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  const large = (parseMvr(value) ?? 0) >= LARGE_CREDIT_LIMIT_LAARI;
  return <div className="grid gap-3">
    <label className="grid gap-1.5 text-xs">Credit limit (MVR)<input name="creditLimit" inputMode="decimal" required value={value} onChange={e => setValue(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3" /></label>
    {large && <div className="grid gap-3 rounded-lg border border-chart-1 p-3 text-xs">
      <p role="status">Unusually large credit limit: {formatMvr(parseMvr(value) ?? 0)}. Limits of {formatMvr(LARGE_CREDIT_LIMIT_LAARI)} or more require review.</p>
      <label className="flex gap-2"><input type="checkbox" name="creditLimitReviewed" required />I have verified this amount and customer.</label>
      <label className="grid gap-1">Reason for this limit<textarea name="creditLimitReason" required minLength={5} maxLength={500} className="rounded border p-2" /></label>
    </div>}
  </div>;
}
