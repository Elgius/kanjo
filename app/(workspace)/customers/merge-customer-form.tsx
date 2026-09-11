"use client";
import { useState } from "react";
import { MutationForm } from "@/components/pos/mutation-form";
import { formatMvr } from "@/lib/pos/money";
import { mergeCustomerAction } from "./actions";
type Account = { id: string; name: string; updatedAt: string; outstandingLaari: number; creditLimitLaari: number };
export function MergeCustomerForm({ source, candidates }: { source: Account; candidates: Account[] }) {
  const [targetId, setTargetId] = useState(""); const target = candidates.find(c => c.id === targetId);
  return <details className="rounded-xl border border-border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Merge duplicate account</summary>
    <MutationForm action={mergeCustomerAction.bind(null, source.id)} className="mt-4 grid gap-3 text-xs">
      <p>Source: {source.name} · {source.id.slice(0,8)}. All credit bills move to the destination. The source is archived and its audit history remains available. The destination’s profile and limit stay unchanged.</p>
      <label className="grid gap-1">Destination account<select name="targetId" value={targetId} onChange={e=>setTargetId(e.target.value)} required className="h-10 rounded border bg-background px-2"><option value="">Choose an account</option>{candidates.map(c=><option key={c.id} value={c.id}>{c.name} · {c.id.slice(0,8)}</option>)}</select></label>
      {target && <p role="status">Combined outstanding: {formatMvr(source.outstandingLaari + target.outstandingLaari)}. Destination limit: {formatMvr(target.creditLimitLaari)}.</p>}
      <input type="hidden" name="sourceUpdatedAt" value={source.updatedAt} /><input type="hidden" name="targetUpdatedAt" value={target?.updatedAt ?? ""} />
      <label className="grid gap-1">Merge reason<textarea name="mergeReason" minLength={5} maxLength={500} required className="rounded border p-2" /></label>
      <label className="flex gap-2"><input name="confirmMerge" type="checkbox" required />I verified that both accounts belong to the same person.</label>
      <button disabled={!target} className="h-10 rounded border border-destructive px-3 disabled:opacity-50">Merge accounts</button>
    </MutationForm>
  </details>;
}
