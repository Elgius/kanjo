"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, FileUp, Phone, ReceiptText } from "lucide-react";

import { formatMvr } from "@/lib/pos/money";
import {
  lookupPaymentBillAction,
  uploadPaymentSlipAction,
  type PaymentBillLookupState,
  type PaymentSlipUploadState,
} from "./actions";

const initialState: PaymentBillLookupState = { status: "idle" };
const initialUploadState: PaymentSlipUploadState = { status: "idle" };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-MV", {
    timeZone: "Indian/Maldives", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

export function PaymentLookup({ billId }: { billId: string }) {
  const lookup = lookupPaymentBillAction.bind(null, billId);
  const [state, formAction, pending] = useActionState(lookup, initialState);
  const upload = uploadPaymentSlipAction.bind(null, billId);
  const [uploadState, uploadFormAction, uploadPending] = useActionState(upload, initialUploadState);
  const [countryCode, setCountryCode] = useState("+960");
  const [phoneNumber, setPhoneNumber] = useState("");
  const bill = state.status === "success" ? state.bill : null;
  const unpaid = bill?.status === "UNPAID";

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <form action={formAction} className="grid gap-4">
          <div className="text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"><Phone className="size-5" aria-hidden="true" /></span>
            <h2 className="mt-3 text-base font-semibold">Enter your phone number</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Use the same number provided to the cashier.</p>
          </div>
          <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3">
            <label className="grid gap-2 text-[10px] tracking-[0.08em] text-muted-foreground">
              COUNTRY CODE
              <input name="countryCode" type="tel" inputMode="tel" autoComplete="tel-country-code" maxLength={4} required value={countryCode} onChange={(event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 3); setCountryCode(digits ? `+${digits}` : "+"); }} className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/15" />
            </label>
            <label className="grid gap-2 text-[10px] tracking-[0.08em] text-muted-foreground">
              PHONE NUMBER
              <input name="phoneNumber" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14} required placeholder="0000000" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, "").slice(0, 14))} className="h-11 min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/15" />
            </label>
          </div>
          {state.status === "error" ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">{state.error}</p> : null}
          <button type="submit" disabled={pending} className="h-11 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-45">{pending ? "Looking up bill…" : "View bill"}</button>
        </form>
      </section>

      {bill ? (
        <>
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <header className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ReceiptText className="size-5" aria-hidden="true" /></span>
                <div><p className="font-mono text-[10px] text-muted-foreground">BILL #{bill.billNumber}</p><h2 className="mt-1 text-base font-semibold">{bill.registerName}</h2><p className="mt-1 text-[11px] text-muted-foreground">{bill.registerCode} · {formatDateTime(bill.openedAt)}</p></div>
              </div>
              <span className={`w-fit rounded-full px-3 py-1.5 text-[10px] font-semibold ${unpaid ? "bg-chart-1/10 text-chart-1" : "bg-emerald-100 text-emerald-800"}`}>{unpaid ? "AWAITING PAYMENT" : bill.status}</span>
            </header>
            <div className="grid gap-3 p-5 sm:p-6">
              {bill.items.map((item) => <div key={item.id} className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"><div className="min-w-0"><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.quantity} × {formatMvr(item.unitPriceLaari)}</p></div><p className="shrink-0 font-mono text-sm font-semibold">{formatMvr(item.lineTotalLaari)}</p></div>)}
            </div>
            <div className="grid gap-2 border-t border-border bg-background/40 p-5 sm:p-6">
              <div className="flex justify-between text-xs text-muted-foreground"><span>Subtotal</span><span className="font-mono">{formatMvr(bill.subtotalLaari)}</span></div>
              {bill.additionalCosts.map((cost) => <div key={cost.id} className="flex justify-between text-xs text-muted-foreground"><span>{cost.name}{cost.type === "PERCENTAGE" ? ` · ${cost.percentageBasisPoints! / 100}%` : ""}</span><span className="font-mono">{formatMvr(cost.amountLaari)}</span></div>)}
              <div className="flex items-end justify-between pt-2"><span className="text-sm font-semibold">Total</span><span className="font-mono text-2xl font-bold">{formatMvr(bill.totalLaari)}</span></div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            {unpaid ? (
              <form action={uploadFormAction} className="grid gap-4 text-center">
                <input type="hidden" name="countryCode" value={countryCode} />
                <input type="hidden" name="phoneNumber" value={phoneNumber} />
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-chart-1/10 text-chart-1"><FileUp className="size-5" aria-hidden="true" /></span>
                <div><h2 className="text-base font-semibold">Upload payment slip</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Choose a clear JPEG, PNG, WebP, HEIC, or PDF up to 5 MB.</p></div>
                <input name="paymentSlip" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" required className="block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-left text-xs file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-semibold" />
                {uploadState.status === "error" ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">{uploadState.error}</p> : null}
                {uploadState.status === "success" ? <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">{uploadState.fileName} was uploaded successfully.</p> : null}
                <button type="submit" disabled={uploadPending} className="h-11 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-45">{uploadPending ? "Uploading…" : "Upload payment slip"}</button>
                <p className="text-[10px] text-muted-foreground">Uploading another file replaces the slip attached to this bill.</p>
              </form>
            ) : <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="size-5" aria-hidden="true" /></span><div><h2 className="text-sm font-semibold">This bill is already settled</h2><p className="mt-1 text-xs text-muted-foreground">No payment slip is required.</p></div></div>}
          </section>
        </>
      ) : null}
    </div>
  );
}
