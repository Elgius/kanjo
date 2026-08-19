"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { PrintableBill } from "@/components/pos/printable-bill";
import type { BillStatus } from "@/generated/prisma/enums";

export type PrintableReceipt = {
  id: string;
  receiptNumber: string;
  subtotalLaari: number;
  totalLaari: number;
  paymentMethod: "CASH" | "CARD" | "MOBILE";
  createdAt: string;
  createdBy: { name: string };
  bill: { billNumber: string; status: BillStatus } | null;
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

  function print() {
    document.body.setAttribute("data-print-target", "receipt");
    window.addEventListener("afterprint", () => document.body.removeAttribute("data-print-target"), { once: true });
    window.print();
  }

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
          <PrintableBill
            className="receipt-print-root"
            registerName={registerName}
            registerCode={registerCode}
            billNumber={receipt.bill?.billNumber ?? receipt.receiptNumber}
            receiptNumber={receipt.receiptNumber}
            dateLabel="Date"
            dateValue={createdAt}
            cashierName={receipt.createdBy.name}
            items={receipt.items.map((item) => ({ key: item.id, name: item.productName, sku: item.productSku, quantity: item.quantity, unitPriceLaari: item.unitPriceLaari, lineTotalLaari: item.lineTotalLaari }))}
            subtotalLaari={receipt.subtotalLaari}
            totalLaari={receipt.totalLaari}
            paymentMethod={receipt.paymentMethod}
            status={receipt.bill?.status ?? "PAID"}
          />
        </div>

        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={close} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold">No, thanks</button>
          <button type="button" onClick={print} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Yes, print bill</button>
        </div>
      </div>
    </dialog>
  );
}
