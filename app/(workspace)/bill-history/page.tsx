import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";

import { MetricCard, PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { authorizedRegisterIds, canAccessRegister, requireCapability } from "@/lib/authorization";
import { getBillHistoryOverview, type BillHistoryFilters } from "@/lib/pos/bills";
import { formatMvr } from "@/lib/pos/money";
import { BillHistoryTable } from "./bill-history-table";

export const metadata: Metadata = {
  title: "Bill history · Kanjo",
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const fieldClass = "h-10 min-w-0 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

export default async function BillHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authorization = await requireCapability("BILL_HISTORY_VIEW", "BILL_HISTORY_PAGE");
  const params = await searchParams;
  const rawFilters: BillHistoryFilters = {
    query: single(params.query),
    registerId: single(params.registerId),
    paymentMethod: single(params.paymentMethod) as PaymentMethod | undefined,
    dateFrom: single(params.dateFrom),
    timeFrom: single(params.timeFrom),
    dateTo: single(params.dateTo),
    timeTo: single(params.timeTo),
  };
  if (rawFilters.registerId && !canAccessRegister(authorization, rawFilters.registerId)) notFound();
  const data = await getBillHistoryOverview(rawFilters, authorizedRegisterIds(authorization));

  return (
    <PageContainer className="gap-[22px]">
      <PageHeader
        eyebrow="Sales / Receipts"
        title="Bill history"
        description="Bills from every register, newest first. Open any bill to review or reprint it."
      />

      <section className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="MATCHING BILLS" value={data.totalBills.toLocaleString("en-MV")} note="Across selected filters" />
        <MetricCard label="MATCHING SALES" value={formatMvr(data.totalLaari)} note="Completed bill total" dark />
      </section>

      <form className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" aria-label="Bill history filters">
        <label className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 md:col-span-2">
          <Search className="size-3.5 text-muted-foreground" />
          <span className="sr-only">Search bills</span>
          <input name="query" type="search" defaultValue={data.filters.query} placeholder="Receipt, cashier, or register" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
        </label>
        <select aria-label="Register" name="registerId" defaultValue={data.filters.registerId ?? ""} className={fieldClass}>
          <option value="">All registers</option>
          {data.registers.map((register) => <option key={register.id} value={register.id}>{register.name}{register.active ? "" : " (inactive)"}</option>)}
        </select>
        <select aria-label="Payment method" name="paymentMethod" defaultValue={data.filters.paymentMethod ?? ""} className={fieldClass}>
          <option value="">All payments</option>
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="MOBILE">Mobile pay</option>
        </select>
        <label className="grid gap-1 text-[10px] text-muted-foreground"><span>FROM DATE</span><input aria-label="From date" name="dateFrom" type="date" defaultValue={data.filters.dateFrom} className={fieldClass} /></label>
        <label className="grid gap-1 text-[10px] text-muted-foreground"><span>FROM TIME</span><input aria-label="From time" name="timeFrom" type="time" defaultValue={data.filters.timeFrom} className={fieldClass} /></label>
        <label className="grid gap-1 text-[10px] text-muted-foreground"><span>TO DATE</span><input aria-label="To date" name="dateTo" type="date" defaultValue={data.filters.dateTo} className={fieldClass} /></label>
        <label className="grid gap-1 text-[10px] text-muted-foreground"><span>TO TIME</span><input aria-label="To time" name="timeTo" type="time" defaultValue={data.filters.timeTo} className={fieldClass} /></label>
        <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground xl:col-start-7">Apply filters</button>
        <Link prefetch={false} href="/bill-history" className="flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold hover:bg-accent">Clear</Link>
      </form>

      <Surface className="overflow-hidden">
        <header className="flex items-end justify-between border-b border-border px-5 py-5">
          <div><h2 className="text-sm font-semibold">Saved bills</h2><p className="mt-1 text-[11px] text-muted-foreground">25 bills per page. More load automatically as you scroll.</p></div>
          <span className="text-[11px] text-muted-foreground">{data.totalBills} found</span>
        </header>
        <BillHistoryTable
          key={JSON.stringify(data.filters)}
          initialBills={data.page.bills}
          initialCursor={data.page.nextCursor}
          filters={data.filters}
          totalBills={data.totalBills}
        />
      </Surface>
    </PageContainer>
  );
}
