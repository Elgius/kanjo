"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, ReceiptText, X } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMvr } from "@/lib/pos/money";
import type { SessionTransaction } from "@/lib/pos/register-sessions";
import { cn } from "@/lib/utils";
import { PaidBillCorrectionDialog } from "./paid-bill-correction-dialog";

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

function statusClass(status: SessionTransaction["status"]) {
  if (status === "PAID" || status === "AMENDED") return "bg-chart-1/10 text-chart-1";
  if (status === "CANCELLED" || status === "REVERSED") return "bg-destructive/10 text-destructive";
  return "bg-amber-500/10 text-amber-700";
}

function TransactionDialog({
  transaction,
  registerName,
  registerCode,
  canCorrectBills,
  onCorrect,
  onClose,
}: {
  transaction: SessionTransaction;
  registerName: string;
  registerCode: string;
  canCorrectBills: boolean;
  onCorrect: (mode: "AMEND" | "REVERSE") => void;
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
              Saved bill #{transaction.billNumber}
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold">{transaction.receiptNumber ? `Receipt #${transaction.receiptNumber}` : "Tracked unpaid bill"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(transaction.openedAt)} · {transaction.cashierName}</p>
          </div>
          <button type="button" aria-label="Close transaction" onClick={() => dialogRef.current?.close()} className="flex size-9 items-center justify-center rounded-lg border border-border hover:bg-accent">
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-start justify-between gap-4 border-b border-dashed border-border pb-3">
            <div><p className="text-sm font-semibold">{registerName}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{registerCode}</p></div>
            <span className={cn("rounded-full px-2 py-1 text-[9px] font-semibold", statusClass(transaction.status))}>{transaction.status}</span>
          </div>
          <div className="grid gap-3 py-4">
            {transaction.items.map((item, index) => (
              <div key={`${item.productId ?? item.menuItemId ?? item.productName}:${index}`} className="flex justify-between gap-4 text-xs">
                <div className="min-w-0"><p className="font-semibold">{item.productName}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{item.quantity} × {formatMvr(item.unitPriceLaari)} · {item.itemCategory}</p></div>
                <span className="shrink-0 font-mono">{formatMvr(item.lineTotalLaari)}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-2 border-t border-dashed border-border pt-3 text-xs">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatMvr(transaction.subtotalLaari)}</span></div>
            <div className="flex justify-between text-sm font-bold"><span>Total</span><span>{formatMvr(transaction.totalLaari)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Payment</span><span>{transaction.status !== "UNPAID" && transaction.status !== "CANCELLED" ? paymentLabel(transaction.paymentMethod) : "Pending"}</span></div>
          </div>
        </div>

        <section>
          <h3 className="text-sm font-semibold">Bill timeline</h3>
          <div className="mt-3 grid gap-2">
            {transaction.revisions.map((revision) => <div key={revision.id} className="rounded-lg border border-border p-3"><div className="flex justify-between gap-3"><div><p className="text-[11px] font-semibold">{revision.kind.split("_").map((part) => part[0] + part.slice(1).toLowerCase()).join(" ")}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{revision.actorName} · {formatDateTime(revision.createdAt)}</p></div><span className="font-mono text-[9px] text-muted-foreground">REV {revision.revision}</span></div><ul className="mt-2 grid gap-1 text-[10px] text-muted-foreground">{revision.changes.map((change, index) => <li key={index}>• {change}</li>)}</ul></div>)}
          </div>
        </section>

        <div className="flex flex-wrap justify-end gap-2">
          {canCorrectBills && (transaction.status === "PAID" || transaction.status === "AMENDED") ? <>
            <button type="button" onClick={() => onCorrect("AMEND")} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold hover:bg-accent">Amend bill</button>
            <button type="button" onClick={() => onCorrect("REVERSE")} className="h-10 rounded-lg border border-destructive/30 px-4 text-xs font-semibold text-destructive hover:bg-destructive/10">Reverse bill</button>
          </> : null}
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
  registerId,
  sessionId,
  canCorrectBills,
}: {
  transactions: SessionTransaction[];
  registerName: string;
  registerCode: string;
  registerId: string;
  sessionId: string;
  canCorrectBills: boolean;
}) {
  const [selected, setSelected] = useState<SessionTransaction | null>(null);
  const [correction, setCorrection] = useState<{ transaction: SessionTransaction; mode: "AMEND" | "REVERSE" } | null>(null);

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
            <TableHead className="h-11 pl-5 text-[10px] font-normal text-muted-foreground sm:pl-6">BILL / RECEIPT</TableHead>
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
              <TableCell className="pl-5 sm:pl-6"><span className="block font-mono text-[11px] font-semibold">Bill #{transaction.billNumber}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{transaction.receiptNumber ? `Receipt #${transaction.receiptNumber}` : "No receipt yet"}</span></TableCell>
              <TableCell className="text-[11px]">{formatDateTime(transaction.openedAt)}</TableCell>
              <TableCell>{transaction.cashierName}</TableCell>
              <TableCell>{transaction.status !== "UNPAID" && transaction.status !== "CANCELLED" ? paymentLabel(transaction.paymentMethod) : "Pending"}</TableCell>
              <TableCell><span className={cn("rounded-full px-2 py-1 text-[9px] font-semibold", statusClass(transaction.status))}>{transaction.status}</span></TableCell>
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

      {selected ? <TransactionDialog transaction={selected} registerName={registerName} registerCode={registerCode} canCorrectBills={canCorrectBills} onCorrect={(mode) => { setCorrection({ transaction: selected, mode }); setSelected(null); }} onClose={() => setSelected(null)} /> : null}
      {correction ? <PaidBillCorrectionDialog transaction={correction.transaction} mode={correction.mode} registerId={registerId} sessionId={sessionId} onClose={() => setCorrection(null)} /> : null}
    </>
  );
}
