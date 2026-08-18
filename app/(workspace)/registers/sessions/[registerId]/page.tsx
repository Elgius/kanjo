import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { MetricCard, PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { authorizedRegisterIds, requireCapability } from "@/lib/authorization";
import { formatMvr } from "@/lib/pos/money";
import { getRegisterSessions } from "@/lib/pos/register-sessions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sessions · Kanjo",
};

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-MV", {
    timeZone: "Indian/Maldives",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function duration(openedAt: Date, closedAt: Date | null) {
  const minutes = Math.max(0, Math.floor(((closedAt ?? new Date()).getTime() - openedAt.getTime()) / 60_000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default async function RegisterSessionHistoryPage({
  params,
}: {
  params: Promise<{ registerId: string }>;
}) {
  const authorization = await requireCapability("REGISTER_SESSIONS_VIEW", "REGISTER_SESSIONS_PAGE");
  const { registerId } = await params;
  const register = await getRegisterSessions(registerId, authorizedRegisterIds(authorization));
  if (!register) notFound();

  const totalSales = register.shifts.reduce((total, shift) => total + shift.completedSalesLaari, 0);
  const totalTransactions = register.shifts.reduce((total, shift) => total + shift.transactionCount, 0);

  return (
    <PageContainer>
      <Link href="/registers/sessions" prefetch={false} className="flex w-fit items-center gap-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        All registers
      </Link>

      <PageHeader
        eyebrow={`Registers / Sessions / ${register.code}`}
        title={register.name}
        description="Every shift opened on this register, newest first."
      />

      <section className="grid gap-3.5 sm:grid-cols-3">
        <MetricCard label="SESSIONS" value={register.shifts.length.toLocaleString("en-MV")} note={register.shifts[0]?.status === "OPEN" ? "1 open" : "All closed"} />
        <MetricCard label="TRANSACTIONS" value={totalTransactions.toLocaleString("en-MV")} note="Completed" />
        <MetricCard label="TOTAL SALES" value={formatMvr(totalSales)} note="Across sessions" dark />
      </section>

      <Surface className="overflow-hidden">
        <header className="flex items-end justify-between gap-4 border-b border-border px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold">Session history</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">A session begins when a shift is opened and ends when it is closed.</p>
          </div>
          <span className="text-[11px] text-muted-foreground">{register.shifts.length} total</span>
        </header>

        {register.shifts.length ? (
          <div className="divide-y divide-border">
            {register.shifts.map((shift) => {
              const expectedCash = shift.openingCashLaari + shift.cashSalesLaari;
              const variance = shift.closingCashLaari === null ? null : shift.closingCashLaari - expectedCash;
              return (
                <Link
                  key={shift.id}
                  href={`/registers/sessions/${register.id}/${shift.id}`}
                  prefetch={false}
                  className="group grid gap-4 px-5 py-5 transition-colors hover:bg-accent sm:px-6 lg:grid-cols-[minmax(250px,1.35fr)_repeat(3,minmax(110px,0.7fr))_24px] lg:items-center"
                >
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className={cn("size-2 rounded-full", shift.status === "OPEN" ? "bg-chart-1" : "border border-muted-foreground")} />
                      <h3 className="text-[13px] font-semibold">{formatDateTime(shift.openedAt)}</h3>
                      <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold", shift.status === "OPEN" ? "bg-chart-1/10 text-chart-1" : "bg-secondary text-muted-foreground")}>
                        {shift.status}
                      </span>
                    </div>
                    <p className="mt-1.5 pl-[18px] text-[11px] text-muted-foreground">
                      {shift.openedBy.name} · {duration(shift.openedAt, shift.closedAt)}
                    </p>
                  </div>
                  <div><p className="text-[9px] text-muted-foreground">TRANSACTIONS</p><p className="mt-1 text-[13px] font-semibold">{shift.transactionCount}</p></div>
                  <div><p className="text-[9px] text-muted-foreground">NET SALES</p><p className="mt-1 text-[13px] font-semibold">{formatMvr(shift.completedSalesLaari)}</p></div>
                  <div><p className="text-[9px] text-muted-foreground">CASH VARIANCE</p><p className={cn("mt-1 text-[13px] font-semibold", variance !== null && variance !== 0 && "text-chart-1")}>{variance === null ? "—" : formatMvr(variance)}</p></div>
                  <ArrowRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 lg:block" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-1 px-5 text-center">
            <h2 className="text-sm font-semibold">No sessions yet</h2>
            <p className="text-xs text-muted-foreground">Open this register from Register selection to begin its first shift.</p>
          </div>
        )}
      </Surface>
    </PageContainer>
  );
}
