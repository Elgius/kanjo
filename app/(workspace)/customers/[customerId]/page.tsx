import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard, Mail, MapPin, Pencil, Phone, ReceiptText } from "lucide-react";

import { MetricCard, PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { canAccess, requirePageAccess } from "@/lib/authorization";
import { getCustomerDetail } from "@/lib/pos/customers";
import { formatMvr } from "@/lib/pos/money";
import { cn } from "@/lib/utils";
import { settleCustomerCreditAction, updateCustomerAction } from "../actions";

export const metadata: Metadata = { title: "Customer account · Kanjo" };

const fieldClass = "h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-MV", {
    timeZone: "Indian/Maldives",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authorization = await requirePageAccess("CUSTOMERS");
  const canEdit = canAccess(authorization, "CUSTOMERS", "EDIT");
  const { customerId } = await params;
  const query = await searchParams;
  const customer = await getCustomerDetail(customerId);
  if (!customer) notFound();
  const success = single(query.success);
  const error = single(query.error);
  const editing = single(query.edit) === "1";
  const outstandingBills = customer.creditBills.filter((bill) => bill.status === "OUTSTANDING");
  const paidBills = customer.creditBills.filter((bill) => bill.status === "PAID");
  const atLimit = customer.outstandingLaari >= customer.creditLimitLaari;

  return (
    <PageContainer>
      <Link href="/customers" prefetch={false} className="flex w-fit items-center gap-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" aria-hidden="true" />All customers</Link>
      <PageHeader eyebrow="Customers / Account" title={customer.name} description={`${customer.nationality} · ${outstandingBills.length} outstanding ${outstandingBills.length === 1 ? "bill" : "bills"}`} />
      {success || error ? <p role={error ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-xs", error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-chart-1/30 bg-chart-1/10")}>{error ?? success}</p> : null}

      <section className="grid gap-3.5 sm:grid-cols-3">
        <MetricCard label="CREDIT LIMIT" value={formatMvr(customer.creditLimitLaari)} note="Account ceiling" />
        <MetricCard label="OUTSTANDING" value={formatMvr(customer.outstandingLaari)} note={`${outstandingBills.length} unpaid`} dark />
        <MetricCard label="AVAILABLE CREDIT" value={formatMvr(customer.availableCreditLaari)} note={atLimit ? "Credit holds blocked" : "Ready to use"} accent={atLimit} />
      </section>

      <section className="grid gap-3.5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)]">
        <div className="grid content-start gap-3.5">
          <Surface className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Customer details</h2>
              {canEdit ? <Link href={`/customers/${customer.id}?edit=1#edit-account`} prefetch={false} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-semibold"><Pencil className="size-3.5" aria-hidden="true" />Edit</Link> : null}
            </div>
            <div className="mt-4 grid gap-3 text-xs text-muted-foreground">
              <p className="flex gap-2"><Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{customer.email || "No email"}</p>
              <p className="flex gap-2"><Phone className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{customer.phoneNumber || "No phone number"}</p>
              <p className="flex gap-2"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{customer.address || "No address"}</p>
            </div>
          </Surface>

          {canEdit ? (
            <details id="edit-account" open={editing} className="scroll-mt-5 rounded-xl border border-border bg-card p-5">
              <summary className="cursor-pointer text-sm font-semibold">Edit account</summary>
              <form action={updateCustomerAction.bind(null, customer.id)} className="mt-4 grid gap-3">
                <label className="grid gap-1.5 text-[10px] text-muted-foreground">NAME<input name="name" required maxLength={100} defaultValue={customer.name} className={fieldClass} /></label>
                <label className="grid gap-1.5 text-[10px] text-muted-foreground">EMAIL<input name="email" type="email" maxLength={254} defaultValue={customer.email ?? ""} className={fieldClass} /></label>
                <label className="grid gap-1.5 text-[10px] text-muted-foreground">PHONE NUMBER<input name="phoneNumber" type="tel" maxLength={40} defaultValue={customer.phoneNumber ?? ""} className={fieldClass} /></label>
                <label className="grid gap-1.5 text-[10px] text-muted-foreground">NATIONALITY<input name="nationality" required maxLength={80} defaultValue={customer.nationality} className={fieldClass} /></label>
                <label className="grid gap-1.5 text-[10px] text-muted-foreground">CREDIT LIMIT (MVR)<input name="creditLimit" inputMode="decimal" required defaultValue={(customer.creditLimitLaari / 100).toFixed(2)} className={fieldClass} /></label>
                <label className="grid gap-1.5 text-[10px] text-muted-foreground">ADDRESS<textarea name="address" maxLength={500} rows={3} defaultValue={customer.address ?? ""} className="rounded-lg border border-border bg-background p-3 text-xs outline-none" /></label>
                <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Save account</button>
              </form>
            </details>
          ) : null}
        </div>

        <div className="grid content-start gap-3.5">
          <Surface className="overflow-hidden">
            <header className="flex items-end justify-between border-b border-border px-5 py-5"><div><h2 className="text-sm font-semibold">Outstanding bills</h2><p className="mt-1 text-[11px] text-muted-foreground">Stock has already been deducted. Payment records the sale.</p></div><span className="text-[11px] text-muted-foreground">{outstandingBills.length} open</span></header>
            {outstandingBills.length ? <div className="divide-y divide-border">{outstandingBills.map((bill) => (
              <article key={bill.id} className="grid gap-4 p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="font-mono text-[10px] text-muted-foreground">CREDIT · {bill.id.slice(0, 8).toUpperCase()}</p><h3 className="mt-1 text-sm font-semibold">{bill.register.name}</h3><p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(bill.issuedAt)} · {bill.createdBy.name}</p></div><p className="font-mono text-xl font-semibold">{formatMvr(bill.totalLaari)}</p></div>
                <details><summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground">View {bill.items.length} {bill.items.length === 1 ? "item" : "items"}</summary><div className="mt-3 grid gap-2 rounded-lg bg-accent p-3">{bill.items.map((item, index) => <div key={`${bill.id}:${index}`} className="flex justify-between gap-3 text-[11px]"><span>{item.quantity} × {item.productName}</span><span className="font-mono">{formatMvr(item.lineTotalLaari)}</span></div>)}</div></details>
                {bill.note ? <p className="rounded-lg bg-accent px-3 py-2 text-[11px] text-muted-foreground">{bill.note}</p> : null}
                {canEdit ? <form action={settleCustomerCreditAction.bind(null, customer.id, bill.id)} className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-end"><label className="grid gap-1 text-[9px] text-muted-foreground">PAYMENT METHOD<select name="paymentMethod" defaultValue="CASH" className={`${fieldClass} sm:w-36`}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="MOBILE">Mobile pay</option></select></label><button type="submit" className="flex h-10 items-center justify-center gap-2 rounded-lg bg-chart-1 px-4 text-xs font-semibold text-white"><CreditCard className="size-3.5" aria-hidden="true" />Bill paid</button></form> : null}
              </article>
            ))}</div> : <div className="flex min-h-44 items-center justify-center px-5 text-center text-xs text-muted-foreground">No outstanding credit bills.</div>}
          </Surface>

          <Surface className="overflow-hidden">
            <header className="flex items-end justify-between border-b border-border px-5 py-5"><div><h2 className="text-sm font-semibold">Paid bill history</h2><p className="mt-1 text-[11px] text-muted-foreground">Settled customer credit, newest first.</p></div><span className="text-[11px] text-muted-foreground">{paidBills.length} paid</span></header>
            {paidBills.length ? <div className="divide-y divide-border">{paidBills.map((bill) => (
              <div key={bill.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary"><ReceiptText className="size-4" aria-hidden="true" /></span><div><p className="text-xs font-semibold">Receipt #{bill.receiptNumber}</p><p className="mt-1 text-[10px] text-muted-foreground">{bill.register.name} · {bill.sale?.paymentMethod === "MOBILE" ? "Mobile pay" : bill.sale?.paymentMethod?.toLowerCase()} · {bill.paidAt ? formatDateTime(bill.paidAt) : "Paid"}</p></div></div><p className="font-mono text-sm font-semibold">{formatMvr(bill.totalLaari)}</p></div>
            ))}</div> : <div className="flex min-h-36 items-center justify-center px-5 text-center text-xs text-muted-foreground">No paid customer bills yet.</div>}
          </Surface>
        </div>
      </section>
    </PageContainer>
  );
}
