import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Pencil, Search, UserRound } from "lucide-react";

import { MetricCard, PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { canAccess, requirePageAccess } from "@/lib/authorization";
import { getCustomersOverview } from "@/lib/pos/customers";
import { formatMvr } from "@/lib/pos/money";
import { cn } from "@/lib/utils";
import { createCustomerAction } from "./actions";

export const metadata: Metadata = { title: "Customers · Kanjo" };

const fieldClass = "h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authorization = await requirePageAccess("CUSTOMERS");
  const canEdit = canAccess(authorization, "CUSTOMERS", "EDIT");
  const queryParams = await searchParams;
  const query = single(queryParams.query)?.trim().toLocaleLowerCase() ?? "";
  const success = single(queryParams.success);
  const error = single(queryParams.error);
  const data = await getCustomersOverview();
  const customers = query
    ? data.customers.filter((customer) =>
        [customer.name, customer.email, customer.phoneNumber, customer.nationality]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(query)),
      )
    : data.customers;

  return (
    <PageContainer>
      <PageHeader eyebrow="Accounts / Credit" title="Customers" description="Create customer accounts, set credit limits, and collect outstanding bills." />
      {success || error ? <p role={error ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-xs", error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-chart-1/30 bg-chart-1/10")}>{error ?? success}</p> : null}

      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="CUSTOMERS" value={String(data.metrics.customers)} note="Active accounts" />
        <MetricCard label="OUTSTANDING" value={formatMvr(data.metrics.outstandingLaari)} note="Unpaid credit" dark />
        <MetricCard label="AVAILABLE CREDIT" value={formatMvr(data.metrics.availableCreditLaari)} note="Across accounts" />
        <MetricCard label="AT LIMIT" value={String(data.metrics.atLimit)} note="Cannot hold more" accent={data.metrics.atLimit > 0} />
      </section>

      {canEdit ? (
        <details className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <summary className="cursor-pointer text-sm font-semibold">Add customer</summary>
          <form action={createCustomerAction} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="grid gap-1.5 text-[10px] text-muted-foreground">NAME<input name="name" required maxLength={100} className={fieldClass} /></label>
            <label className="grid gap-1.5 text-[10px] text-muted-foreground">EMAIL<input name="email" type="email" maxLength={254} className={fieldClass} /></label>
            <label className="grid gap-1.5 text-[10px] text-muted-foreground">PHONE NUMBER<input name="phoneNumber" type="tel" maxLength={40} className={fieldClass} /></label>
            <label className="grid gap-1.5 text-[10px] text-muted-foreground">NATIONALITY<input name="nationality" required maxLength={80} className={fieldClass} /></label>
            <label className="grid gap-1.5 text-[10px] text-muted-foreground">CREDIT LIMIT (MVR)<input name="creditLimit" inputMode="decimal" required defaultValue="0.00" className={fieldClass} /></label>
            <label className="grid gap-1.5 text-[10px] text-muted-foreground sm:col-span-2 xl:col-span-3">ADDRESS<textarea name="address" maxLength={500} rows={3} className="rounded-lg border border-border bg-background p-3 text-xs outline-none" /></label>
            <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground sm:w-fit">Create customer</button>
          </form>
        </details>
      ) : null}

      <form className="flex h-10 max-w-lg items-center gap-2 rounded-lg border border-border bg-card px-3">
        <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <input name="query" type="search" defaultValue={query} placeholder="Search name, email, phone, or nationality" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
      </form>

      <Surface className="overflow-hidden">
        <header className="flex items-end justify-between border-b border-border px-5 py-5 sm:px-6"><div><h2 className="text-sm font-semibold">Customer accounts</h2><p className="mt-1 text-[11px] text-muted-foreground">Open an account to view its bill history.</p></div><span className="text-[11px] text-muted-foreground">{customers.length} shown</span></header>
        {customers.length ? (
          <div className="divide-y divide-border">
            {customers.map((customer) => (
              <div key={customer.id} className="group grid gap-4 px-5 py-5 transition-colors hover:bg-accent sm:px-6 lg:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(120px,0.75fr))_auto] lg:items-center">
                <Link href={`/customers/${customer.id}`} prefetch={false} className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary"><UserRound className="size-4" aria-hidden="true" /></span><div className="min-w-0"><h3 className="truncate text-[13px] font-semibold group-hover:underline">{customer.name}</h3><p className="mt-1 truncate text-[10px] text-muted-foreground">{customer.phoneNumber || customer.email || customer.nationality}</p></div></Link>
                <div><p className="text-[9px] text-muted-foreground">CREDIT LIMIT</p><p className="mt-1 text-[13px] font-semibold">{formatMvr(customer.creditLimitLaari)}</p></div>
                <div><p className="text-[9px] text-muted-foreground">OUTSTANDING</p><p className={cn("mt-1 text-[13px] font-semibold", customer.atLimit && "text-chart-1")}>{formatMvr(customer.outstandingLaari)}</p></div>
                <div><p className="text-[9px] text-muted-foreground">AVAILABLE</p><p className="mt-1 text-[13px] font-semibold">{formatMvr(customer.availableCreditLaari)}</p></div>
                <div className="flex items-center gap-2">
                  <Link href={`/customers/${customer.id}`} prefetch={false} className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[11px] font-semibold"><span>View</span><ArrowRight className="size-3.5" aria-hidden="true" /></Link>
                  {canEdit ? <Link href={`/customers/${customer.id}?edit=1#edit-account`} prefetch={false} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground"><Pencil className="size-3.5" aria-hidden="true" />Edit</Link> : null}
                </div>
              </div>
            ))}
          </div>
        ) : <div className="flex min-h-64 items-center justify-center px-5 text-center text-xs text-muted-foreground">{query ? "No customers match this search." : "No customers yet."}</div>}
      </Surface>
    </PageContainer>
  );
}
