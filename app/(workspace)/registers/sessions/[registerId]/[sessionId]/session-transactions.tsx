"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, ReceiptText, X } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMvr } from "@/lib/pos/money";
import type { SessionTransaction } from "@/lib/pos/register-sessions";
import { cn } from "@/lib/utils";

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

function paymentLabel(payment: SessionTransaction["paymentMethod"]) {
  return payment === "MOBILE" ? "Mobile pay" : payment[0] + payment.slice(1).toLowerCase();
}

function TransactionDialog({
  transaction,
  registerName,
  registerCode,
  onClose,
}: {
  transaction: SessionTransaction;
  registerName: string;
  registerCode: string;
  onClose: () => void;
}) {
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
            <p className="flex items-center gap-2 text-xs text-chart-1">
              <ReceiptText className="size-3.5" aria-hidden="true" />
              {transaction.hasSavedBill ? "Saved bill" : "Transaction"}
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold">Receipt #{transaction.receiptNumber}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(transaction.createdAt)} · {transaction.cashierName}</p>
          </div>
          <button type="button" aria-label="Close transaction" onClick={() => dialogRef.current?.close()} className="flex size-9 items-center justify-center rounded-lg border border-border hover:bg-accent">
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-start justify-between gap-4 border-b border-dashed border-border pb-3">
            <div><p className="text-sm font-semibold">{registerName}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{registerCode}</p></div>
            <span className={cn("rounded-full px-2 py-1 text-[9px] font-semibold", transaction.status === "COMPLETED" ? "bg-chart-1/10 text-chart-1" : "bg-secondary text-muted-foreground")}>{transaction.status}</span>
          </div>
          <div className="grid gap-3 py-4">
            {transaction.items.map((item) => (
              <div key={item.id} className="flex justify-between gap-4 text-xs">
                <div className="min-w-0"><p className="font-semibold">{item.productName}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{item.quantity} × {formatMvr(item.unitPriceLaari)} · {item.itemCategory}</p></div>
                <span className="shrink-0 font-mono">{formatMvr(item.lineTotalLaari)}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-2 border-t border-dashed border-border pt-3 text-xs">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatMvr(transaction.subtotalLaari)}</span></div>
            <div className="flex justify-between text-sm font-bold"><span>Total</span><span>{formatMvr(transaction.totalLaari)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Payment</span><span>{paymentLabel(transaction.paymentMethod)}</span></div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={() => dialogRef.current?.close()} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Close</button>
        </div>
      </div>
    </dialog>
  );
}

export function SessionTransactions({
  transactions,
  registerName,
  registerCode,
}: {
  transactions: SessionTransaction[];
  registerName: string;
  registerCode: string;
}) {
  const [selected, setSelected] = useState<SessionTransaction | null>(null);

  if (!transactions.length) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-1 px-5 text-center">
        <h2 className="text-sm font-semibold">No transactions in this session</h2>
        <p className="text-xs text-muted-foreground">Sales and saved bills will appear here as they are recorded.</p>
      </div>
    );
  }

  return (
    <>
      <Table className="min-w-[850px] text-left text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 pl-5 text-[10px] font-normal text-muted-foreground sm:pl-6">RECEIPT</TableHead>
            <TableHead className="h-11 text-[10px] font-normal text-muted-foreground">DATE &amp; TIME</TableHead>
            <TableHead className="h-11 text-[10px] font-normal text-muted-foreground">CASHIER</TableHead>
            <TableHead className="h-11 text-[10px] font-normal text-muted-foreground">PAYMENT</TableHead>
            <TableHead className="h-11 text-[10px] font-normal text-muted-foreground">STATUS</TableHead>
            <TableHead className="h-11 text-right text-[10px] font-normal text-muted-foreground">TOTAL</TableHead>
            <TableHead className="h-11 pr-5 text-right text-[10px] font-normal text-muted-foreground sm:pr-6"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow key={transaction.id} className="h-[66px] hover:bg-accent/40">
              <TableCell className="pl-5 font-mono text-[11px] font-semibold sm:pl-6">#{transaction.receiptNumber}</TableCell>
              <TableCell className="text-[11px]">{formatDateTime(transaction.createdAt)}</TableCell>
              <TableCell>{transaction.cashierName}</TableCell>
              <TableCell>{paymentLabel(transaction.paymentMethod)}</TableCell>
              <TableCell><span className={cn("rounded-full px-2 py-1 text-[9px] font-semibold", transaction.status === "COMPLETED" ? "bg-chart-1/10 text-chart-1" : "bg-secondary text-muted-foreground")}>{transaction.status}</span></TableCell>
              <TableCell className="text-right font-semibold">{formatMvr(transaction.totalLaari)}</TableCell>
              <TableCell className="pr-5 text-right sm:pr-6">
                <button type="button" onClick={() => setSelected(transaction)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-semibold hover:bg-accent">
                  <Eye className="size-3.5" aria-hidden="true" />
                  View
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selected ? <TransactionDialog transaction={selected} registerName={registerName} registerCode={registerCode} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
