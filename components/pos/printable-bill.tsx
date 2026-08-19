"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import type { BillStatus, PaymentMethod } from "@/generated/prisma/enums";
import { formatMvr } from "@/lib/pos/money";
import { cn } from "@/lib/utils";

export type PrintableBillItem = {
  key: string;
  name: string;
  sku?: string | null;
  quantity: number;
  unitPriceLaari: number;
  lineTotalLaari: number;
};

function paymentLabel(paymentMethod: PaymentMethod | null) {
  if (!paymentMethod) return "Pending";
  return paymentMethod === "MOBILE"
    ? "Mobile pay"
    : paymentMethod[0] + paymentMethod.slice(1).toLowerCase();
}

export type PrintableBillProps = {
  className?: string;
  registerName: string;
  registerCode: string;
  billNumber: string;
  receiptNumber?: string | null;
  dateLabel?: string;
  dateValue?: string | null;
  cashierName: string;
  tableName?: string | null;
  customerNote?: string | null;
  items: PrintableBillItem[];
  subtotalLaari: number;
  totalLaari: number;
  paymentMethod: PaymentMethod | null;
  status: BillStatus;
  showIncludedTax?: boolean;
};

export type BillPrintTarget = "receipt" | "history" | "current";

const BILL_PRINT_CLASS: Record<BillPrintTarget, string> = {
  receipt: "receipt-print-root",
  history: "bill-history-print-root",
  current: "current-order-print-root",
};
const BILL_PAGE_STYLE_ID = "bill-print-page-size";
const CSS_PIXELS_PER_INCH = 96;
const MILLIMETRES_PER_INCH = 25.4;
const PAGE_WIDTH_MM = 58;
const PAGE_MARGIN_MM = 3;
const PAGE_HEIGHT_BUFFER_MM = 1;

const subscribeToDocument = () => () => {};
const getDocumentBody = () => document.body;
const getServerDocumentBody = () => null;

export function PrintableBill({
  className,
  registerName,
  registerCode,
  billNumber,
  receiptNumber,
  dateLabel = "Opened",
  dateValue,
  cashierName,
  tableName,
  customerNote,
  items,
  subtotalLaari,
  totalLaari,
  paymentMethod,
  status,
  showIncludedTax = false,
}: PrintableBillProps) {
  return (
    <article className={cn("w-[48mm] bg-white font-mono text-[10px] leading-[1.35] text-black", className)}>
      <header className="border-b border-dashed border-black pb-2 text-center">
        <h1 className="text-sm font-bold">KANJO</h1>
        <p className="mt-1">{registerName}</p>
        <p>{registerCode}</p>
      </header>
      <div className="border-b border-dashed border-black py-2">
        <div className="flex justify-between gap-2"><span>Bill</span><strong>#{billNumber}</strong></div>
        {receiptNumber ? <div className="flex justify-between gap-2"><span>Receipt</span><strong>#{receiptNumber}</strong></div> : null}
        {dateValue ? <div className="flex justify-between gap-2"><span>{dateLabel}</span><span className="text-right">{dateValue}</span></div> : null}
        <div className="flex justify-between gap-2"><span>Cashier</span><span className="truncate text-right">{cashierName}</span></div>
        {tableName ? <div className="flex justify-between gap-2"><span>Table</span><span className="text-right">{tableName}</span></div> : null}
        {customerNote ? <div className="mt-1"><span>Note</span><p className="break-words">{customerNote}</p></div> : null}
      </div>
      <div className="grid gap-2 border-b border-dashed border-black py-2">
        {items.map((item) => (
          <div key={item.key}>
            <div className="flex justify-between gap-2 font-bold"><span className="min-w-0 break-words">{item.name}</span><span className="shrink-0">{formatMvr(item.lineTotalLaari)}</span></div>
            <div className="flex justify-between gap-2"><span>{item.quantity} × {formatMvr(item.unitPriceLaari)}</span>{item.sku ? <span>{item.sku}</span> : null}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-1 py-2">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatMvr(subtotalLaari)}</span></div>
        {showIncludedTax ? <div className="flex justify-between"><span>Tax</span><span>Included</span></div> : null}
        <div className="flex justify-between text-xs font-bold"><span>TOTAL</span><span>{formatMvr(totalLaari)}</span></div>
        <div className="flex justify-between"><span>Payment</span><span>{paymentLabel(paymentMethod)}</span></div>
      </div>
      <footer className="border-t border-dashed border-black pt-2 text-center">
        <p className="text-sm font-black tracking-[0.18em]">{status}</p>
        <p className="mt-1">Powered by Kanjo</p>
      </footer>
    </article>
  );
}

export function PrintableBillPortal(props: PrintableBillProps) {
  const portalRoot = useSyncExternalStore(subscribeToDocument, getDocumentBody, getServerDocumentBody);

  return portalRoot ? createPortal(<PrintableBill {...props} />, portalRoot) : null;
}

export function printBill(target: BillPrintTarget) {
  const bill = document.querySelector<HTMLElement>(`body > .${BILL_PRINT_CLASS[target]}`);
  if (!bill) return;

  document.getElementById(BILL_PAGE_STYLE_ID)?.remove();

  const contentHeightMm = bill.getBoundingClientRect().height
    * MILLIMETRES_PER_INCH
    / CSS_PIXELS_PER_INCH;
  const pageHeightMm = Math.ceil(
    (contentHeightMm + PAGE_MARGIN_MM * 2 + PAGE_HEIGHT_BUFFER_MM) * 10,
  ) / 10;
  const pageStyle = document.createElement("style");
  pageStyle.id = BILL_PAGE_STYLE_ID;
  pageStyle.textContent = `@media print { @page { size: ${PAGE_WIDTH_MM}mm ${pageHeightMm}mm; margin: ${PAGE_MARGIN_MM}mm 5mm; } }`;
  document.head.append(pageStyle);
  document.body.setAttribute("data-print-target", target);

  function cleanup() {
    document.body.removeAttribute("data-print-target");
    pageStyle.remove();
  }

  window.addEventListener("afterprint", cleanup, { once: true });
  try {
    window.print();
  } catch (error) {
    window.removeEventListener("afterprint", cleanup);
    cleanup();
    throw error;
  }
}
