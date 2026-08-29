import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PaymentLookup } from "./payment-lookup";

export const metadata: Metadata = {
  title: "Payment bill · Kanjo",
  description: "Look up a Kanjo bill and upload a payment slip.",
  robots: { index: false, follow: false },
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PaymentBillPage({ params }: PageProps<"/payment/[id]">) {
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
      <div className="grid w-full max-w-2xl gap-4">
        <header className="text-center">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-chart-1">KANJO PAYMENT</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">Find your bill</h1>
          <p className="mt-2 text-xs text-muted-foreground">Confirm your phone number to continue.</p>
        </header>
        <PaymentLookup billId={id} />
      </div>
    </main>
  );
}
