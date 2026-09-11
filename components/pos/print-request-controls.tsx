"use client";

import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import { getPrintHistoryAction, requestBillPrintAction } from "./print-actions";

type History = { printRequestCount: number; lastPrintRequestedAt: string | null };

function PrintControls({ billId, onPrint, onRequest, disabled = false, label = "Print bill" }: {
  billId?: string;
  onPrint?: () => void;
  disabled?: boolean;
  label?: string;
  onRequest?: (reason: string, requestId: string) => Promise<({ ok: true } & History) | { ok: false; error: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const request = useRef<{ key: string; reason: string } | null>(null);

  async function print() {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    try {
      if (!request.current) {
        const history = billId ? await getPrintHistoryAction(billId) : null;
        let reason = "";
        if (history && history.printRequestCount > 0) {
          const answer = window.prompt("Reason for reprinting this bill (5–500 characters):");
          if (answer === null) return;
          reason = answer.trim();
          if (reason.length < 5 || reason.length > 500) {
            window.alert("Give a reprint reason (5–500 characters).");
            return;
          }
        }
        request.current = { key: crypto.randomUUID(), reason };
      }
      const { reason, key } = request.current;
      const result = onRequest
        ? await onRequest(reason, key)
        : await requestBillPrintAction(billId!, reason, key);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      request.current = null;
      onPrint?.();
    } catch {
      window.alert("Could not complete the print request. Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void print()}
      disabled={disabled || busy}
      aria-label={label}
      aria-busy={busy}
      title={busy ? "Requesting print…" : label}
      className="flex size-[30px] shrink-0 items-center justify-center rounded-[7px] border border-border text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Printer className="size-3.5" aria-hidden="true" />
    </button>
  );
}

export function PrintRequestControls(props: Parameters<typeof PrintControls>[0]) {
  return <PrintControls key={props.billId ?? "new"} {...props} />;
}
