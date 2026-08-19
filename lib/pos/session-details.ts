import type { PaymentMethod, SaleStatus } from "@/generated/prisma/enums";
import { formatHour, getMaldivesHour } from "@/lib/pos/dates";

const paymentMethods = [
  { paymentMethod: "CASH", label: "Cash" },
  { paymentMethod: "CARD", label: "Card" },
  { paymentMethod: "MOBILE", label: "Mobile pay" },
] as const satisfies ReadonlyArray<{ paymentMethod: PaymentMethod; label: string }>;

type SessionDetailSale = {
  status: SaleStatus;
  paymentMethod: PaymentMethod;
  totalLaari: number;
  createdAt: Date;
};

export type SessionDetailData = {
  paymentMethods: Array<{
    paymentMethod: PaymentMethod;
    label: string;
    totalLaari: number;
    count: number;
  }>;
  hourlyPayments: Array<{
    hour: number;
    label: string;
    count: number;
  }>;
};

export function summarizeSessionDetails(
  sales: Iterable<SessionDetailSale>,
): SessionDetailData {
  const totals = new Map<PaymentMethod, { totalLaari: number; count: number }>();
  const hourlyCounts = Array.from({ length: 24 }, () => 0);

  for (const sale of sales) {
    if (sale.status !== "COMPLETED") continue;
    const current = totals.get(sale.paymentMethod) ?? { totalLaari: 0, count: 0 };
    current.totalLaari += sale.totalLaari;
    current.count += 1;
    totals.set(sale.paymentMethod, current);
    hourlyCounts[getMaldivesHour(sale.createdAt)] += 1;
  }

  return {
    paymentMethods: paymentMethods.map(({ paymentMethod, label }) => ({
      paymentMethod,
      label,
      ...(totals.get(paymentMethod) ?? { totalLaari: 0, count: 0 }),
    })),
    hourlyPayments: hourlyCounts.map((count, hour) => ({
      hour,
      label: formatHour(hour),
      count,
    })),
  };
}
