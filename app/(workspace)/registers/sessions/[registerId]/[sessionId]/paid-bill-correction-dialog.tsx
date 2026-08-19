"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, X } from "lucide-react";

import { formatMvr } from "@/lib/pos/money";
import type { SessionTransaction } from "@/lib/pos/register-sessions";
import { amendPaidBillAction, reversePaidBillAction } from "./actions";

type Mode = "AMEND" | "REVERSE";
type StockMode = "ALL" | "SOME" | "NONE";

const choiceClass = "flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[11px] font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary/5";

function StockChoices({
  legend,
  mode,
  onChange,
  allowNone,
}: {
  legend: string;
  mode: StockMode;
  onChange: (mode: StockMode) => void;
  allowNone: boolean;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-[11px] font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {(["ALL", "SOME", ...(allowNone ? ["NONE"] : [])] as StockMode[]).map((value) => (
          <label key={value} className={choiceClass}>
            <input type="radio" checked={mode === value} onChange={() => onChange(value)} />
            {value[0] + value.slice(1).toLowerCase()}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PaidBillCorrectionDialog({
  transaction,
  mode,
  registerId,
  sessionId,
  onClose,
}: {
  transaction: SessionTransaction;
  mode: Mode;
  registerId: string;
  sessionId: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(transaction.items.flatMap((item) => item.saleItemId ? [[item.saleItemId, item.quantity]] : [])));
  const [addedMode, setAddedMode] = useState<StockMode>("ALL");
  const [removedMode, setRemovedMode] = useState<StockMode>("ALL");
  const [reverseMode, setReverseMode] = useState<StockMode>("ALL");
  const [addedSome, setAddedSome] = useState<Record<string, number>>({});
  const [removedSome, setRemovedSome] = useState<Record<string, number>>({});
  const [reverseSome, setReverseSome] = useState<Record<string, number>>({});

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  const changes = useMemo(() => transaction.items.flatMap((item) => {
    if (!item.saleItemId) return [];
    const next = quantities[item.saleItemId] ?? item.quantity;
    return next === item.quantity ? [] : [{ item, next, delta: next - item.quantity }];
  }), [quantities, transaction.items]);
  const nextTotal = transaction.items.reduce((total, item) => total + item.unitPriceLaari * (item.saleItemId ? quantities[item.saleItemId] ?? item.quantity : item.quantity), 0);

  function someEntries(values: Record<string, number>) {
    return Object.entries(values).map(([saleItemId, quantity]) => ({ saleItemId, quantity: Number(quantity) || 0 })).filter((entry) => entry.quantity > 0);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = mode === "AMEND"
        ? await amendPaidBillAction({
            billId: transaction.id,
            registerId,
            sessionId,
            expectedVersion: transaction.version,
            quantities: transaction.items.flatMap((item) => item.saleItemId ? [{ saleItemId: item.saleItemId, quantity: quantities[item.saleItemId] ?? item.quantity }] : []),
            addedStock: { mode: addedMode, quantities: addedMode === "SOME" ? someEntries(addedSome) : [] },
            removedStock: { mode: removedMode, quantities: removedMode === "SOME" ? someEntries(removedSome) : [] },
          })
        : await reversePaidBillAction({
            billId: transaction.id,
            registerId,
            sessionId,
            expectedVersion: transaction.version,
            stock: { mode: reverseMode, quantities: reverseMode === "SOME" ? someEntries(reverseSome) : [] },
          });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <dialog ref={dialogRef} onCancel={onClose} onClose={onClose} className="m-auto max-h-[90vh] w-[min(680px,calc(100%-32px))] overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/35">
      <div className="grid gap-5 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-chart-1">Bill #{transaction.billNumber}</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold">{mode === "AMEND" ? "Amend paid bill" : "Reverse paid bill"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">This updates the internal ledger. Any external collection or refund remains manual.</p>
          </div>
          <button type="button" aria-label="Close correction" onClick={() => dialogRef.current?.close()} className="flex size-9 items-center justify-center rounded-lg border border-border hover:bg-accent"><X className="size-4" /></button>
        </header>

        {mode === "AMEND" ? (
          <>
            <section className="grid gap-2">
              <h3 className="text-[11px] font-semibold">ITEM QUANTITIES</h3>
              {transaction.items.map((item) => item.saleItemId ? (
                <label key={item.saleItemId} className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-3 rounded-lg border border-border p-3">
                  <span><span className="block text-xs font-semibold">{item.productName}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">Original price {formatMvr(item.unitPriceLaari)} · current {item.quantity}</span></span>
                  <input type="number" min={0} step={1} value={quantities[item.saleItemId] ?? item.quantity} onChange={(event) => setQuantities((current) => ({ ...current, [item.saleItemId!]: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))} className="h-10 rounded-lg border border-border bg-background px-3 text-right text-xs" />
                </label>
              ) : null)}
              <div className="flex justify-between rounded-lg bg-accent px-3 py-2 text-xs"><span>Corrected total</span><strong>{formatMvr(nextTotal)}</strong></div>
            </section>

            {changes.some((change) => change.delta > 0) ? (
              <section className="grid gap-3 rounded-lg border border-border p-4">
                <StockChoices legend="Deduct stock count for added quantities?" mode={addedMode} onChange={setAddedMode} allowNone />
                {addedMode === "SOME" ? changes.filter((change) => change.delta > 0).map(({ item, delta }) => <label key={item.saleItemId} className="flex items-center justify-between gap-3 text-xs"><span>{item.productName} · max {delta}</span><input type="number" min={0} max={delta} step={1} value={addedSome[item.saleItemId!] ?? 0} onChange={(event) => setAddedSome((current) => ({ ...current, [item.saleItemId!]: Math.max(0, Math.min(delta, Math.floor(Number(event.target.value) || 0))) }))} className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-right" /></label>) : null}
              </section>
            ) : null}

            {changes.some((change) => change.delta < 0) ? (
              <section className="grid gap-3 rounded-lg border border-border p-4">
                <StockChoices legend="Reverse stock count for removed quantities?" mode={removedMode} onChange={setRemovedMode} allowNone={false} />
                {removedMode === "SOME" ? changes.filter((change) => change.delta < 0).map(({ item, delta }) => {
                  const untracked = Math.max(0, item.quantity - item.stockTrackedQuantity);
                  const maximum = Math.max(0, -delta - untracked);
                  return <label key={item.saleItemId} className="flex items-center justify-between gap-3 text-xs"><span>{item.productName} · max {maximum}</span><input type="number" min={0} max={maximum} step={1} value={removedSome[item.saleItemId!] ?? 0} onChange={(event) => setRemovedSome((current) => ({ ...current, [item.saleItemId!]: Math.max(0, Math.min(maximum, Math.floor(Number(event.target.value) || 0))) }))} className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-right" /></label>;
                }) : null}
              </section>
            ) : null}
          </>
        ) : (
          <section className="grid gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-xs">The full current value of <strong>{formatMvr(transaction.totalLaari)}</strong> will be reversed.</p>
            <StockChoices legend="Reverse stock count?" mode={reverseMode} onChange={setReverseMode} allowNone={false} />
            {reverseMode === "SOME" ? transaction.items.map((item) => item.saleItemId ? <label key={item.saleItemId} className="flex items-center justify-between gap-3 text-xs"><span>{item.productName} · max {item.stockTrackedQuantity}</span><input type="number" min={0} max={item.stockTrackedQuantity} step={1} value={reverseSome[item.saleItemId] ?? 0} onChange={(event) => setReverseSome((current) => ({ ...current, [item.saleItemId!]: Math.max(0, Math.min(item.stockTrackedQuantity, Math.floor(Number(event.target.value) || 0))) }))} className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-right" /></label> : null) : null}
          </section>
        )}

        {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
        <footer className="flex justify-end gap-2">
          <button type="button" disabled={pending} onClick={() => dialogRef.current?.close()} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold">Cancel</button>
          <button type="button" disabled={pending || (mode === "AMEND" && !changes.length)} onClick={submit} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">{pending ? <LoaderCircle className="size-3.5 animate-spin" /> : null}{mode === "AMEND" ? "Save amendment" : "Reverse bill"}</button>
        </footer>
      </div>
    </dialog>
  );
}
