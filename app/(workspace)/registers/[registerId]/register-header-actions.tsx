"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { MutationForm } from "@/components/pos/mutation-form";
import { formatMvr } from "@/lib/pos/money";
import { closeShiftAction, reviewClosingCashAction } from "../actions";
import { cancelHeldOrderAction } from "./actions";

type HeldBill = { id: string; totalLaari: number; customerNote: string | null; restaurantTable: { name: string } | null };
export function RegisterHeaderActions({ registerId, shiftId, canEdit, heldOrders, canCancel }: {
  registerId: string; shiftId: string; canEdit: boolean; heldOrders: HeldBill[]; canCancel: boolean;
}) {
  const pathname = usePathname();
  const basePath = pathname.startsWith("/live_register/") ? "/live_register" : "/registers";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [count, setCount] = useState(""); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [review, setReview] = useState<{ expectedCashLaari: number; varianceLaari: number; thresholdLaari: number } | null>(null);
  const [error, setError] = useState("");
  return <div className="flex gap-2.5">
    <button type="button" onClick={() => window.print()} className="h-10 rounded-lg border px-4 text-xs font-semibold">Print summary</button>
    {canEdit && <button type="button" onClick={() => { setReview(null); setCount(""); setError(""); dialogRef.current?.showModal(); }} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Close shift</button>}
    <dialog ref={dialogRef} className="m-auto max-h-[85vh] w-[min(540px,calc(100%-32px))] overflow-y-auto rounded-xl border border-border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/35">
      <h2 className="font-serif text-2xl font-semibold">Close this shift?</h2>
      {heldOrders.length > 0 ? <div className="mt-4 grid gap-3 text-xs">
        <p role="status">Resolve {heldOrders.length} held {heldOrders.length === 1 ? "bill" : "bills"} before closing.</p>
        {heldOrders.map(order => <div key={order.id} className="grid gap-2 rounded-lg border p-3">
          <p>{order.restaurantTable?.name ?? order.customerNote ?? `Tab ${order.id.slice(0,8)}`} · {formatMvr(order.totalLaari)}</p>
          <Link href={`${basePath}/${registerId}?order=${order.id}`} onClick={() => dialogRef.current?.close()} className="underline">Resume / settle bill</Link>
          {canCancel && <MutationForm action={cancelHeldOrderAction.bind(null, shiftId, registerId, order.id)} className="grid gap-2">
            <label className="grid gap-1">Cancellation reason<input name="cancellationReason" required minLength={5} maxLength={500} className="h-10 rounded border px-2" /></label>
            <button className="h-9 rounded border border-destructive text-destructive">Cancel held bill</button>
          </MutationForm>}
        </div>)}
      </div> : <div className="mt-4 grid gap-4">
        <p className="text-xs text-muted-foreground">Count the physical cash first. Submit your count to compare it with the expected balance.</p>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        {!review ? <form className="grid gap-3" onSubmit={async e => {
          e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError("");
          try { const result = await reviewClosingCashAction(shiftId, registerId, count); if (result.ok) setReview(result); else setError(result.error); }
          catch { setError("Could not review the count. Try again."); }
          finally { lock.current = false; setBusy(false); }
        }}>
          <label className="grid gap-1.5 text-xs">Counted cash (MVR)<input name="countedCash" inputMode="decimal" value={count} onChange={e=>setCount(e.target.value)} required className="h-11 rounded-lg border px-3" /></label>
          <button disabled={busy} className="h-10 rounded-lg bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Checking…" : "Review cash count"}</button>
        </form> : <MutationForm action={closeShiftAction.bind(null, shiftId, registerId)} className="grid gap-3 text-xs">
          <input type="hidden" name="closingCash" value={count} /><input type="hidden" name="reviewedExpectedCash" value={review.expectedCashLaari} />
          <p>Counted: MVR {count}</p><p>Expected: {formatMvr(review.expectedCashLaari)}</p><p role="status">Variance: {formatMvr(review.varianceLaari)}</p>
          <label className="grid gap-1">Variance explanation {Math.abs(review.varianceLaari) > review.thresholdLaari ? "(required)" : "(optional)"}<textarea name="cashVarianceReason" required={Math.abs(review.varianceLaari) > review.thresholdLaari} minLength={5} maxLength={500} className="rounded border p-2" /></label>
          <p className="text-muted-foreground">Differences greater than {formatMvr(review.thresholdLaari)} require an explanation.</p>
          <button type="button" onClick={()=>setReview(null)} className="h-9 rounded border">Recount cash</button>
          <button className="h-10 rounded bg-primary font-semibold text-primary-foreground">Confirm and close shift</button>
        </MutationForm>}
      </div>}
      <button type="button" onClick={()=>dialogRef.current?.close()} className="mt-4 h-9 rounded border px-4 text-xs">Keep shift open</button>
    </dialog>
  </div>;
}
