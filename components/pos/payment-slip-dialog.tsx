"use client";

import { useEffect, useRef } from "react";
import { FileCheck2, X } from "lucide-react";

export type PaymentSlipReference = {
  billId: string;
  billNumber: string;
  fileName: string;
  contentType: string;
  uploadedAt: string;
};

export function PaymentSlipDialog({
  slip,
  closeError,
  closing = false,
  onClose,
  onCloseBill,
}: {
  slip: PaymentSlipReference;
  closeError?: string | null;
  closing?: boolean;
  onClose: () => void;
  onCloseBill?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        if (closing) event.preventDefault();
        else onClose();
      }}
      onClose={onClose}
      className="m-auto max-h-[calc(100vh-32px)] w-[min(900px,calc(100%-32px))] overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/35"
    >
      <div className="grid gap-4 p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs text-chart-1"><FileCheck2 className="size-4" aria-hidden="true" />Payment slip received</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold">Bill #{slip.billNumber}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{slip.fileName}</p>
          </div>
          <button type="button" disabled={closing} aria-label="Keep bill open" onClick={() => dialogRef.current?.close()} className="flex size-9 items-center justify-center rounded-lg border border-border hover:bg-accent disabled:opacity-45"><X className="size-4" /></button>
        </header>

        <iframe
          src={`/api/payment-slips/${slip.billId}`}
          title={`Payment slip for bill ${slip.billNumber}`}
          className="h-[min(65vh,680px)] w-full rounded-lg border border-border bg-white"
        />

        {closeError ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">{closeError}</p> : null}
        <div className="flex justify-end gap-2.5">
          <button type="button" disabled={closing} onClick={() => dialogRef.current?.close()} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold disabled:opacity-45">Keep</button>
          {onCloseBill ? <button type="button" disabled={closing} onClick={onCloseBill} className="h-10 rounded-lg bg-chart-1 px-4 text-xs font-semibold text-white disabled:opacity-45">{closing ? "Closing bill…" : "Close bill"}</button> : null}
        </div>
      </div>
    </dialog>
  );
}
