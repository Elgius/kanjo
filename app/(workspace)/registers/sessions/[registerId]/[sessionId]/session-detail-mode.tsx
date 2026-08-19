"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";

import { PageHeader, Surface } from "@/components/pos/primitives";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ShiftStatus } from "@/generated/prisma/enums";
import { formatMvr } from "@/lib/pos/money";
import type { SessionDetailData } from "@/lib/pos/session-details";
import { cn } from "@/lib/utils";

const paymentChartConfig = {
  totalLaari: { label: "Received", color: "var(--chart-1)" },
} satisfies ChartConfig;

const hourlyChartConfig = {
  count: { label: "Payments", color: "var(--chart-1)" },
} satisfies ChartConfig;

const paymentColors = {
  CASH: "var(--chart-1)",
  CARD: "var(--chart-2)",
  MOBILE: "var(--chart-4)",
} as const;

function StatusPill({ status }: { status: ShiftStatus }) {
  return (
    <span className={cn("flex h-9 items-center rounded-full px-3 text-[10px] font-semibold", status === "OPEN" ? "bg-chart-1/10 text-chart-1" : "bg-secondary text-muted-foreground")}>
      <span className={cn("mr-2 size-1.5 rounded-full", status === "OPEN" ? "bg-chart-1" : "border border-muted-foreground")} />
      {status}
    </span>
  );
}

export function SessionDetailMode({
  eyebrow,
  title,
  description,
  status,
  details,
}: {
  eyebrow: string;
  title: string;
  description: string;
  status: ShiftStatus;
  details: SessionDetailData;
}) {
  const [open, setOpen] = useState(false);
  const completedPayments = details.paymentMethods.reduce((total, method) => total + method.count, 0);
  const peakHour = details.hourlyPayments.reduce((peak, hour) => hour.count > peak.count ? hour : peak, details.hourlyPayments[0]);

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={(
          <>
            <button
              type="button"
              aria-expanded={open}
              aria-controls="session-detail-mode"
              onClick={() => setOpen((current) => !current)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                open ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent",
              )}
            >
              <BarChart3 className="size-3.5" aria-hidden="true" />
              Detail mode
            </button>
            <StatusPill status={status} />
          </>
        )}
      />

      {open ? (
        <section id="session-detail-mode" aria-label="Session payment details" className="grid gap-3.5 xl:grid-cols-2">
          <Surface className="overflow-hidden">
            <header className="border-b border-border px-5 py-5 sm:px-6">
              <p className="text-[10px] font-semibold text-chart-1">PAYMENT MIX</p>
              <h2 className="mt-1 text-sm font-semibold">Received by payment type</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Completed payments in this session.</p>
            </header>
            <div className="grid gap-5 p-5 sm:p-6">
              <div className="grid gap-2 sm:grid-cols-3">
                {details.paymentMethods.map((method) => (
                  <div key={method.paymentMethod} className="rounded-lg bg-accent px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: paymentColors[method.paymentMethod] }} />
                      <p className="text-[10px] text-muted-foreground">{method.label.toUpperCase()}</p>
                    </div>
                    <p className="mt-2 text-base font-semibold">{formatMvr(method.totalLaari)}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{method.count} {method.count === 1 ? "payment" : "payments"}</p>
                  </div>
                ))}
              </div>
              <ChartContainer
                config={paymentChartConfig}
                className="h-[210px] w-full justify-start aspect-auto"
                initialDimension={{ width: 520, height: 210 }}
                role="img"
                aria-label="Bar chart of received payment totals by payment type."
              >
                <BarChart accessibilityLayer data={details.paymentMethods} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
                  <CartesianGrid horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="label" type="category" axisLine={false} tickLine={false} tickMargin={8} width={72} tick={{ fontSize: 10 }} />
                  <ChartTooltip
                    cursor={{ fill: "var(--accent)" }}
                    content={<ChartTooltipContent hideLabel formatter={(value) => <span className="font-mono font-medium">{formatMvr(Number(value))}</span>} />}
                  />
                  <Bar dataKey="totalLaari" radius={[0, 5, 5, 0]}>
                    {details.paymentMethods.map((method) => <Cell key={method.paymentMethod} fill={paymentColors[method.paymentMethod]} />)}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>
          </Surface>

          <Surface className="overflow-hidden">
            <header className="flex items-end justify-between gap-4 border-b border-border px-5 py-5 sm:px-6">
              <div>
                <p className="text-[10px] font-semibold text-chart-1">PAYMENT FREQUENCY</p>
                <h2 className="mt-1 text-sm font-semibold">Payments by hour</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">Completed payment count in Maldives time.</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">PEAK HOUR</p>
                <p className="mt-1 text-sm font-semibold">{completedPayments ? peakHour.label : "—"}</p>
                <p className="text-[10px] text-muted-foreground">{completedPayments ? `${peakHour.count} payments` : "No payments"}</p>
              </div>
            </header>
            <div className="p-5 sm:p-6">
              <ChartContainer
                config={hourlyChartConfig}
                className="h-[292px] w-full justify-start aspect-auto"
                initialDimension={{ width: 520, height: 292 }}
                role="img"
                aria-label="Bar chart of completed payment frequency by hour in Maldives time."
              >
                <BarChart accessibilityLayer data={details.hourlyPayments} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={12} interval={2} tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={24} tick={{ fontSize: 10 }} />
                  <ChartTooltip cursor={{ fill: "var(--accent)" }} content={<ChartTooltipContent hideLabel />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          </Surface>
        </section>
      ) : null}
    </>
  );
}
