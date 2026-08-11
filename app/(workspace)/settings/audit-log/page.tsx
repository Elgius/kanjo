import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePageAccess } from "@/lib/authorization";
import { getAuditFilterOptions, getAuditLogPage, type AuditLogFilters } from "@/lib/audit-log";
import { PAGE_DEFINITIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function auditHref(filters: AuditLogFilters, direction: "after" | "before", cursor: string) {
  const params = new URLSearchParams();
  for (const key of ["from", "to", "actor", "outcome", "event", "area", "targetType", "q"] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  params.set(direction, cursor);
  return `/settings/audit-log?${params.toString()}`;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-MV", { timeZone: "Indian/Maldives", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date);
}

const fieldClass = "h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

export default async function AuditLogPage({ searchParams }: PageProps<"/settings/audit-log">) {
  await requirePageAccess("AUDIT_LOG");
  const params = await searchParams;
  const filters: AuditLogFilters = {
    from: single(params.from), to: single(params.to), actor: single(params.actor),
    outcome: single(params.outcome), event: single(params.event), area: single(params.area),
    targetType: single(params.targetType), q: single(params.q), after: single(params.after),
    before: single(params.before),
  };
  const [data, options] = await Promise.all([getAuditLogPage(filters), getAuditFilterOptions()]);

  return (
    <PageContainer className="gap-[22px]">
      <PageHeader eyebrow="Settings / Audit log" title="Audit log" description="Successful changes, failures, denied operations, and authentication activity. Records are append-only." />

      <form className="grid gap-2.5 lg:grid-cols-4 xl:grid-cols-8" aria-label="Audit log filters">
        <label className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 lg:col-span-2"><Search className="size-3.5 text-muted-foreground" /><span className="sr-only">Search audit log</span><input name="q" type="search" defaultValue={filters.q} placeholder="Search details" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
        <input aria-label="From date" title="From date" name="from" type="date" defaultValue={filters.from} className={fieldClass} />
        <input aria-label="To date" title="To date" name="to" type="date" defaultValue={filters.to} className={fieldClass} />
        <select aria-label="Actor" name="actor" defaultValue={filters.actor ?? ""} className={fieldClass}><option value="">All actors</option>{options.actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.username ? `@${actor.username}` : actor.email}</option>)}</select>
        <select aria-label="Outcome" name="outcome" defaultValue={filters.outcome ?? ""} className={fieldClass}><option value="">All outcomes</option><option value="SUCCESS">Success</option><option value="FAILURE">Failure</option><option value="DENIED">Denied</option></select>
        <select aria-label="Event" name="event" defaultValue={filters.event ?? ""} className={fieldClass}><option value="">All events</option>{options.events.map((event) => <option key={event} value={event}>{event.replaceAll("_", " ")}</option>)}</select>
        <select aria-label="Area" name="area" defaultValue={filters.area ?? ""} className={fieldClass}><option value="">All areas</option>{PAGE_DEFINITIONS.map((page) => <option key={page.key} value={page.key}>{page.label}</option>)}</select>
        <select aria-label="Target type" name="targetType" defaultValue={filters.targetType ?? ""} className={fieldClass}><option value="">All targets</option>{options.targetTypes.map((target) => <option key={target} value={target}>{target}</option>)}</select>
        <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Apply filters</button>
        <Link prefetch={false} href="/settings/audit-log" className="flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-xs font-semibold hover:bg-accent">Clear</Link>
      </form>

      <Surface className="overflow-hidden px-5">
        <header className="flex items-end justify-between border-b border-border py-5"><div><h2 className="text-sm font-semibold">Recorded events</h2><p className="mt-1 text-[11px] text-muted-foreground">Up to 50 events per page, newest first.</p></div><span className="text-[11px] text-muted-foreground">{data.rows.length} shown</span></header>
        {data.rows.length ? (
          <Table className="min-w-[1150px] text-left text-xs">
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="h-11 w-[175px] p-0 text-[10px] font-normal text-muted-foreground">DATE &amp; TIME</TableHead><TableHead className="h-11 w-[105px] p-0 text-[10px] font-normal text-muted-foreground">OUTCOME</TableHead><TableHead className="h-11 w-[180px] p-0 text-[10px] font-normal text-muted-foreground">EVENT</TableHead><TableHead className="h-11 w-[180px] p-0 text-[10px] font-normal text-muted-foreground">ACTOR</TableHead><TableHead className="h-11 w-[180px] p-0 text-[10px] font-normal text-muted-foreground">TARGET</TableHead><TableHead className="h-11 p-0 text-[10px] font-normal text-muted-foreground">DETAILS</TableHead></TableRow></TableHeader>
            <TableBody>{data.rows.map((entry) => <TableRow key={entry.id} className="h-[64px] align-top hover:bg-accent/40"><TableCell className="p-0 pt-4 text-[11px]">{formatDateTime(entry.occurredAt)}</TableCell><TableCell className="p-0 pt-4"><span className={cn("rounded-full px-2 py-1 text-[9px] font-semibold", entry.outcome === "SUCCESS" && "bg-emerald-100 text-emerald-800", entry.outcome === "FAILURE" && "bg-amber-100 text-amber-800", entry.outcome === "DENIED" && "bg-destructive/10 text-destructive")}>{entry.outcome}</span></TableCell><TableCell className="p-0 pt-4"><span className="font-mono text-[10px]">{entry.event}</span>{entry.page ? <span className="mt-1 block text-[9px] text-muted-foreground">{entry.page.replaceAll("_", " ")}</span> : null}</TableCell><TableCell className="p-0 pt-4"><span className="block truncate">{entry.actorLabel || "Unknown"}</span>{entry.ipAddress ? <span className="mt-1 block font-mono text-[9px] text-muted-foreground">{entry.ipAddress}</span> : null}</TableCell><TableCell className="p-0 pt-4"><span>{entry.targetType || "—"}</span>{entry.targetId ? <span className="mt-1 block max-w-[170px] truncate font-mono text-[9px] text-muted-foreground">{entry.targetId}</span> : null}</TableCell><TableCell className="p-0 pt-4"><span className="block">{entry.summary}</span>{entry.metadata ? <details className="mt-1"><summary className="cursor-pointer text-[9px] text-muted-foreground">Metadata</summary><pre className="mt-1 max-w-[360px] overflow-auto whitespace-pre-wrap rounded bg-accent p-2 text-[9px]">{JSON.stringify(entry.metadata, null, 2)}</pre></details> : null}</TableCell></TableRow>)}</TableBody>
          </Table>
        ) : <div className="flex min-h-56 flex-col items-center justify-center gap-1 text-center"><h2 className="text-sm font-semibold">No audit events found</h2><p className="text-xs text-muted-foreground">Change or clear the filters to see more activity.</p></div>}
        <footer className="flex min-h-16 items-center justify-between border-t border-border py-3 text-[11px] text-muted-foreground"><span>Audit records are retained; archiving is handled separately.</span><nav aria-label="Audit pagination" className="flex gap-2">{data.previousCursor ? <Link prefetch={false} href={auditHref(filters, "before", data.previousCursor)} className="flex h-9 items-center gap-1 rounded-lg border border-border px-3"><ChevronLeft className="size-3" />Previous</Link> : null}{data.nextCursor ? <Link prefetch={false} href={auditHref(filters, "after", data.nextCursor)} className="flex h-9 items-center gap-1 rounded-lg border border-border px-3">Next<ChevronRight className="size-3" /></Link> : null}</nav></footer>
      </Surface>
    </PageContainer>
  );
}
