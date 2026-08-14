"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, LoaderCircle, Printer, X } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMvr } from "@/lib/pos/money";
import type { BillCursor, BillHistoryFilters, BillHistoryRow } from "@/lib/pos/bills";
import { loadMoreBillsAction } from "./actions";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-MV", {
    timeZone: "Indian/Maldives",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function paymentLabel(payment: BillHistoryRow["paymentMethod"]) {
  return payment === "MOBILE" ? "Mobile pay" : payment[0] + payment.slice(1).toLowerCase();
}

function BillDialog({ bill, onClose }: { bill: BillHistoryRow; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      onClose={onClose}
      className="m-auto w-[min(560px,calc(100%-32px))] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/35"
    >
      <div className="grid gap-5 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-chart-1">Saved bill</p>
            <h2 className="font-serif text-2xl font-semibold">Receipt #{bill.receiptNumber}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(bill.soldAt)}</p>
          </div>
          <button type="button" aria-label="Close bill" onClick={() => dialogRef.current?.close()} className="flex size-9 items-center justify-center rounded-lg border border-border hover:bg-accent">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex justify-center rounded-lg border border-border bg-white p-4">
          <article className="bill-history-print-root w-[48mm] bg-white font-mono text-[10px] leading-[1.35] text-black">
            <header className="border-b border-dashed border-black pb-2 text-center">
              <h1 className="text-sm font-bold">KANJO</h1>
              <p className="mt-1">{bill.registerName}</p>
              <p>{bill.registerCode}</p>
            </header>
            <div className="border-b border-dashed border-black py-2">
              <div className="flex justify-between gap-2"><span>Receipt</span><strong>#{bill.receiptNumber}</strong></div>
              <div className="flex justify-between gap-2"><span>Date</span><span className="text-right">{formatDateTime(bill.soldAt)}</span></div>
              <div className="flex justify-between gap-2"><span>Cashier</span><span className="truncate text-right">{bill.cashierName}</span></div>
            </div>
            <div className="grid gap-2 border-b border-dashed border-black py-2">
              {bill.items.map((item) => (
                <div key={item.id}>
                  <div className="flex justify-between gap-2 font-bold"><span className="min-w-0 break-words">{item.productName}</span><span className="shrink-0">{formatMvr(item.lineTotalLaari)}</span></div>
                  <div className="flex justify-between gap-2"><span>{item.quantity} × {formatMvr(item.unitPriceLaari)}</span>{item.productSku ? <span>{item.productSku}</span> : null}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-1 py-2">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatMvr(bill.subtotalLaari)}</span></div>
              <div className="flex justify-between text-xs font-bold"><span>TOTAL</span><span>{formatMvr(bill.totalLaari)}</span></div>
              <div className="flex justify-between"><span>Payment</span><span>{paymentLabel(bill.paymentMethod)}</span></div>
            </div>
            <footer className="border-t border-dashed border-black pt-2 text-center">
              <p>Thank you</p>
              <p className="mt-1">Powered by Kanjo</p>
            </footer>
          </article>
        </div>

        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={() => dialogRef.current?.close()} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold">Close</button>
          <button type="button" onClick={() => window.print()} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground"><Printer className="size-3.5" />Print bill</button>
        </div>
      </div>
    </dialog>
  );
}

export function BillHistoryTable({
  initialBills,
  initialCursor,
  filters,
  totalBills,
}: {
  initialBills: BillHistoryRow[];
  initialCursor: BillCursor | null;
  filters: BillHistoryFilters;
  totalBills: number;
}) {
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
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await loadMoreBillsAction(filters, cursor);
      setBills((current) => [...current, ...result.bills]);
      setCursor(result.nextCursor);
      setPagesLoaded((current) => current + 1);
    } catch {
      setError("More bills could not be loaded. Try again.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor, filters]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "240px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  if (!bills.length) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-1 px-5 text-center">
        <h2 className="text-sm font-semibold">No bills found</h2>
        <p className="text-xs text-muted-foreground">Change or clear the filters to see other sales.</p>
      </div>
    );
  }

  return (
    <>
      <Table className="min-w-[900px] text-left text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 pl-5 text-[10px] font-normal text-muted-foreground">RECEIPT</TableHead>
            <TableHead className="h-11 text-[10px] font-normal text-muted-foreground">DATE &amp; TIME</TableHead>
            <TableHead className="h-11 text-[10px] font-normal text-muted-foreground">REGISTER</TableHead>
            <TableHead className="h-11 text-[10px] font-normal text-muted-foreground">CASHIER</TableHead>
            <TableHead className="h-11 text-[10px] font-normal text-muted-foreground">PAYMENT</TableHead>
            <TableHead className="h-11 text-right text-[10px] font-normal text-muted-foreground">TOTAL</TableHead>
            <TableHead className="h-11 pr-5 text-right text-[10px] font-normal text-muted-foreground"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bills.map((bill) => (
            <TableRow key={bill.id} className="h-[66px] hover:bg-accent/40">
              <TableCell className="pl-5 font-mono text-[11px] font-semibold">#{bill.receiptNumber}</TableCell>
              <TableCell className="text-[11px]">{formatDateTime(bill.soldAt)}</TableCell>
              <TableCell><span className="block font-semibold">{bill.registerName}</span><span className="mt-0.5 block font-mono text-[9px] text-muted-foreground">{bill.registerCode}</span></TableCell>
              <TableCell>{bill.cashierName}</TableCell>
              <TableCell>{paymentLabel(bill.paymentMethod)}</TableCell>
              <TableCell className="text-right font-semibold">{formatMvr(bill.totalLaari)}</TableCell>
              <TableCell className="pr-5 text-right"><button type="button" onClick={() => setSelectedBill(bill)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-semibold hover:bg-accent"><Eye className="size-3.5" />View</button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <footer className="flex min-h-16 flex-col items-center justify-between gap-3 border-t border-border px-5 py-3 text-[11px] text-muted-foreground sm:flex-row">
        <span>Loaded {bills.length} of {totalBills} bills · {pagesLoaded} {pagesLoaded === 1 ? "page" : "pages"}</span>
        <div ref={sentinelRef} className="flex min-h-9 items-center">
          {cursor ? (
            <button type="button" disabled={loading} onClick={() => void loadMore()} className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 font-semibold text-foreground disabled:opacity-60">
              {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              {loading ? "Loading" : "Load next page"}
            </button>
          ) : <span>All matching bills loaded</span>}
        </div>
        {error ? <p role="alert" className="text-destructive">{error}</p> : null}
      </footer>

      {selectedBill ? <BillDialog bill={selectedBill} onClose={() => setSelectedBill(null)} /> : null}
    </>
  );
}
