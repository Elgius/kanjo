import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { MetricCard, PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { requirePageAccess } from "@/lib/authorization";
import { formatMvr } from "@/lib/pos/money";
import { getRegisterSession } from "@/lib/pos/register-sessions";
import { cn } from "@/lib/utils";
import { SessionTransactions } from "./session-transactions";

export const metadata: Metadata = {
  title: "Session transactions · Kanjo",
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

export default async function RegisterSessionPage({
  params,
}: {
  params: Promise<{ registerId: string; sessionId: string }>;
}) {
  await requirePageAccess("REGISTERS");
  const { registerId, sessionId } = await params;
  const session = await getRegisterSession(registerId, sessionId);
  if (!session) notFound();

  return (
    <PageContainer>
      <Link href={`/registers/sessions/${session.register.id}`} prefetch={false} className="flex w-fit items-center gap-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {session.register.name} sessions
      </Link>

      <PageHeader
        eyebrow={`Registers / Sessions / ${session.register.code}`}
        title={`Session · ${formatDateTime(session.openedAt)}`}
        description={`${session.status === "OPEN" ? "Open" : "Closed"} shift run by ${session.openedBy.name} · ${duration(session.openedAt, session.closedAt)}`}
        actions={<span className={cn("flex h-9 items-center rounded-full px-3 text-[10px] font-semibold", session.status === "OPEN" ? "bg-chart-1/10 text-chart-1" : "bg-secondary text-muted-foreground")}><span className={cn("mr-2 size-1.5 rounded-full", session.status === "OPEN" ? "bg-chart-1" : "border border-muted-foreground")} />{session.status}</span>}
      />

      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="NET SALES" value={formatMvr(session.metrics.completedSalesLaari)} note="Completed" dark />
        <MetricCard label="TRANSACTIONS" value={session.metrics.completedTransactions.toLocaleString("en-MV")} note="Completed" />
        <MetricCard label="CASH EXPECTED" value={formatMvr(session.metrics.expectedCashLaari)} note={`Opened with ${formatMvr(session.openingCashLaari)}`} />
        <MetricCard label="CASH VARIANCE" value={session.metrics.varianceLaari === null ? "—" : formatMvr(session.metrics.varianceLaari)} note={session.metrics.varianceLaari === null ? "Closes with shift" : "Closing vs expected"} accent={session.metrics.varianceLaari !== null && session.metrics.varianceLaari !== 0} />
      </section>

      <Surface className="overflow-hidden">
        <header className="flex items-end justify-between gap-4 border-b border-border px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold">Transactions &amp; bills</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">Every transaction recorded during this register session.</p>
          </div>
          <span className="text-[11px] text-muted-foreground">{session.transactions.length} total</span>
        </header>
        <SessionTransactions transactions={session.transactions} registerName={session.register.name} registerCode={session.register.code} />
      </Surface>
    </PageContainer>
  );
}
