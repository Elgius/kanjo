import Link from "next/link";
import { redirect } from "next/navigation";

import { MetricCard, PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { SalesChart } from "@/components/pos/sales-chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMvr } from "@/lib/pos/money";
import { getOverviewData } from "@/lib/pos/queries";
import {
  auditPageDenial,
  canAccess,
  firstAccessiblePath,
  requireAuthorization,
} from "@/lib/authorization";

function comparison(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "No sales yet" : "New activity";
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? "↑" : "↓"} ${Math.abs(change).toFixed(1)}%`;
}

const categoryColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

export default async function DashboardPage() {
  const authorization = await requireAuthorization();
  if (!canAccess(authorization, "OVERVIEW")) {
    await auditPageDenial(authorization, "OVERVIEW");
    redirect(firstAccessiblePath(authorization) ?? "/access-denied");
  }
  const user = authorization.user;
  const data = await getOverviewData();
  const todayLabel = new Intl.DateTimeFormat("en-MV", {
    timeZone: "Indian/Maldives",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <PageContainer className="gap-[26px]">
      <PageHeader
        eyebrow={todayLabel}
        title={`Good morning, ${user.name.split(/\s+/)[0]}.`}
        actions={canAccess(authorization, "REGISTERS") ? (
          <Link prefetch={false} href="/registers" className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">New sale</Link>
        ) : null}
      />

      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-[340px_repeat(3,1fr)]">
        <MetricCard label="NET SALES" value={formatMvr(data.metrics.netSalesLaari)} note={comparison(data.metrics.netSalesLaari, data.metrics.previousSalesLaari)} dark className="min-h-[122px]" />
        <MetricCard label="ORDERS" value={String(data.metrics.orders)} note={`${data.metrics.orders - data.metrics.previousOrders >= 0 ? "+" : ""}${data.metrics.orders - data.metrics.previousOrders} from yesterday`} className="min-h-[122px]" />
        <MetricCard label="AVG. ORDER" value={formatMvr(data.metrics.averageOrderLaari)} note="Today" className="min-h-[122px]" />
        <MetricCard label="REFUNDS" value={String(data.metrics.refunds)} note={`${formatMvr(data.metrics.refundsLaari)} total`} className="min-h-[122px]" />
      </section>

      <section className="grid gap-3.5 xl:grid-cols-[minmax(0,714px)_1fr]">
        <Surface className="flex min-h-[344px] flex-col gap-[18px] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex flex-col gap-1"><h2 className="text-[15px] font-semibold">Sales by hour</h2><p className="text-[11px] text-muted-foreground">Today compared with the same day last week</p></div><div className="flex gap-3.5 text-[10px] text-muted-foreground"><span>● Today</span><span>○ Last week</span></div></div>
          <SalesChart data={data.hourly} />
        </Surface>

        <Surface className="flex min-h-[344px] flex-col gap-[18px] p-5">
          <div className="flex flex-col gap-1"><h2 className="text-[15px] font-semibold">Category mix</h2><p className="text-[11px] text-muted-foreground">Share of today&apos;s net sales</p></div>
          {data.categoryMix.length ? (
            <>
              <div className="flex h-4 overflow-hidden rounded-lg" aria-hidden="true">{data.categoryMix.map((category, index) => <span key={category.label} style={{ width: `${category.percentage}%`, background: categoryColors[index % categoryColors.length] }} />)}</div>
              <div className="flex flex-col gap-[13px]">{data.categoryMix.map((category) => <div key={category.label} className="flex justify-between text-xs"><span>{category.label}</span><span className="font-mono">{category.percentage}%</span></div>)}</div>
            </>
          ) : <p className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Category totals will appear after the first sale.</p>}
        </Surface>
      </section>

      <section className="grid gap-3.5 xl:grid-cols-[minmax(0,714px)_1fr]">
        <Surface className="min-h-[186px] p-[18px_20px]">
          <div className="mb-3 flex justify-between"><h2 className="text-sm font-semibold">Top products</h2>{canAccess(authorization, "INVENTORY") ? <Link prefetch={false} href="/inventory" className="text-[11px] text-muted-foreground hover:text-foreground">View inventory →</Link> : null}</div>
          {data.topProducts.length ? (
            <Table className="min-w-[560px] text-left text-xs"><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="h-7 w-[320px] p-0 text-[10px] font-normal text-muted-foreground">PRODUCT</TableHead><TableHead className="h-7 w-[100px] p-0 text-[10px] font-normal text-muted-foreground">UNITS</TableHead><TableHead className="h-7 p-0 text-right text-[10px] font-normal text-muted-foreground">SALES</TableHead></TableRow></TableHeader><TableBody>{data.topProducts.map((product) => <TableRow key={product.name} className="h-[30px] border-0 hover:bg-transparent"><TableCell className="p-0 font-medium">{product.name}</TableCell><TableCell className="p-0">{product.units}</TableCell><TableCell className="p-0 text-right font-mono">{formatMvr(product.salesLaari)}</TableCell></TableRow>)}</TableBody></Table>
          ) : <p className="py-10 text-center text-xs text-muted-foreground">No product sales today.</p>}
        </Surface>

        <Surface className="min-h-[186px] p-[18px_20px]">
          <div className="mb-3.5 flex justify-between"><h2 className="text-sm font-semibold">Register pulse</h2><span className="text-[11px] text-muted-foreground">{data.registerPulse.length} open</span></div>
          {data.registerPulse.length ? <div className="flex flex-col gap-3.5">{data.registerPulse.map((register) => canAccess(authorization, "REGISTERS") ? <Link prefetch={false} href={`/registers?register=${register.id}`} key={register.id} className="grid grid-cols-[1fr_78px_auto] items-center text-xs hover:underline"><span>{register.name}</span><span className="text-chart-1">● Open</span><span className="text-right font-mono">{formatMvr(register.salesLaari)}</span></Link> : <div key={register.id} className="grid grid-cols-[1fr_78px_auto] items-center text-xs"><span>{register.name}</span><span className="text-chart-1">● Open</span><span className="text-right font-mono">{formatMvr(register.salesLaari)}</span></div>)}</div> : <p className="py-10 text-center text-xs text-muted-foreground">No open registers.</p>}
        </Surface>
      </section>
    </PageContainer>
  );
}
