import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

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
import { getInventoryData, type InventoryFilters } from "@/lib/pos/queries";
import { cn } from "@/lib/utils";
import { canAccess, requirePageAccess } from "@/lib/authorization";
import { assignBatchExpiryAction, receiveStockAction, writeOffBatchAction } from "./actions";
import { NewProductMenu } from "./product-form";

const fieldClass =
  "h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function inventoryHref(
  current: Record<string, string | string[] | undefined>,
  page: number,
) {
  const params = new URLSearchParams();
  for (const key of ["query", "category", "register", "status", "sort"]) {
    const value = single(current[key]);
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `/inventory?${params.toString()}`;
}

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  const authorization = await requirePageAccess("INVENTORY");
  const canEdit = canAccess(authorization, "INVENTORY", "EDIT");
  const params = await searchParams;
  const rawStatus = single(params.status);
  const rawSort = single(params.sort);
  const filters: InventoryFilters = {
    query: single(params.query),
    category: single(params.category),
    register: single(params.register),
    status: ["low", "out", "in"].includes(rawStatus ?? "")
      ? (rawStatus as InventoryFilters["status"])
      : "all",
    sort: ["name", "stock"].includes(rawSort ?? "")
      ? (rawSort as InventoryFilters["sort"])
      : "recent",
    page: Number(single(params.page)) || 1,
  };
  const data = await getInventoryData(filters);
  const success = single(params.success);
  const error = single(params.error);

  return (
    <PageContainer className="gap-[22px]">
      <PageHeader
        eyebrow="Catalogue"
        title="Inventory"
        description="Manage products, pricing, and stock from one live catalogue."
        actions={canEdit ? <NewProductMenu registers={data.registers} /> : null}
      />

      {success || error ? (
        <p role={error ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-xs", error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-chart-1/30 bg-chart-1/10")}>
          {error ?? success}
        </p>
      ) : null}

      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-[340px_repeat(3,1fr)]">
        <MetricCard label="INVENTORY VALUE" value={formatMvr(data.metrics.inventoryValueLaari)} dark />
        <MetricCard label="ACTIVE SKUS" value={data.metrics.activeSkus.toLocaleString()} />
        <MetricCard label="LOW STOCK" value={String(data.metrics.lowStock)} accent />
        <MetricCard label="OUT OF STOCK" value={String(data.metrics.outOfStock)} />
      </section>

      <form className="flex flex-col gap-2.5 xl:flex-row">
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border bg-card px-3.5 xl:flex-[2]">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search inventory</span>
          <input name="query" defaultValue={filters.query} type="search" placeholder="Search product, SKU, or barcode" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
        </label>
        <select name="category" aria-label="Category" defaultValue={filters.category ?? "all"} className={`${fieldClass} h-11 xl:w-[170px]`}>
          <option value="all">All categories</option>
          {data.categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select name="register" aria-label="Register" defaultValue={filters.register ?? "all"} className={`${fieldClass} h-11 xl:w-[170px]`}>
          <option value="all">All registers</option>
          {data.registers.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}
        </select>
        <select name="status" aria-label="Stock status" defaultValue={filters.status} className={`${fieldClass} h-11 xl:w-[150px]`}>
          <option value="all">All stock</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option>
        </select>
        <select name="sort" aria-label="Sort inventory" defaultValue={filters.sort} className={`${fieldClass} h-11 xl:w-[175px]`}>
          <option value="recent">Recently updated</option><option value="name">Product name</option><option value="stock">Lowest stock</option>
        </select>
        <button type="submit" className="h-11 rounded-lg border border-border bg-card px-4 text-xs font-semibold hover:bg-accent">Apply</button>
      </form>

      <Surface className="min-h-[360px] overflow-hidden px-5">
        {data.products.length ? (
          <Table className="min-w-[1160px] text-left text-xs">
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead className="h-12 w-[310px] p-0 text-[10px] font-normal text-muted-foreground">PRODUCT</TableHead>
              <TableHead className="h-12 w-[140px] p-0 text-[10px] font-normal text-muted-foreground">SKU</TableHead>
              <TableHead className="h-12 w-[150px] p-0 text-[10px] font-normal text-muted-foreground">REGISTER</TableHead>
              <TableHead className="h-12 w-[120px] p-0 text-[10px] font-normal text-muted-foreground">TYPE</TableHead>
              <TableHead className="h-12 w-[110px] p-0 text-[10px] font-normal text-muted-foreground">ON HAND</TableHead>
              <TableHead className="h-12 w-[130px] p-0 text-[10px] font-normal text-muted-foreground">RETAIL</TableHead>
              <TableHead className="h-12 p-0 text-right text-[10px] font-normal text-muted-foreground">ADJUST</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.products.map((product) => {
                const low = product.stockQuantity > 0 && product.stockQuantity <= product.lowStockThreshold;
                return (
                  <TableRow key={product.id} className="h-[66px] hover:bg-transparent">
                    <TableCell className="p-0"><span className="flex flex-col"><span className="font-semibold">{product.name}</span><span className="text-[10px] text-muted-foreground">{product.description || "No description"}</span></span></TableCell>
                    <TableCell className="p-0 font-mono text-[11px]">{product.sku}</TableCell>
                    <TableCell className="p-0">{product.register.name}</TableCell>
                    <TableCell className="p-0">{product.kind === "CONSUMABLE" ? "Consumable" : "Goods"}</TableCell>
                    <TableCell className={cn("p-0 font-semibold", low && "text-chart-1", product.stockQuantity === 0 && "text-destructive")}>
                      {Number(product.stockQuantity.toFixed(3)).toLocaleString()}{product.kind === "CONSUMABLE" ? ` units · ${formatQuantity(product, product.measuredOnHand)}` : ""}{product.stockQuantity === 0 ? " · OUT" : low ? " · LOW" : ""}
                    </TableCell>
                    <TableCell className="p-0 font-mono">{formatMvr(product.retailPriceLaari)}</TableCell>
                    <TableCell className="p-0 text-right">
                      {canEdit ? <details className="relative inline-block text-left"><summary className="cursor-pointer list-none rounded-md border border-border px-3 py-2 text-[11px] hover:bg-accent">Receive stock</summary><form action={receiveStockAction.bind(null, product.id)} className="absolute right-0 z-20 mt-2 grid w-64 gap-2 rounded-xl border border-border bg-card p-4 text-left shadow-xl"><strong className="text-xs">Receive {product.name}</strong><label className="grid gap-1 text-[10px]">STOCK ITEMS<input name="stockUnits" type="number" min="1" step="1" required className={fieldClass} /></label><label className="grid gap-1 text-[10px]">EXPIRY {product.register.purpose === "RESTAURANT" ? "(REQUIRED)" : "(OPTIONAL)"}<input name="expiryDate" type="date" required={product.register.purpose === "RESTAURANT"} className={fieldClass} /></label><input type="hidden" name="reason" value="Stock received" /><button className="h-9 rounded-lg bg-primary text-xs font-semibold text-primary-foreground">Add batch</button></form></details> : <span className="text-[10px] text-muted-foreground">View only</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 text-center">
            <h2 className="text-sm font-semibold">No products found</h2>
            <p className="max-w-sm text-xs text-muted-foreground">Add your first product or change the filters to populate inventory.</p>
          </div>
        )}
        <footer className="flex h-16 items-center justify-between border-t border-border text-[11px] text-muted-foreground">
          <span>Showing {data.products.length} of {data.total} products</span>
          <nav aria-label="Inventory pagination" className="flex items-center gap-2">
            {data.page > 1 ? <Link href={inventoryHref(params, data.page - 1)} aria-label="Previous page" className="flex size-[30px] items-center justify-center rounded-[7px] border border-border"><ChevronLeft className="size-3" /></Link> : null}
            <span className="flex size-[30px] items-center justify-center rounded-[7px] bg-primary text-primary-foreground">{data.page}</span>
            {data.page < data.pageCount ? <Link href={inventoryHref(params, data.page + 1)} aria-label="Next page" className="flex size-[30px] items-center justify-center rounded-[7px] border border-border"><ChevronRight className="size-3" /></Link> : null}
          </nav>
        </footer>
      </Surface>

      <Surface className="overflow-hidden p-5">
        <header className="mb-4"><h2 className="text-sm font-semibold">Stock batches and expiry</h2><p className="mt-1 text-[11px] text-muted-foreground">Expired stock remains visible and is never used for restaurant sales.</p></header>
        <div className="grid gap-3">{data.products.flatMap((product) => product.batches.map((batch) => {
          const today = maldivesDate();
          const status = !batch.expiryDate ? "Expiry missing" : batch.expiryDate < today ? "Expired" : "Usable";
          const remaining = quantityNumber(batch.remainingQuantity);
          return <div key={batch.id} className="grid gap-3 rounded-lg border border-border p-3 text-xs lg:grid-cols-[1fr_150px_160px_minmax(260px,auto)] lg:items-center"><div><strong>{product.name}</strong><p className="mt-1 font-mono text-[10px] text-muted-foreground">{batch.id}</p></div><span>{formatQuantity(product, remaining)}</span><span className={cn(status === "Expired" && "text-destructive", status === "Usable" && "text-emerald-700")}>{status}{batch.expiryDate ? ` · ${dateOnly(batch.expiryDate)}` : ""}</span>{canEdit ? <div className="flex flex-wrap justify-end gap-2">{!batch.expiryDate ? <form action={assignBatchExpiryAction.bind(null, batch.id)} className="flex gap-2"><input aria-label={`Expiry for ${product.name}`} name="expiryDate" type="date" className="h-8 rounded-md border border-border bg-card px-2 text-[11px]" required /><button className="h-8 rounded-md border border-border px-2 text-[11px]">Set expiry</button></form> : null}<form action={writeOffBatchAction.bind(null, batch.id)} className="flex gap-2"><input aria-label={`Write off ${product.name}`} name="measuredQuantity" type="number" min="0.001" max={remaining} step="0.001" placeholder="Amount" className="h-8 w-24 rounded-md border border-border bg-card px-2 text-[11px]" required /><input type="hidden" name="reason" value="Batch write-off" /><button className="h-8 rounded-md border border-border px-2 text-[11px]">Write off</button></form></div> : null}</div>;
        }))}</div>
      </Surface>
    </PageContainer>
  );
}
