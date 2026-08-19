"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, LoaderCircle, Printer, X } from "lucide-react";

import { printBill, PrintableBill, PrintableBillPortal, type PrintableBillProps } from "@/components/pos/printable-bill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMvr } from "@/lib/pos/money";
import type { BillCursor, BillHistoryFilters, BillHistoryRow } from "@/lib/pos/bills";
import { cn } from "@/lib/utils";
import { loadMoreBillsAction } from "./actions";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-MV", {
    timeZone: "Indian/Maldives", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

function paymentLabel(payment: BillHistoryRow["paymentMethod"]) {
  return payment === "MOBILE" ? "Mobile pay" : payment[0] + payment.slice(1).toLowerCase();
}

function statusClass(status: BillHistoryRow["status"]) {
  if (status === "PAID" || status === "AMENDED") return "bg-chart-1/10 text-chart-1";
  if (status === "CANCELLED" || status === "REVERSED") return "bg-destructive/10 text-destructive";
  return "bg-amber-500/10 text-amber-700";
}

function revisionLabel(kind: BillHistoryRow["revisions"][number]["kind"]) {
  return kind.split("_").map((part) => part[0] + part.slice(1).toLowerCase()).join(" ");
}

function BillDialog({ bill, onClose }: { bill: BillHistoryRow; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const printableBillProps = {
    registerName: bill.registerName,
    registerCode: bill.registerCode,
    billNumber: bill.billNumber,
    receiptNumber: bill.receiptNumber,
    dateValue: formatDateTime(bill.openedAt),
    cashierName: bill.paidByName ?? bill.openedByName,
    tableName: bill.restaurantTableName,
    customerNote: bill.customerNote,
    items: bill.items.map((item, index) => ({ key: `${item.productId ?? item.menuItemId ?? item.productName}:${index}`, name: item.productName, sku: item.productSku, quantity: item.quantity, unitPriceLaari: item.unitPriceLaari, lineTotalLaari: item.lineTotalLaari })),
    subtotalLaari: bill.subtotalLaari,
    totalLaari: bill.totalLaari,
    paymentMethod: bill.status === "UNPAID" || bill.status === "CANCELLED" ? null : bill.paymentMethod,
    status: bill.status,
  } satisfies PrintableBillProps;

  return (
    <dialog ref={dialogRef} onCancel={onClose} onClose={onClose} className="m-auto max-h-[calc(100vh-32px)] w-[min(760px,calc(100%-32px))] overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/35">
      <div className="grid gap-5 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-chart-1">Saved bill #{bill.billNumber}</p>
              <span className={cn("rounded-full px-2 py-1 text-[9px] font-semibold", statusClass(bill.status))}>{bill.status}</span>
            </div>
            <h2 className="mt-1 font-serif text-2xl font-semibold">{bill.receiptNumber ? `Receipt #${bill.receiptNumber}` : "Tracked unpaid bill"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Opened {formatDateTime(bill.openedAt)} by {bill.openedByName}</p>
          </div>
          <button type="button" aria-label="Close bill" onClick={() => dialogRef.current?.close()} className="flex size-9 items-center justify-center rounded-lg border border-border hover:bg-accent"><X className="size-4" /></button>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(250px,0.8fr)]">
          <div className="flex justify-center rounded-lg border border-border bg-white p-4">
            <PrintableBill {...printableBillProps} />
          </div>

          <section>
            <h3 className="text-sm font-semibold">Bill timeline</h3>
            <div className="mt-3 grid gap-2">
              {bill.revisions.map((revision) => (
                <details key={revision.id} className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold">{revisionLabel(revision.kind)}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{revision.actorName} · {formatDateTime(revision.createdAt)}</p></div><span className="font-mono text-[9px] text-muted-foreground">REV {revision.revision}</span></div>
                    <ul className="mt-2 grid gap-1 text-[10px] text-muted-foreground">{revision.changes.map((change, index) => <li key={index}>• {change}</li>)}</ul>
                  </summary>
                  {revision.snapshot ? <div className="mt-3 border-t border-border pt-3 text-[10px]">{revision.snapshot.items.map((item, index) => <p key={`${item.productName}:${index}`} className="flex justify-between gap-3"><span>{item.productName} × {item.quantity}</span><span>{formatMvr(item.lineTotalLaari)}</span></p>)}<p className="mt-2 flex justify-between border-t border-dashed border-border pt-2 font-semibold"><span>Total</span><span>{formatMvr(revision.snapshot.totalLaari)}</span></p></div> : null}
                </details>
              ))}
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2.5"><button type="button" onClick={() => dialogRef.current?.close()} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold">Close</button><button type="button" onClick={() => printBill("history")} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground"><Printer className="size-3.5" />Print bill</button></div>
        <PrintableBillPortal {...printableBillProps} className="bill-history-print-root pointer-events-none fixed -left-[10000px] top-0" />
      </div>
    </dialog>
  );
}

export function BillHistoryTable({ initialBills, initialCursor, filters, totalBills }: { initialBills: BillHistoryRow[]; initialCursor: BillCursor | null; filters: BillHistoryFilters; totalBills: number }) {
  const [bills, setBills] = useState(initialBills);
  const [cursor, setCursor] = useState(initialCursor);
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBill, setSelectedBill] = useState<BillHistoryRow | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const loadMore = useCallback(async () => {
    if (!cursor || loadingRef.current) return;
    loadingRef.current = true; setLoading(true); setError(null);
    try { const result = await loadMoreBillsAction(filters, cursor); setBills((current) => [...current, ...result.bills]); setCursor(result.nextCursor); setPagesLoaded((current) => current + 1); }
    catch { setError("More bills could not be loaded. Try again."); }
    finally { loadingRef.current = false; setLoading(false); }
  }, [cursor, filters]);
  useEffect(() => { const sentinel = sentinelRef.current; if (!sentinel || !cursor) return; const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) void loadMore(); }, { rootMargin: "240px" }); observer.observe(sentinel); return () => observer.disconnect(); }, [cursor, loadMore]);
  if (!bills.length) return <div className="flex min-h-64 flex-col items-center justify-center gap-1 px-5 text-center"><h2 className="text-sm font-semibold">No bills found</h2><p className="text-xs text-muted-foreground">Change or clear the filters to see other bills.</p></div>;
  return <>
    <Table className="min-w-[980px] text-left text-xs"><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="h-11 pl-5 text-[10px] font-normal text-muted-foreground">BILL / RECEIPT</TableHead><TableHead className="h-11 text-[10px] font-normal text-muted-foreground">OPENED</TableHead><TableHead className="h-11 text-[10px] font-normal text-muted-foreground">REGISTER</TableHead><TableHead className="h-11 text-[10px] font-normal text-muted-foreground">OPENED BY</TableHead><TableHead className="h-11 text-[10px] font-normal text-muted-foreground">PAYMENT</TableHead><TableHead className="h-11 text-[10px] font-normal text-muted-foreground">STATUS</TableHead><TableHead className="h-11 text-right text-[10px] font-normal text-muted-foreground">TOTAL</TableHead><TableHead className="h-11 pr-5 text-right text-[10px] font-normal text-muted-foreground"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
      <TableBody>{bills.map((bill) => <TableRow key={bill.id} className="h-[66px] hover:bg-accent/40"><TableCell className="pl-5"><span className="block font-mono text-[11px] font-semibold">Bill #{bill.billNumber}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{bill.receiptNumber ? `Receipt #${bill.receiptNumber}` : "No receipt yet"}</span></TableCell><TableCell className="text-[11px]">{formatDateTime(bill.openedAt)}</TableCell><TableCell><span className="block font-semibold">{bill.registerName}</span><span className="mt-0.5 block font-mono text-[9px] text-muted-foreground">{bill.registerCode}</span></TableCell><TableCell>{bill.openedByName}</TableCell><TableCell>{bill.status !== "UNPAID" && bill.status !== "CANCELLED" ? paymentLabel(bill.paymentMethod) : "Pending"}</TableCell><TableCell><span className={cn("rounded-full px-2 py-1 text-[9px] font-semibold", statusClass(bill.status))}>{bill.status}</span></TableCell><TableCell className="text-right font-semibold">{formatMvr(bill.totalLaari)}</TableCell><TableCell className="pr-5 text-right"><button type="button" onClick={() => setSelectedBill(bill)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-semibold hover:bg-accent"><Eye className="size-3.5" />View</button></TableCell></TableRow>)}</TableBody>
    </Table>
    <footer className="flex min-h-16 flex-col items-center justify-between gap-3 border-t border-border px-5 py-3 text-[11px] text-muted-foreground sm:flex-row"><span>Loaded {bills.length} of {totalBills} bills · {pagesLoaded} {pagesLoaded === 1 ? "page" : "pages"}</span><div ref={sentinelRef} className="flex min-h-9 items-center">{cursor ? <button type="button" disabled={loading} onClick={() => void loadMore()} className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 font-semibold text-foreground disabled:opacity-60">{loading ? <LoaderCircle className="size-3.5 animate-spin" /> : null}{loading ? "Loading" : "Load next page"}</button> : <span>All matching bills loaded</span>}</div>{error ? <p role="alert" className="text-destructive">{error}</p> : null}</footer>
    {selectedBill ? <BillDialog bill={selectedBill} onClose={() => setSelectedBill(null)} /> : null}
  </>;
}
