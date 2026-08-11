import Link from "next/link";
import { ArrowDown, ArrowUp, Search } from "lucide-react";

import { MetricCard, PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMvr } from "@/lib/pos/money";
import { dateOnly, formatQuantity, maldivesDate, quantityNumber } from "@/lib/pos/inventory";
import { getStockData, type StockFilters } from "@/lib/pos/queries";
import { cn } from "@/lib/utils";
import { requirePageAccess } from "@/lib/authorization";

const fieldClass =
  "h-11 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-MV", {
    timeZone: "Indian/Maldives",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

const movementLabels = {
  INITIAL: "Opening stock",
  ADJUSTMENT: "Adjustment",
  SALE: "Sale",
  REFUND: "Refund",
} as const;

export default async function StockPage({ searchParams }: PageProps<"/stock">) {
  await requirePageAccess("STOCK");
  const params = await searchParams;
  const rawMovement = single(params.movement);
  const filters: StockFilters = {
    register: single(params.register),
    query: single(params.query),
    movement: ["INITIAL", "ADJUSTMENT", "SALE", "REFUND"].includes(rawMovement ?? "")
      ? (rawMovement as StockFilters["movement"])
      : "all",
  };
  const data = await getStockData(filters);

  return (
    <PageContainer className="gap-[22px]">
      <PageHeader
        eyebrow="Inventory ledger"
        title="Stock"
        description="See current stock counts and every movement, scoped to the register responsible for it."
      />

      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="STOCK ITEMS ON HAND" value={Number(data.metrics.unitsOnHand.toFixed(3)).toLocaleString()} dark />
        <MetricCard label="STOCK VALUE" value={formatMvr(data.metrics.stockValueLaari)} />
        <MetricCard label="LOW STOCK ITEMS" value={String(data.metrics.lowStock)} accent />
        <MetricCard label="OUT OF STOCK" value={String(data.metrics.outOfStock)} />
      </section>

      <form className="flex flex-col gap-2.5 xl:flex-row" aria-label="Stock filters">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 xl:flex-[2]">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search stock</span>
          <input
            name="query"
            defaultValue={filters.query}
            type="search"
            placeholder="Search item, SKU, or movement reason"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
        </label>
        <select
          name="register"
          aria-label="Register"
          defaultValue={filters.register ?? "all"}
          className={`${fieldClass} text-center [text-align-last:center] xl:w-[190px]`}
        >
          <option value="all">All registers</option>
          {data.registers.map((register) => (
            <option key={register.id} value={register.id}>{register.name} · {register.code}</option>
          ))}
        </select>
        <select
          name="movement"
          aria-label="Movement type"
          defaultValue={filters.movement ?? "all"}
          className={`${fieldClass} xl:w-[180px]`}
        >
          <option value="all">All movements</option>
          <option value="INITIAL">Opening stock</option>
          <option value="ADJUSTMENT">Adjustments</option>
          <option value="SALE">Sales</option>
          <option value="REFUND">Refunds</option>
        </select>
        <button type="submit" className="h-11 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Apply filters</button>
        {(filters.query || (filters.register && filters.register !== "all") || filters.movement !== "all") ? (
          <Link prefetch={false} href="/stock" className="flex h-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold hover:bg-accent">Clear</Link>
        ) : null}
      </form>

      <Surface className="overflow-hidden px-5">
        <header className="flex items-end justify-between gap-4 border-b border-border py-5">
          <div>
            <h2 className="text-sm font-semibold">Current stock</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">One row per item at its assigned register.</p>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {data.products.length} {data.products.length === 1 ? "item" : "items"}
          </span>
        </header>
        {data.products.length ? (
          <Table className="min-w-[960px] text-left text-xs">
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead className="h-11 w-[240px] p-0 text-[10px] font-normal text-muted-foreground">ITEM</TableHead>
              <TableHead className="h-11 w-[160px] p-0 text-[10px] font-normal text-muted-foreground">REGISTER</TableHead>
              <TableHead className="h-11 w-[130px] p-0 text-[10px] font-normal text-muted-foreground">TYPE</TableHead>
              <TableHead className="h-11 w-[190px] p-0 text-[10px] font-normal text-muted-foreground">CONTENTS</TableHead>
              <TableHead className="h-11 w-[110px] p-0 text-[10px] font-normal text-muted-foreground">ON HAND</TableHead>
              <TableHead className="h-11 p-0 text-right text-[10px] font-normal text-muted-foreground">VALUE</TableHead>
            </TableRow></TableHeader>
            <TableBody>{data.products.map((product) => {
              const low = product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold;
              const contents = product.kind === "CONSUMABLE"
                ? `${product.quantityValue?.toString()} ${product.quantityMetric} · ${product.servingSize?.toString()} ${product.quantityMetric}/serving`
                : "Sold by unit";
              return (
                <TableRow key={product.id} className="h-[62px] hover:bg-accent/40">
                  <TableCell className="p-0"><span className="grid gap-0.5"><span className="font-semibold">{product.name}</span><span className="font-mono text-[10px] text-muted-foreground">{product.sku}</span></span></TableCell>
                  <TableCell className="p-0"><span className="grid gap-0.5"><span>{product.register.name}</span><span className="font-mono text-[10px] text-muted-foreground">{product.register.code}</span></span></TableCell>
                  <TableCell className="p-0">{product.kind === "CONSUMABLE" ? "Consumable" : "Goods"}</TableCell>
                  <TableCell className="p-0 text-[11px] text-muted-foreground">{contents}</TableCell>
                  <TableCell className={cn("p-0 font-semibold", low && "text-chart-1", product.stockQuantity === 0 && "text-destructive")}>
                    {Number(product.stockQuantity.toFixed(3)).toLocaleString()}{product.kind === "CONSUMABLE" ? ` · ${formatQuantity(product, product.measuredOnHand)}` : ""}{product.stockQuantity === 0 ? " · OUT" : low ? " · LOW" : ""}
                  </TableCell>
                  <TableCell className="p-0 text-right font-mono">{formatMvr(product.stockQuantity * product.costPriceLaari)}</TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        ) : (
          <div className="flex min-h-40 items-center justify-center text-center text-xs text-muted-foreground">No stock items match these filters.</div>
        )}
      </Surface>

      <Surface className="overflow-hidden px-5">
        <header className="border-b border-border py-5"><h2 className="text-sm font-semibold">Expiry batches</h2><p className="mt-1 text-[11px] text-muted-foreground">Physical stock grouped by delivery and expiry date.</p></header>
        <div className="divide-y divide-border">{data.batches.length ? data.batches.map((batch) => {
          const today = maldivesDate();
          const status = !batch.expiryDate ? "Expiry missing" : batch.expiryDate < today ? "Expired" : "Usable";
          return <div key={batch.id} className="grid gap-2 py-4 text-xs sm:grid-cols-[1fr_180px_160px] sm:items-center"><span><strong>{batch.product.name}</strong><small className="ml-2 font-mono text-muted-foreground">{batch.product.sku}</small></span><span>{formatQuantity(batch.product, quantityNumber(batch.remainingQuantity))}</span><span className={cn(status === "Expired" && "text-destructive", status === "Usable" && "text-emerald-700")}>{status}{batch.expiryDate ? ` · ${dateOnly(batch.expiryDate)}` : ""}</span></div>;
        }) : <p className="py-8 text-center text-xs text-muted-foreground">No remaining stock batches.</p>}</div>
      </Surface>

      <Surface className="overflow-hidden px-5">
        <header className="flex items-end justify-between gap-4 border-b border-border py-5">
          <div>
            <h2 className="text-sm font-semibold">Stock movements</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">Audited changes with the resulting item balance.</p>
          </div>
          <span className="text-right text-[11px] text-muted-foreground">
            Showing {data.movements.length} of {data.movementCount}
          </span>
        </header>
        {data.movements.length ? (
          <Table className="min-w-[1120px] text-left text-xs">
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead className="h-11 w-[170px] p-0 text-[10px] font-normal text-muted-foreground">DATE &amp; TIME</TableHead>
              <TableHead className="h-11 w-[155px] p-0 text-[10px] font-normal text-muted-foreground">REGISTER</TableHead>
              <TableHead className="h-11 w-[220px] p-0 text-[10px] font-normal text-muted-foreground">ITEM</TableHead>
              <TableHead className="h-11 w-[145px] p-0 text-[10px] font-normal text-muted-foreground">MOVEMENT</TableHead>
              <TableHead className="h-11 w-[90px] p-0 text-right text-[10px] font-normal text-muted-foreground">CHANGE</TableHead>
              <TableHead className="h-11 w-[100px] p-0 text-right text-[10px] font-normal text-muted-foreground">BALANCE</TableHead>
              <TableHead className="h-11 p-0 pl-8 text-[10px] font-normal text-muted-foreground">DETAILS</TableHead>
            </TableRow></TableHeader>
            <TableBody>{data.movements.map((movement) => {
              const positive = movement.quantityDelta > 0;
              const reference = movement.sale
                ? `Receipt #${movement.sale.receiptNumber.toString()}`
                : movement.reason || "No reason supplied";
              return (
                <TableRow key={movement.id} className="h-[66px] hover:bg-accent/40">
                  <TableCell className="p-0 text-[11px]">{formatDateTime(movement.createdAt)}</TableCell>
                  <TableCell className="p-0"><span className="grid gap-0.5"><span>{movement.register.name}</span><span className="font-mono text-[10px] text-muted-foreground">{movement.register.code}</span></span></TableCell>
                  <TableCell className="p-0"><span className="grid gap-0.5"><span className="font-semibold">{movement.product.name}</span><span className="font-mono text-[10px] text-muted-foreground">{movement.product.sku}</span></span></TableCell>
                  <TableCell className="p-0"><span className="inline-flex rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold">{movementLabels[movement.type]}</span></TableCell>
                  <TableCell className={cn("p-0 text-right font-mono font-semibold", positive ? "text-emerald-700" : "text-destructive")}>
                    <span className="inline-flex items-center gap-1">{positive ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />}{positive ? "+" : ""}{formatQuantity(movement.product, movement.quantityDelta)}</span>
                  </TableCell>
                  <TableCell className="p-0 text-right font-mono font-semibold">{formatQuantity(movement.product, movement.balanceAfter)}</TableCell>
                  <TableCell className="p-0 pl-8"><span className="grid gap-0.5"><span>{reference}</span><span className="text-[10px] text-muted-foreground">By {movement.createdBy.name}</span></span></TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        ) : (
          <div className="flex min-h-44 flex-col items-center justify-center gap-1 text-center">
            <h3 className="text-sm font-semibold">No movements found</h3>
            <p className="text-xs text-muted-foreground">Opening stock, adjustments, sales, and refunds will appear here.</p>
          </div>
        )}
      </Surface>
    </PageContainer>
  );
}
