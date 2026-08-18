import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, Store } from "lucide-react";

import { MetricCard, PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { authorizedRegisterIds, requireCapability } from "@/lib/authorization";
import { getSessionRegisters } from "@/lib/pos/register-sessions";

export const metadata: Metadata = {
  title: "Register sessions · Kanjo",
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

export default async function RegisterSessionsPage() {
  const authorization = await requireCapability("REGISTER_SESSIONS_VIEW", "REGISTER_SESSIONS_PAGE");
  const data = await getSessionRegisters(authorizedRegisterIds(authorization));

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Registers / Sessions"
        title="Register sessions"
        description="Choose a register to review every shift and the transactions recorded during it."
      />

      <section className="grid gap-3.5 sm:grid-cols-3">
        <MetricCard label="CURRENT REGISTERS" value={String(data.metrics.registers)} note="Active" />
        <MetricCard label="OPEN SESSIONS" value={String(data.metrics.openSessions)} note="Live now" accent />
        <MetricCard label="ALL SESSIONS" value={data.metrics.totalSessions.toLocaleString("en-MV")} note="Recorded shifts" dark />
      </section>

      <Surface className="overflow-hidden">
        <header className="flex items-end justify-between gap-4 border-b border-border px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-sm font-semibold">Current registers</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">Open a register to see its session history.</p>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">{data.registers.length} registers</span>
        </header>

        {data.registers.length ? (
          <div className="grid gap-px bg-border md:grid-cols-2">
            {data.registers.map((register) => {
              const latest = register.shifts[0];
              const isOpen = latest?.status === "OPEN";
              return (
                <Link
                  key={register.id}
                  href={`/registers/sessions/${register.id}`}
                  prefetch={false}
                  className="group flex min-h-40 flex-col justify-between gap-6 bg-card p-5 transition-colors hover:bg-accent sm:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                      <Store className="size-[18px]" aria-hidden="true" />
                    </span>
                    <span className={`flex items-center gap-1.5 text-[10px] font-medium ${isOpen ? "text-chart-1" : "text-muted-foreground"}`}>
                      <span className={`size-1.5 rounded-full ${isOpen ? "bg-chart-1" : "border border-muted-foreground"}`} />
                      {isOpen ? "OPEN SESSION" : "NO OPEN SESSION"}
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="font-mono text-[10px] text-muted-foreground">{register.code}</p>
                      <h3 className="mt-1 text-[15px] font-semibold">{register.name}</h3>
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Clock3 className="size-3" aria-hidden="true" />
                        {latest ? `Last opened ${formatDateTime(latest.openedAt)} by ${latest.openedBy.name}` : "No sessions recorded yet"}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2 text-[11px] font-semibold">
                      {register._count.shifts} {register._count.shifts === 1 ? "session" : "sessions"}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-64 items-center justify-center px-5 text-center text-xs text-muted-foreground">
            No current registers are available.
          </div>
        )}
      </Surface>
    </PageContainer>
  );
}
