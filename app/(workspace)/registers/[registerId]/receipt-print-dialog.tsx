"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { formatMvr } from "@/lib/pos/money";

export type PrintableReceipt = {
  id: string;
  receiptNumber: string;
  subtotalLaari: number;
  totalLaari: number;
  paymentMethod: "CASH" | "CARD" | "MOBILE";
  createdAt: string;
  createdBy: { name: string };
  items: Array<{
    id: string;
    productName: string;
    productSku: string | null;
    quantity: number;
    unitPriceLaari: number;
    lineTotalLaari: number;
  }>;
};

export function ReceiptPrintDialog({
  registerId,
  registerName,
  registerCode,
  receipt,
}: {
  registerId: string;
  registerName: string;
  registerCode: string;
  receipt: PrintableReceipt;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function close() {
    dialogRef.current?.close();
    router.replace(`/registers/${registerId}`, { scroll: false });
  }

  const payment = receipt.paymentMethod === "MOBILE"
    ? "Mobile pay"
    : receipt.paymentMethod[0] + receipt.paymentMethod.slice(1).toLowerCase();
  const createdAt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Indian/Maldives",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(receipt.createdAt));

  return (
    <dialog ref={dialogRef} onCancel={close} className="m-auto w-[min(520px,calc(100%-32px))] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/35">
      <div className="grid gap-5 p-6">
        <div>
          <p className="text-xs text-chart-1">Sale recorded</p>
          <h2 className="font-serif text-2xl font-semibold">Print the bill?</h2>
          <p className="mt-1 text-xs text-muted-foreground">Receipt #{receipt.receiptNumber} is ready for the receipt printer.</p>
        </div>

        <div className="flex justify-center rounded-lg border border-border bg-white p-4">
          <article className="receipt-print-root w-[48mm] bg-white font-mono text-[10px] leading-[1.35] text-black">
            <header className="border-b border-dashed border-black pb-2 text-center">
              <h1 className="text-sm font-bold">KANJO</h1>
              <p className="mt-1">{registerName}</p>
              <p>{registerCode}</p>
            </header>
            <div className="border-b border-dashed border-black py-2">
              <div className="flex justify-between gap-2"><span>Receipt</span><strong>#{receipt.receiptNumber}</strong></div>
              <div className="flex justify-between gap-2"><span>Date</span><span className="text-right">{createdAt}</span></div>
              <div className="flex justify-between gap-2"><span>Cashier</span><span className="truncate text-right">{receipt.createdBy.name}</span></div>
            </div>
            <div className="grid gap-2 border-b border-dashed border-black py-2">
              {receipt.items.map((item) => (
                <div key={item.id}>
                  <div className="flex justify-between gap-2 font-bold"><span className="min-w-0 break-words">{item.productName}</span><span className="shrink-0">{formatMvr(item.lineTotalLaari)}</span></div>
                  <div className="flex justify-between gap-2"><span>{item.quantity} × {formatMvr(item.unitPriceLaari)}</span>{item.productSku ? <span>{item.productSku}</span> : null}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-1 py-2">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatMvr(receipt.subtotalLaari)}</span></div>
              <div className="flex justify-between text-xs font-bold"><span>TOTAL</span><span>{formatMvr(receipt.totalLaari)}</span></div>
              <div className="flex justify-between"><span>Payment</span><span>{payment}</span></div>
            </div>
            <footer className="border-t border-dashed border-black pt-2 text-center">
              <p>Thank you</p>
              <p className="mt-1">Powered by Kanjo</p>
            </footer>
          </article>
        </div>

        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={close} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold">No, thanks</button>
          <button type="button" onClick={() => window.print()} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Yes, print bill</button>
        </div>
      </div>
    </dialog>
  );
}
