import Link from "next/link";
import { ExternalLink, Store, Trash2 } from "lucide-react";

import { PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { authorizedRegisterIds, can, requireCapability } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  changeRegisterTypeAction,
  deleteRegisterAction,
  renameRegisterAction,
  setRegisterActiveAction,
} from "./actions";

const fieldClass = "h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60";

const dependencyCount = {
  shifts: true,
  products: true,
  menuItems: true,
  restaurantTables: true,
  customerCreditBills: true,
  stockMovements: true,
  batches: true,
} as const;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EditRegistersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authorization = await requireCapability("REGISTER_ADMIN_VIEW", "REGISTER_ADMIN_PAGE");
  const allowedRegisterIds = authorizedRegisterIds(authorization);
  const query = await searchParams;
  const success = single(query.success);
  const error = single(query.error);
  const registers = await prisma.cashRegister.findMany({
    where: allowedRegisterIds ? { id: { in: allowedRegisterIds } } : undefined,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      purpose: true,
      active: true,
      updatedAt: true,
      shifts: { where: { status: "OPEN" }, take: 1, select: { id: true } },
      _count: { select: dependencyCount },
    },
  });

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Registers / Edit"
        title="Manage registers"
        description="Rename registers, manage their type and availability, or delete registers that were never used."
        actions={<Link href="/registers" prefetch={false} className="flex h-10 items-center rounded-lg border border-border bg-card px-4 text-xs font-semibold">Register selection</Link>}
      />

      {success || error ? <p role={error ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-xs", error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-chart-1/30 bg-chart-1/10")}>{error ?? success}</p> : null}

      <Surface className="overflow-hidden">
        <header className="flex flex-col justify-between gap-2 border-b border-border px-5 py-5 sm:flex-row sm:items-end sm:px-6">
          <div><h2 className="text-sm font-semibold">Created registers</h2><p className="mt-1 text-[11px] text-muted-foreground">Codes stay fixed so historical reporting remains consistent.</p></div>
          <span className="text-[11px] text-muted-foreground">{registers.length} total</span>
        </header>

        {registers.length ? <div className="divide-y divide-border">{registers.map((register) => {
          const hasOpenShift = register.shifts.length > 0;
          const usageCount = Object.values(register._count).reduce((total, count) => total + count, 0);
          const canChangePurpose = usageCount === 0;
          const canDelete = usageCount === 0;
          return (
            <article key={register.id} className="grid gap-5 px-5 py-6 sm:px-6">
              <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary"><Store className="size-4" aria-hidden="true" /></span>
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold">{register.name}</h3><span className={cn("rounded-full px-2 py-1 text-[9px] font-semibold", register.active ? "bg-chart-1/10 text-chart-1" : "bg-muted text-muted-foreground")}>{register.active ? "ACTIVE" : "ARCHIVED"}</span>{hasOpenShift ? <span className="rounded-full bg-primary px-2 py-1 text-[9px] font-semibold text-primary-foreground">OPEN SHIFT</span> : null}</div><p className="mt-1 font-mono text-[10px] text-muted-foreground">{register.code} · {register.purpose === "RESTAURANT" ? "Restaurant" : "Shop"}</p></div>
                </div>
                {register.active && can(authorization, "REGISTERS_VIEW") ? <Link href={`/registers/${register.id}`} prefetch={false} className="flex h-9 w-fit items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-semibold">Open register<ExternalLink className="size-3.5" aria-hidden="true" /></Link> : null}
              </header>

              <div className="grid gap-2 text-[10px] text-muted-foreground sm:grid-cols-4">
                <span>{register._count.shifts} shifts</span><span>{register._count.products} products</span><span>{register._count.menuItems} menu items</span><span>{register._count.restaurantTables} tables</span>
              </div>

              <div className="grid gap-3 rounded-xl bg-accent p-4 sm:grid-cols-3 sm:items-end">
              {can(authorization, "REGISTER_RENAME") ? <form action={renameRegisterAction.bind(null, register.id)} className="grid gap-2">
                <label className="grid gap-1.5 text-[10px] text-muted-foreground">REGISTER NAME<input name="name" required maxLength={100} defaultValue={register.name} className={fieldClass} /></label>
                <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Save name</button>
              </form> : <p className="rounded-lg bg-background px-3 py-3 text-xs text-muted-foreground">No rename permission.</p>}
              {can(authorization, "REGISTER_TYPE_CHANGE") ? <form action={changeRegisterTypeAction.bind(null, register.id)} className="grid gap-2">
                <label className="grid gap-1.5 text-[10px] text-muted-foreground">TYPE<select name="purpose" defaultValue={register.purpose} disabled={!canChangePurpose} className={fieldClass}><option value="SHOP">Shop</option><option value="RESTAURANT">Restaurant</option></select>{!canChangePurpose ? <input type="hidden" name="purpose" value={register.purpose} /> : null}</label>
                <button type="submit" disabled={!canChangePurpose} className="h-10 rounded-lg border border-border bg-background px-4 text-xs font-semibold disabled:opacity-50">Save type</button>
              </form> : <p className="rounded-lg bg-background px-3 py-3 text-xs text-muted-foreground">No type-change permission.</p>}
              {can(authorization, "REGISTER_ARCHIVE") ? <form action={setRegisterActiveAction.bind(null, register.id)} className="grid gap-2">
                <label className="grid gap-1.5 text-[10px] text-muted-foreground">STATUS<select name="status" defaultValue={register.active ? "ACTIVE" : "ARCHIVED"} disabled={hasOpenShift} className={fieldClass}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select>{hasOpenShift ? <input type="hidden" name="status" value="ACTIVE" /> : null}</label>
                <button type="submit" disabled={hasOpenShift} className="h-10 rounded-lg border border-border bg-background px-4 text-xs font-semibold disabled:opacity-50">Save status</button>
              </form> : <p className="rounded-lg bg-background px-3 py-3 text-xs text-muted-foreground">No archive permission.</p>}
              </div>

              {can(authorization, "REGISTER_DELETE") ? <details className="rounded-lg border border-destructive/25 p-4">
                <summary className="cursor-pointer text-xs font-semibold text-destructive">Delete register</summary>
                {canDelete ? <form action={deleteRegisterAction.bind(null, register.id)} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-1.5 text-[10px] text-muted-foreground">ENTER “{register.name}” TO CONFIRM<input name="confirmationName" required autoComplete="off" className={fieldClass} /></label><button type="submit" className="flex h-10 items-center justify-center gap-2 rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground"><Trash2 className="size-3.5" aria-hidden="true" />Delete permanently</button></form> : <p className="mt-3 text-[11px] leading-5 text-muted-foreground">This register has operational data and cannot be deleted. Archive it to remove it from active register selection while preserving its history.</p>}
              </details> : null}
            </article>
          );
        })}</div> : <div className="flex min-h-56 items-center justify-center px-5 text-center text-xs text-muted-foreground">No registers have been created.</div>}
      </Surface>
    </PageContainer>
  );
}
