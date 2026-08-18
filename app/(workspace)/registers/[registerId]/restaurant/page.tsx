import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Armchair, ArrowLeft, ArrowRight, Clock3, ReceiptText, Users } from "lucide-react";

import { MetricCard, PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { can, canAccessRegister, requireCapability } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { formatMvr } from "@/lib/pos/money";
import { cn } from "@/lib/utils";
import { createRestaurantTableAction, updateRestaurantTableAction } from "./actions";

export const metadata: Metadata = {
  title: "Restaurant floor · Kanjo",
};

const fieldClass = "h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function heldFor(value: Date) {
  const minutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default async function RestaurantFloorPage({
  params,
  searchParams,
}: {
  params: Promise<{ registerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authorization = await requireCapability("RESTAURANT_FLOOR_VIEW", "RESTAURANT_FLOOR_PAGE");
  const { registerId } = await params;
  if (!canAccessRegister(authorization, registerId)) notFound();
  const query = await searchParams;
  const register = await prisma.cashRegister.findFirst({
    where: { id: registerId, active: true, purpose: "RESTAURANT" },
    select: {
      id: true,
      code: true,
      name: true,
      shifts: {
        where: { status: "OPEN" },
        take: 1,
        select: { id: true },
      },
      restaurantTables: {
        where: { active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          seats: true,
          orders: {
            where: { status: "HELD" },
            take: 1,
            orderBy: { heldAt: "desc" },
            select: {
              id: true,
              totalLaari: true,
              customerNote: true,
              heldAt: true,
              _count: { select: { items: true } },
            },
          },
        },
      },
    },
  });
  if (!register) notFound();

  const occupied = register.restaurantTables.filter((table) => table.orders.length > 0);
  const totalSeats = register.restaurantTables.reduce((total, table) => total + table.seats, 0);
  const occupiedSeats = occupied.reduce((total, table) => total + table.seats, 0);
  const success = single(query.success);
  const error = single(query.error);

  return (
    <PageContainer>
      {can(authorization, "REGISTERS_VIEW") ? <Link href={`/registers/${register.id}`} prefetch={false} className="flex w-fit items-center gap-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to register
      </Link> : null}

      <PageHeader
        eyebrow={`Restaurant / ${register.code}`}
        title={`${register.name} floor`}
        description="Set up tables, track occupancy, and open the bill assigned to each table."
        actions={can(authorization, "RESTAURANT_MENU_VIEW") ?
          <Link prefetch={false} href={`/registers/${register.id}/menu`} className="flex h-10 items-center rounded-lg border border-border bg-card px-4 text-xs font-semibold">
            Manage menu
          </Link>
        : null}
      />

      {success || error ? (
        <p role={error ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-xs", error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-chart-1/30 bg-chart-1/10")}>
          {error ?? success}
        </p>
      ) : null}

      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="TABLES" value={String(register.restaurantTables.length)} note="Configured" />
        <MetricCard label="OCCUPIED" value={`${occupied.length} of ${register.restaurantTables.length}`} note="Open bills" accent={occupied.length > 0} />
        <MetricCard label="AVAILABLE" value={String(register.restaurantTables.length - occupied.length)} note="Ready now" />
        <MetricCard label="SEATS IN USE" value={`${occupiedSeats} of ${totalSeats}`} note="By table capacity" dark />
      </section>

      {can(authorization, "RESTAURANT_TABLE_CREATE") ? (
        <Surface className="p-4 sm:p-5">
          <form action={createRestaurantTableAction.bind(null, register.id)} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end">
            <label className="grid gap-1.5 text-[10px] tracking-[0.08em] text-muted-foreground">TABLE NAME<input name="name" required maxLength={60} placeholder="Table 1" className={fieldClass} /></label>
            <label className="grid gap-1.5 text-[10px] tracking-[0.08em] text-muted-foreground">SEATS<input name="seats" type="number" min="1" max="100" defaultValue="4" required className={fieldClass} /></label>
            <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Add table</button>
          </form>
        </Surface>
      ) : null}

      <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {register.restaurantTables.map((table) => {
          const order = table.orders[0];
          return (
            <Surface key={table.id} className={cn("flex min-h-56 flex-col justify-between gap-5 p-5", order && "border-chart-1/50")}>
              <div className="flex items-start justify-between gap-4">
                <span className={cn("flex size-11 items-center justify-center rounded-xl", order ? "bg-chart-1 text-white" : "bg-secondary")}>
                  <Armchair className="size-5" aria-hidden="true" />
                </span>
                <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-semibold", order ? "bg-chart-1/10 text-chart-1" : "bg-secondary text-muted-foreground")}>
                  <span className={cn("size-1.5 rounded-full", order ? "bg-chart-1" : "border border-muted-foreground")} />
                  {order ? "OCCUPIED" : "AVAILABLE"}
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <div><h2 className="text-base font-semibold">{table.name}</h2><p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Users className="size-3" aria-hidden="true" />{table.seats} {table.seats === 1 ? "seat" : "seats"}</p></div>
                  {order ? <p className="font-mono text-lg font-semibold">{formatMvr(order.totalLaari)}</p> : null}
                </div>
                {order && can(authorization, "REGISTERS_VIEW") ? (
                  <div className="mt-4 grid gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                    <p className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5"><ReceiptText className="size-3" aria-hidden="true" />Current bill</span><span>{order._count.items} {order._count.items === 1 ? "line" : "lines"}</span></p>
                    <p className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5"><Clock3 className="size-3" aria-hidden="true" />Held for</span><span>{heldFor(order.heldAt)}</span></p>
                    {order.customerNote ? <p className="line-clamp-2 rounded-lg bg-accent px-2.5 py-2">{order.customerNote}</p> : null}
                  </div>
                ) : <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">Ready for a new bill.</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                {can(authorization, "RESTAURANT_TABLE_UPDATE") ? (
                  <details className="relative">
                    <summary className="cursor-pointer list-none text-[11px] font-semibold text-muted-foreground">Edit table</summary>
                    <form action={updateRestaurantTableAction.bind(null, table.id, register.id)} className="absolute bottom-7 left-0 z-10 grid w-64 gap-2 rounded-xl border border-border bg-card p-3 shadow-xl">
                      <label className="grid gap-1 text-[9px] text-muted-foreground">NAME<input name="name" defaultValue={table.name} required maxLength={60} className={fieldClass} /></label>
                      <label className="grid gap-1 text-[9px] text-muted-foreground">SEATS<input name="seats" type="number" min="1" max="100" defaultValue={table.seats} required className={fieldClass} /></label>
                      <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground">Save table</button>
                    </form>
                  </details>
                ) : <span />}
                {order ? (
                  <Link href={`/registers/${register.id}?order=${order.id}`} prefetch={false} className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground">
                    Open bill <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                ) : !order ? (
                  <span className="text-[10px] text-muted-foreground">{register.shifts.length ? "Assign from the register" : "Open a shift to assign"}</span>
                ) : null}
              </div>
            </Surface>
          );
        })}

        {!register.restaurantTables.length ? (
          <Surface className="col-span-full flex min-h-64 flex-col items-center justify-center gap-2 p-6 text-center">
            <Armchair className="size-7 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">No tables configured</h2>
            <p className="max-w-sm text-xs leading-5 text-muted-foreground">Add the first table and its seat count to start tracking the restaurant floor.</p>
          </Surface>
        ) : null}
      </section>
    </PageContainer>
  );
}
