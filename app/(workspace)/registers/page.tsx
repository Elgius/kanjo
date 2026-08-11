import Link from "next/link";

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
import { getRegistersData } from "@/lib/pos/queries";
import { cn } from "@/lib/utils";
import { canAccess, requirePageAccess } from "@/lib/authorization";
import {
  closeShiftAction,
  openShiftAction,
  recordSaleAction,
} from "./actions";
import { NewRegisterMenu } from "./new-register-menu";

const fieldClass =
  "h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-MV", {
    timeZone: "Indian/Maldives",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function elapsed(openedAt: Date) {
  const minutes = Math.max(0, Math.floor((Date.now() - openedAt.getTime()) / 60_000));
  return `${Math.floor(minutes / 60)}H ${minutes % 60}M`;
}

export default async function RegistersPage({ searchParams }: PageProps<"/registers">) {
  const authorization = await requirePageAccess("REGISTERS");
  const canEdit = canAccess(authorization, "REGISTERS", "EDIT");
  const params = await searchParams;
  const data = await getRegistersData(single(params.register));
  const selected = data.selected;
  const shift = data.selectedShift;
  const success = single(params.success);
  const error = single(params.error);
  const selectedSalesLaari = shift?.salesLaari ?? 0;
  const selectedCashSalesLaari = shift?.cashSalesLaari ?? 0;
  const selectedCashExpectedLaari = (shift?.openingCashLaari ?? 0) + selectedCashSalesLaari;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Registry"
        title="Cash registers"
        description="Open shifts, record sales, and reconcile each cash drawer."
        actions={canEdit ? <NewRegisterMenu /> : null}
      />

      {success || error ? (
        <p role={error ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-xs", error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-chart-1/30 bg-chart-1/10")}>
          {error ?? success}
        </p>
      ) : null}

      <section className="grid gap-3.5 md:grid-cols-3">
        <MetricCard label="OPEN REGISTERS" value={`${data.metrics.openRegisters} of ${data.metrics.totalRegisters}`} note="Live" notePosition="inline" className="min-h-[104px]" />
        <MetricCard label="CASH EXPECTED" value={formatMvr(data.metrics.cashOnHandLaari)} note="Across shifts" notePosition="inline" className="min-h-[104px]" />
        <MetricCard label="ACTIVE SHIFT SALES" value={formatMvr(data.metrics.activeShiftSalesLaari)} dark className="min-h-[104px]" />
      </section>

      <section className="grid min-h-[560px] gap-3.5 xl:grid-cols-[364px_minmax(0,1fr)]">
        <Surface className="flex flex-col gap-2.5 p-[18px]">
          <div className="flex items-center justify-between px-1 pb-2.5 pt-0.5">
            <h2 className="text-sm font-semibold">All registers</h2>
            <span className="text-[11px] text-muted-foreground">{data.registers.length} registers</span>
          </div>
          {data.registers.length ? data.registers.map((register) => {
            const openShift = register.shifts[0];
            const amount = openShift?.salesLaari ?? 0;
            const isSelected = register.id === selected?.id;
            return (
              <Link
                prefetch={false}
                key={register.id}
                href={`/registers?register=${register.id}`}
                className={cn("flex h-[82px] flex-col justify-between rounded-[9px] border border-border p-[13px]", isSelected && "border-primary bg-primary text-primary-foreground", !openShift && "opacity-70")}
              >
                <div className="flex items-center justify-between"><h3 className="text-[13px] font-semibold">{register.name}</h3><span className={cn("text-[10px]", isSelected ? "text-chart-1" : "text-muted-foreground")}>{openShift ? "● OPEN" : "○ CLOSED"}</span></div>
                <div className={cn("flex justify-between text-[11px] text-muted-foreground", isSelected && "text-[#CFC8B8]")}><span>{register.purpose === "RESTAURANT" ? "Restaurant" : "Shop"} · {openShift ? `${openShift.openedBy.name} · ${formatTime(openShift.openedAt)}` : "No active shift"}</span><span className="font-mono">{openShift ? formatMvr(amount) : "—"}</span></div>
              </Link>
            );
          }) : <p className="px-1 py-8 text-center text-xs text-muted-foreground">Add a register to begin.</p>}
        </Surface>

        <Surface className="flex min-w-0 flex-col gap-[22px] p-5 sm:p-6">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center"><h2 className="text-sm font-semibold">No registers yet</h2><p className="text-xs text-muted-foreground">Add the first register to open a shift.</p></div>
          ) : (
            <>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="flex flex-col gap-1.5">
                  <p className="flex items-center gap-2.5 text-[11px] text-muted-foreground"><span className="font-mono text-chart-1">{selected.code}</span><span>· {shift ? `OPEN FOR ${elapsed(shift.openedAt)}` : "CLOSED"}</span></p>
                  <h2 className="font-serif text-[28px] font-semibold leading-[34px]">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground">{shift ? `Shift owner: ${shift.openedBy.name}` : "Open a shift before recording sales."}</p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                {selected.purpose === "RESTAURANT" ? <Link prefetch={false} href={`/registers/${selected.id}/menu`} className="flex h-10 items-center rounded-lg border border-border bg-card px-4 text-xs font-semibold">Menu</Link> : null}
                {canEdit && shift ? (
                  <form action={closeShiftAction.bind(null, shift.id, selected.id)} className="flex items-end gap-2">
                    <label className="grid gap-1 text-[10px] text-muted-foreground">Closing cash (MVR)<input name="closingCash" inputMode="decimal" defaultValue={(selectedCashExpectedLaari / 100).toFixed(2)} className={`${fieldClass} w-32`} required /></label>
                    <button type="submit" className="h-10 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground">Close shift</button>
                  </form>
                ) : canEdit ? (
                  <form action={openShiftAction.bind(null, selected.id)} className="flex items-end gap-2">
                    <label className="grid gap-1 text-[10px] text-muted-foreground">Opening cash (MVR)<input name="openingCash" inputMode="decimal" defaultValue="0.00" className={`${fieldClass} w-32`} required /></label>
                    <button type="submit" className="h-10 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground">Open shift</button>
                  </form>
                ) : <span className="rounded-lg bg-accent px-3 py-2 text-[10px] text-muted-foreground">VIEW ONLY</span>}
                </div>
              </div>

              {shift ? (
                <>
                  <div className="grid min-h-[100px] border-y border-border sm:grid-cols-3">
                    {[["NET SALES", formatMvr(selectedSalesLaari)], ["CASH EXPECTED", formatMvr(selectedCashExpectedLaari)], ["TRANSACTIONS", String(shift.transactionCount)]].map(([label, value], index) => (
                      <div key={label} className={cn("flex flex-col justify-center gap-1.5 py-4 sm:px-[22px]", index === 0 && "sm:pl-0", index > 0 && "border-t border-border sm:border-l sm:border-t-0")}><span className="text-[10px] text-muted-foreground">{label}</span><span className="text-[23px] font-semibold leading-7">{value}</span></div>
                    ))}
                  </div>

                  {canEdit ? <form action={recordSaleAction.bind(null, shift.id, selected.id)} className="grid gap-3 rounded-[9px] bg-accent p-4 sm:grid-cols-[1fr_100px_150px_auto] sm:items-end">
                    <label className="grid gap-1.5 text-[10px] text-muted-foreground">{selected.purpose === "RESTAURANT" ? "MENU ITEM" : "PRODUCT"}<select name="itemId" className={fieldClass} required defaultValue=""><option value="" disabled>{selected.purpose === "RESTAURANT" ? "Select menu item" : "Select product"}</option>{data.products.map((product) => <option key={product.id} value={product.id} disabled={product.stockQuantity < 1}>{product.name} · {product.stockQuantity < 1 ? `SOLD OUT${product.soldOutReason ? ` · ${product.soldOutReason}` : ""}` : `${product.stockQuantity} available`} · {formatMvr(product.retailPriceLaari)}</option>)}</select></label>
                    <label className="grid gap-1.5 text-[10px] text-muted-foreground">QUANTITY<input name="quantity" type="number" min="1" defaultValue="1" className={fieldClass} required /></label>
                    <label className="grid gap-1.5 text-[10px] text-muted-foreground">PAYMENT<select name="paymentMethod" className={fieldClass} defaultValue="CASH"><option value="CASH">Cash</option><option value="CARD">Card</option><option value="MOBILE">Mobile pay</option></select></label>
                    <button type="submit" disabled={!data.products.some((product) => product.stockQuantity > 0)} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">Record sale</button>
                  </form> : null}

                  <div className="min-w-0">
                    <h3 className="pb-2.5 text-sm font-semibold">Recent transactions</h3>
                    {data.recentSales.length ? (
                      <Table className="min-w-[570px] text-left text-xs"><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="h-8 w-[100px] p-0 text-[10px] font-normal text-muted-foreground">TIME</TableHead><TableHead className="h-8 w-[200px] p-0 text-[10px] font-normal text-muted-foreground">RECEIPT</TableHead><TableHead className="h-8 w-[130px] p-0 text-[10px] font-normal text-muted-foreground">METHOD</TableHead><TableHead className="h-8 p-0 text-right text-[10px] font-normal text-muted-foreground">TOTAL</TableHead></TableRow></TableHeader><TableBody>{data.recentSales.map((sale) => <TableRow key={sale.id} className="h-11 hover:bg-transparent"><TableCell className="p-0">{formatTime(sale.createdAt)}</TableCell><TableCell className="p-0 font-mono">#{sale.receiptNumber.toString()} · {sale._count.items} items</TableCell><TableCell className="p-0">{sale.paymentMethod === "MOBILE" ? "Mobile pay" : sale.paymentMethod[0] + sale.paymentMethod.slice(1).toLowerCase()}</TableCell><TableCell className="p-0 text-right font-mono">{formatMvr(sale.totalLaari)}</TableCell></TableRow>)}</TableBody></Table>
                    ) : <p className="py-8 text-center text-xs text-muted-foreground">No sales recorded for this shift.</p>}
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-center"><p className="max-w-sm text-xs text-muted-foreground">Opening a shift establishes the starting cash balance and enables sales for this register.</p></div>
              )}
            </>
          )}
        </Surface>
      </section>
    </PageContainer>
  );
}
