import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer, Surface } from "@/components/pos/primitives";
import { authorizedRegisterIds, can, canAccessRegister, requireCapability } from "@/lib/authorization";
import { formatMvr } from "@/lib/pos/money";
import { getRegisterManagementData } from "@/lib/pos/queries";
import { cn } from "@/lib/utils";
import { openShiftAction } from "../actions";
import { RegisterHeaderActions } from "./register-header-actions";
import { ReceiptPrintDialog } from "./receipt-print-dialog";
import { RegisterSaleWorkspace } from "./register-sale-workspace";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function elapsed(openedAt: Date) {
  const minutes = Math.max(0, Math.floor((Date.now() - openedAt.getTime()) / 60_000));
  return `${Math.floor(minutes / 60)}H ${minutes % 60}M`;
}

function timeAgo(date: Date) {
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
}

export default async function RegisterManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ registerId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authorization = await requireCapability("REGISTERS_VIEW", "REGISTER_PAGE");
  const { registerId } = await params;
  if (!canAccessRegister(authorization, registerId)) notFound();
  const query = await searchParams;
  const data = await getRegisterManagementData(registerId, single(query.receipt), authorizedRegisterIds(authorization));
  if (!data) notFound();

  const { register, shift, lastSale } = data;
  const ownsShift = shift?.openedBy.id === authorization.user.id;
  const mayOperateShift = Boolean(ownsShift || can(authorization, "SHIFT_OVERRIDE"));
  const success = single(query.success);
  const error = single(query.error);
  const selectedHeldOrderId = single(query.order);
  const creditedBillId = single(query.credit);
  const cashExpectedLaari = shift
    ? shift.openingCashLaari + shift.cashSalesLaari
    : 0;

  return (
    <PageContainer className="gap-[22px] py-8 lg:py-[34px]">
      {data.receipt ? (
        <ReceiptPrintDialog
          registerId={register.id}
          registerName={register.name}
          registerCode={register.code}
          receipt={data.receipt}
        />
      ) : null}
      {success || error ? (
        <p
          role={error ? "alert" : "status"}
          className={cn(
            "rounded-lg border px-4 py-3 text-xs",
            error
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-chart-1/30 bg-chart-1/10",
          )}
        >
          {error ?? success}
        </p>
      ) : null}

      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-[5px]">
          <p className="text-xs leading-4 text-muted-foreground">
            <Link href="/registers" className="hover:text-foreground">Registers</Link>
            {" / "}{register.name}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-[36px] font-semibold leading-[42px] tracking-[-0.025em]">
              {register.name}
            </h1>
            <span className="flex items-center gap-[7px] rounded-full bg-accent px-2.5 py-1.5 text-[10px] font-semibold leading-3">
              <span
                className={cn(
                  "size-[7px] rounded-full",
                  shift ? "bg-chart-1" : "border border-muted-foreground",
                )}
              />
              {shift ? `OPEN · ${elapsed(shift.openedAt)}` : "CLOSED"}
            </span>
          </div>
          <p className="text-xs leading-4 text-muted-foreground">
            {register.purpose === "RESTAURANT" ? "Restaurant" : "Shop"} register
            {shift ? ` · Shift owner: ${shift.openedBy.name}` : " · No active shift"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {register.purpose === "RESTAURANT" && can(authorization, "RESTAURANT_FLOOR_VIEW") ? (
            <Link
              prefetch={false}
              href={`/registers/${register.id}/restaurant`}
              className="flex h-10 items-center rounded-lg border border-border bg-card px-4 text-xs font-semibold"
            >
              Restaurant
            </Link>
          ) : null}
          {shift ? (
            <RegisterHeaderActions
              registerId={register.id}
              shiftId={shift.id}
              expectedCashLaari={cashExpectedLaari}
              canEdit={mayOperateShift && can(authorization, "SHIFT_CLOSE")}
            />
          ) : null}
        </div>
      </header>

      {shift ? (
        <>
          <section className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["NET SALES", formatMvr(shift.salesLaari)],
              ["CASH EXPECTED", formatMvr(cashExpectedLaari)],
              ["TRANSACTIONS", String(shift.transactionCount)],
            ].map(([label, value]) => (
              <Surface key={label} className="flex min-h-[104px] flex-col justify-between p-[18px_20px]">
                <p className="text-[10px] leading-3 tracking-[0.08em] text-muted-foreground">{label}</p>
                <p className="font-mono text-2xl font-semibold leading-[30px]">{value}</p>
              </Surface>
            ))}
            <Surface className="flex min-h-[104px] flex-col justify-between border-primary bg-primary p-[18px_20px] text-primary-foreground">
              <p className="text-[10px] leading-3 tracking-[0.08em] text-muted">LAST SALE</p>
              <div className="flex items-end justify-between gap-3">
                <p className="font-mono text-2xl font-semibold leading-[30px]">
                  {lastSale ? formatMvr(lastSale.totalLaari) : "—"}
                </p>
                <p className="text-[10px] leading-[14px] text-chart-1">
                  {lastSale ? timeAgo(lastSale.createdAt) : "No sales yet"}
                </p>
              </div>
            </Surface>
          </section>

          <RegisterSaleWorkspace
            key={`${lastSale?.id ?? "empty"}:${creditedBillId ?? "no-credit"}:${data.heldOrders.map((order) => order.id).join(",")}`}
            registerId={register.id}
            registerName={register.name}
            registerCode={register.code}
            cashierName={authorization.user.name}
            shiftId={shift.id}
            items={data.items}
            isRestaurant={register.purpose === "RESTAURANT"}
            restaurantTables={data.restaurantTables}
            creditCustomers={data.creditCustomers}
            heldOrders={data.heldOrders.map((order) => ({
              ...order,
              heldAt: order.heldAt.toISOString(),
            }))}
            permissions={{
              sale: mayOperateShift && can(authorization, "SALE_RECORD"),
              hold: mayOperateShift && can(authorization, "ORDER_HOLD"),
              cancel: mayOperateShift && can(authorization, "ORDER_CANCEL"),
              credit: mayOperateShift && can(authorization, "CUSTOMER_CREDIT_ISSUE"),
            }}
            initialHeldOrderId={selectedHeldOrderId}
          />
        </>
      ) : (
        <Surface className="flex min-h-[480px] items-center justify-center p-6">
          <div className="flex max-w-sm flex-col items-center gap-5 text-center">
            <div className="flex flex-col gap-2">
              <h2 className="font-serif text-2xl font-semibold">Open a shift to begin</h2>
              <p className="text-xs leading-5 text-muted-foreground">
                Set the opening cash balance before recording sales or holding orders at this register.
              </p>
            </div>
            {can(authorization, "SHIFT_OPEN") ? (
              <form action={openShiftAction.bind(null, register.id)} className="flex items-end gap-2">
                <label className="grid gap-1.5 text-left text-[10px] tracking-[0.08em] text-muted-foreground">
                  OPENING CASH (MVR)
                  <input
                    name="openingCash"
                    inputMode="decimal"
                    defaultValue="0.00"
                    required
                    className="h-10 w-36 rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/15"
                  />
                </label>
                <button
                  type="submit"
                  className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground"
                >
                  Open shift
                </button>
              </form>
            ) : (
              <span className="rounded-lg bg-accent px-3 py-2 text-[10px] text-muted-foreground">
                VIEW ONLY
              </span>
            )}
          </div>
        </Surface>
      )}
    </PageContainer>
  );
}
