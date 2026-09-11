"use client";
import { useEffect, useRef, useState } from "react";
import { getPrintHistoryAction, requestBillPrintAction } from "./print-actions";
type History = { printRequestCount: number; lastPrintRequestedAt: string | null };
function PrintControls({ billId, onPrint, onRequest, disabled = false, label = "Print bill" }: {
  billId?: string; onPrint?: () => void; disabled?: boolean; label?: string;
  onRequest?: (reason: string, requestId: string) => Promise<({ ok: true } & History) | { ok: false; error: string }>;
}) {
  const [history, setHistory] = useState<History | null>(billId ? null : { printRequestCount: 0, lastPrintRequestedAt: null });
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [error,setError] = useState("");
  const lock = useRef(false); const request = useRef<{ key: string; reason: string } | null>(null);
  useEffect(() => { let active = true;
    if (!billId) return;
    getPrintHistoryAction(billId).then(h=>{ if(active) setHistory(h); }).catch(()=>{ if(active) setError("Could not load print history. Reopen this bill to retry."); });
    return ()=>{ active=false; };
  }, [billId]);
  async function print() {
    if(lock.current || !history) return; lock.current = true; setBusy(true); setError("");
    if (!request.current || request.current.reason !== reason) request.current = { key: crypto.randomUUID(), reason };
    try {
      const result = onRequest ? await onRequest(reason, request.current.key) : await requestBillPrintAction(billId!, reason, request.current.key);
      if (!result.ok) { setError(result.error); return; }
      setHistory(result); request.current = null; setReason(""); onPrint?.();
    } catch { setError("Print request interrupted. Retry to retrieve the same request."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="grid gap-2 rounded-lg border border-border p-3 text-xs">
    <p>{history ? `${history.printRequestCount} print requests · ${Math.max(0,history.printRequestCount-1)} reprints` : "Loading print history…"}</p>
    {history?.lastPrintRequestedAt && <p>Last requested: {new Intl.DateTimeFormat("en-GB", { timeZone: "Indian/Maldives", dateStyle: "medium", timeStyle: "short" }).format(new Date(history.lastPrintRequestedAt))}</p>}
    <p className="text-muted-foreground">Browser printing records a request; paper output cannot be confirmed.</p>
    {(history?.printRequestCount ?? 0) > 0 && <label className="grid gap-1">Reprint reason<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} className="h-9 rounded border bg-background px-2" /></label>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <button type="button" onClick={()=>void print()} disabled={disabled || busy || !history || (history.printRequestCount > 0 && reason.trim().length < 5)} className="h-10 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Requesting…" : label}</button>
  </div>;
}

export function PrintRequestControls(props: Parameters<typeof PrintControls>[0]) { return <PrintControls key={props.billId ?? "new"} {...props} />; }
