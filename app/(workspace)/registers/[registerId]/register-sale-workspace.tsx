"use client";

import { useMemo, useRef, useState } from "react";
import { Minus, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useFormStatus } from "react-dom";

import { formatMvr } from "@/lib/pos/money";
import { cn } from "@/lib/utils";
import { cancelHeldOrderAction, checkoutRegisterSaleAction, creditRegisterBillAction, holdRegisterOrderAction } from "./actions";

type SellableItem = {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  stockQuantity: number;
  retailPriceLaari: number;
  soldOutReason: string | null;
};

type HeldOrder = {
  id: string;
  customerNote: string | null;
  paymentMethod: "CASH" | "CARD" | "MOBILE" | null;
  restaurantTableId: string | null;
  restaurantTable: { name: string } | null;
  totalLaari: number;
  heldAt: string;
  items: Array<{ itemId: string; quantity: number }>;
};

type RestaurantTable = {
  id: string;
  name: string;
  seats: number;
  occupiedOrderId: string | null;
};

type CreditCustomer = {
  id: string;
  name: string;
  creditLimitLaari: number;
  outstandingLaari: number;
  availableCreditLaari: number;
};

type PaymentMethod = "CASH" | "CARD" | "MOBILE";

function SubmitButtons({
  permissions,
  totalLaari,
  physicalHoldAction,
  creditHoldAction,
  holdReady,
  creditCustomers,
  paymentMethod,
}: {
  permissions: { sale: boolean; hold: boolean; credit: boolean };
  totalLaari: number;
  physicalHoldAction: (formData: FormData) => void;
  creditHoldAction: (formData: FormData) => void;
  holdReady: boolean;
  creditCustomers: CreditCustomer[];
  paymentMethod: PaymentMethod;
}) {
  const { pending } = useFormStatus();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [customerId, setCustomerId] = useState("");
  const paymentLabel = paymentMethod === "MOBILE" ? "mobile pay" : paymentMethod.toLowerCase();
  const selectedCustomer = creditCustomers.find((customer) => customer.id === customerId);
  const creditReady = Boolean(selectedCustomer && selectedCustomer.availableCreditLaari >= totalLaari);

  return (
    <div className="grid h-[52px] grid-cols-[98px_minmax(0,1fr)] gap-2">
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        disabled={(!permissions.hold && !permissions.credit) || pending || totalLaari === 0}
        className="rounded-[9px] border border-border text-[11px] font-semibold disabled:opacity-45"
      >
        Hold
      </button>
      <button
        type="submit"
        disabled={!permissions.sale || pending || totalLaari === 0}
        className="flex items-center justify-between rounded-[9px] bg-chart-1 px-[17px] text-xs font-bold text-white disabled:opacity-45"
      >
        <span>{pending ? "Processing…" : `Charge ${paymentLabel}`}</span>
        <span className="font-mono text-[13px]">{formatMvr(totalLaari)} →</span>
      </button>

      <dialog ref={dialogRef} className="m-auto w-[min(520px,calc(100%-32px))] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/35">
        <div className="grid gap-4 p-5 sm:p-6">
          <header><p className="text-xs text-muted-foreground">Pause this bill</p><h2 className="mt-1 font-serif text-2xl font-semibold">How should it be held?</h2></header>
          <div className="grid gap-3 sm:grid-cols-2">
            {permissions.hold ? <section className="flex flex-col justify-between gap-5 rounded-xl border border-border p-4">
              <div><h3 className="text-sm font-semibold">Physical</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Keep the bill as a tab. Stock is deducted only when the customer returns and pays.</p></div>
              <button type="submit" formAction={physicalHoldAction} disabled={pending || !holdReady} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-45">Hold as tab</button>
              {!holdReady ? <p className="text-[10px] text-chart-1">Select a restaurant table first.</p> : null}
            </section> : null}
            {permissions.credit ? <section className="flex flex-col justify-between gap-4 rounded-xl border border-chart-1/40 bg-chart-1/5 p-4">
              <div><h3 className="text-sm font-semibold">Customer credit</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Deduct stock now and send the unpaid bill to a customer account.</p></div>
              {creditCustomers.length ? <label className="grid gap-1.5 text-[9px] text-muted-foreground">CUSTOMER<select name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-xs text-foreground"><option value="">Select customer</option>{creditCustomers.map((customer) => <option key={customer.id} value={customer.id} disabled={customer.availableCreditLaari < totalLaari}>{customer.name} · {formatMvr(customer.availableCreditLaari)} available{customer.availableCreditLaari < totalLaari ? " · Limit exceeded" : ""}</option>)}</select></label> : <Link href="/customers" className="flex h-10 items-center justify-center rounded-lg border border-border px-3 text-[11px] font-semibold">Create a customer first</Link>}
              <button type="submit" formAction={creditHoldAction} disabled={pending || !creditReady} className="h-10 rounded-lg bg-chart-1 px-4 text-xs font-semibold text-white disabled:opacity-45">Use customer credit</button>
            </section> : null}
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} className="h-9 justify-self-end rounded-lg border border-border px-3 text-[11px] font-semibold">Cancel</button>
        </div>
      </dialog>
    </div>
  );
}

export function RegisterSaleWorkspace({
  registerId,
  shiftId,
  items,
  isRestaurant,
  restaurantTables,
  creditCustomers,
  heldOrders,
  permissions,
  initialHeldOrderId,
}: {
  registerId: string;
  shiftId: string;
  items: SellableItem[];
  isRestaurant: boolean;
  restaurantTables: RestaurantTable[];
  creditCustomers: CreditCustomer[];
  heldOrders: HeldOrder[];
  permissions: { sale: boolean; hold: boolean; cancel: boolean; credit: boolean };
  initialHeldOrderId?: string;
}) {
  const canOperate = permissions.sale || permissions.hold || permissions.credit;
  const initialOrder = heldOrders.find((order) => order.id === initialHeldOrderId);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [heldOrderId, setHeldOrderId] = useState(initialOrder?.id ?? "");
  const [customerNote, setCustomerNote] = useState(initialOrder?.customerNote ?? "");
  const [restaurantTableId, setRestaurantTableId] = useState(
    initialOrder?.restaurantTableId ?? "",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initialOrder?.paymentMethod ?? "CASH",
  );
  const [cart, setCart] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialOrder?.items.map((item) => [item.itemId, item.quantity]) ?? []),
  );
  const activeHeldOrder = heldOrders.find((order) => order.id === heldOrderId);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return [...counts].sort(([left], [right]) => left.localeCompare(right));
  }, [items]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!normalizedQuery) return true;
      return [item.name, item.sku, item.category]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [category, items, query]);

  const cartLines = items.flatMap((item) => {
    const quantity = cart[item.id] ?? 0;
    return quantity > 0 ? [{ ...item, quantity }] : [];
  });
  const itemCount = cartLines.reduce((total, item) => total + item.quantity, 0);
  const totalLaari = cartLines.reduce(
    (total, item) => total + item.retailPriceLaari * item.quantity,
    0,
  );
  const serializedItems = JSON.stringify(
    cartLines.map((item) => ({ itemId: item.id, quantity: item.quantity })),
  );

  function setQuantity(item: SellableItem, quantity: number) {
    const nextQuantity = Math.max(0, Math.min(quantity, item.stockQuantity));
    setCart((current) => {
      const next = { ...current };
      if (nextQuantity) next[item.id] = nextQuantity;
      else delete next[item.id];
      return next;
    });
  }

  function loadHeldOrder(orderId: string) {
    setHeldOrderId(orderId);
    const order = heldOrders.find((candidate) => candidate.id === orderId);
    if (!order) {
      setCart({});
      setCustomerNote("");
      setRestaurantTableId("");
      setPaymentMethod("CASH");
      return;
    }
    setCart(Object.fromEntries(order.items.map((item) => [item.itemId, item.quantity])));
    setCustomerNote(order.customerNote ?? "");
    setRestaurantTableId(order.restaurantTableId ?? "");
    setPaymentMethod(order.paymentMethod ?? "CASH");
  }

  const checkoutAction = checkoutRegisterSaleAction.bind(null, shiftId, registerId);
  const holdAction = holdRegisterOrderAction.bind(null, shiftId, registerId);
  const creditHoldAction = creditRegisterBillAction.bind(null, shiftId, registerId);
  const cancelAction = cancelHeldOrderAction.bind(null, shiftId, registerId, heldOrderId);

  return (
    <div className="grid gap-3.5">
      {heldOrders.length ? (
        <nav aria-label="Physically held bills" className="flex max-w-full items-center gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2">
          <button type="button" onClick={() => loadHeldOrder("")} className={cn("h-9 shrink-0 rounded-lg px-3 text-[11px] font-semibold", !heldOrderId ? "bg-primary text-primary-foreground" : "border border-border")}>New bill</button>
          {heldOrders.map((order) => (
            <button key={order.id} type="button" onClick={() => loadHeldOrder(order.id)} className={cn("h-9 shrink-0 rounded-lg px-3 text-[11px] font-semibold", heldOrderId === order.id ? "bg-primary text-primary-foreground" : "border border-border")}>
              {order.restaurantTable?.name ? `${order.restaurantTable.name} · ` : "Tab · "}{formatMvr(order.totalLaari)}
            </button>
          ))}
        </nav>
      ) : null}
      <section className="grid min-h-[606px] gap-3.5 xl:grid-cols-[minmax(0,720px)_minmax(340px,394px)]">
      <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-[18px]">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-[3px]">
            <h2 className="text-base font-bold leading-5">New sale</h2>
            <p className="text-[11px] leading-[14px] text-muted-foreground">
              Add items to the current order
            </p>
          </div>
          <label className="flex h-10 w-full items-center gap-2.5 rounded-lg border border-border bg-background px-3 text-muted-foreground sm:w-[268px]">
            <Search className="size-[15px] shrink-0" aria-hidden="true" />
            <span className="sr-only">Search items</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search menu or scan item"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>

        <div className="flex min-h-8 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={cn(
              "h-8 rounded-full border px-[13px] text-[11px]",
              category === "all"
                ? "border-primary bg-primary font-semibold text-primary-foreground"
                : "border-border",
            )}
          >
            All items · {items.length}
          </button>
          {categories.map(([itemCategory, count]) => (
            <button
              type="button"
              key={itemCategory}
              onClick={() => setCategory(itemCategory)}
              className={cn(
                "h-8 rounded-full border px-[13px] text-[11px]",
                category === itemCategory
                  ? "border-primary bg-primary font-semibold text-primary-foreground"
                  : "border-border",
              )}
            >
              {itemCategory} · {count}
            </button>
          ))}
        </div>

        <div className="grid content-start gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:max-h-[444px] xl:overflow-y-auto">
          {visibleItems.map((item) => {
            const soldOut = item.stockQuantity < 1;
            const quantity = cart[item.id] ?? 0;
            return (
              <article
                key={item.id}
                className={cn(
                  "flex min-h-[134px] flex-col justify-between rounded-[10px] border border-border bg-background p-3.5",
                  soldOut && "bg-accent opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[9px] leading-3 tracking-[0.08em] text-muted-foreground">
                    {item.category.toUpperCase()}
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuantity(item, quantity + 1)}
                    disabled={!canOperate || soldOut || quantity >= item.stockQuantity}
                    aria-label={`Add ${item.name}`}
                    className="flex size-6 items-center justify-center rounded-[7px] bg-primary text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground"
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-[13px] font-bold leading-[17px]">{item.name}</h3>
                  <p className="line-clamp-2 text-[10px] leading-[13px] text-muted-foreground">
                    {soldOut ? item.soldOutReason ?? "Sold out" : `${item.stockQuantity} available`}
                  </p>
                </div>
                <p className="font-mono text-sm font-semibold leading-[18px]">
                  {formatMvr(item.retailPriceLaari)}
                </p>
              </article>
            );
          })}
          {!visibleItems.length ? (
            <p className="col-span-full py-16 text-center text-xs text-muted-foreground">
              No items match this search.
            </p>
          ) : null}
        </div>
      </div>

      <form
        action={checkoutAction}
        className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card"
      >
        <input type="hidden" name="items" value={serializedItems} />
        <input type="hidden" name="paymentMethod" value={paymentMethod} />
        <input type="hidden" name="heldOrderId" value={heldOrderId} />
        <input type="hidden" name="restaurantTableId" value={restaurantTableId} />

        <div className="flex min-h-[72px] items-center justify-between gap-3 border-b border-border px-[18px] py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold leading-[19px]">Current order</h2>
            <p className="mt-1 font-mono text-[10px] leading-[13px] text-muted-foreground">{activeHeldOrder ? `HELD TAB · ${activeHeldOrder.id.slice(0, 6).toUpperCase()}` : "NEW ORDER"}</p>
          </div>
          <div className="flex items-center gap-2">
            {heldOrderId && permissions.cancel ? (
              <button
                type="submit"
                formAction={cancelAction}
                onClick={(event) => {
                  if (!window.confirm("Cancel this held bill and release its table?")) {
                    event.preventDefault();
                  }
                }}
                className="h-[30px] rounded-[7px] border border-destructive/30 px-2.5 text-[10px] text-destructive"
              >
                Cancel bill
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => loadHeldOrder("")}
              className="h-[30px] rounded-[7px] border border-border px-2.5 text-[10px] text-muted-foreground"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex min-h-[246px] flex-1 flex-col overflow-y-auto px-[18px] pt-2">
          {cartLines.map((item) => (
            <div key={item.id} className="flex min-h-[78px] items-center border-b border-border">
              <div className="min-w-0 flex-1 pr-2">
                <h3 className="truncate text-xs font-bold leading-4">{item.name}</h3>
                <p className="mt-1 text-[10px] leading-[13px] text-muted-foreground">
                  {formatMvr(item.retailPriceLaari)} each
                </p>
              </div>
              <div className="flex h-7 w-[74px] shrink-0 items-center justify-between rounded-[7px] border border-border px-2">
                <button
                  type="button"
                  onClick={() => setQuantity(item, item.quantity - 1)}
                  aria-label={`Remove one ${item.name}`}
                  className="text-muted-foreground"
                >
                  <Minus className="size-3" aria-hidden="true" />
                </button>
                <span className="font-mono text-[11px]">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(item, item.quantity + 1)}
                  disabled={item.quantity >= item.stockQuantity}
                  aria-label={`Add one ${item.name}`}
                  className="disabled:text-muted-foreground"
                >
                  <Plus className="size-3" aria-hidden="true" />
                </button>
              </div>
              <p className="w-20 shrink-0 text-right font-mono text-xs font-semibold">
                {formatMvr(item.retailPriceLaari * item.quantity)}
              </p>
            </div>
          ))}
          {!cartLines.length ? (
            <div className="flex flex-1 items-center justify-center py-12 text-center">
              <p className="max-w-48 text-xs leading-5 text-muted-foreground">
                Select an item to begin this order.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex min-h-[104px] flex-col justify-center gap-[9px] border-y border-border px-[18px]">
          <div className="flex justify-between text-[11px] leading-[14px] text-muted-foreground">
            <span>Subtotal · {itemCount} items</span>
            <span className="font-mono">{formatMvr(totalLaari)}</span>
          </div>
          <div className="flex justify-between text-[11px] leading-[14px] text-muted-foreground">
            <span>Tax</span>
            <span>Included</span>
          </div>
          <div className="flex items-end justify-between pt-[3px]">
            <span className="text-[13px] font-bold leading-[17px]">Total</span>
            <span className="font-mono text-[22px] font-bold leading-[27px]">
              {formatMvr(totalLaari)}
            </span>
          </div>
        </div>

        <div className="flex min-h-[184px] flex-col gap-3 px-[18px] pb-[18px] pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] leading-3 tracking-[0.08em] text-muted-foreground">
              PAYMENT METHOD
            </p>
            <label className="min-w-0 flex-1 text-right">
              <span className="sr-only">Customer note</span>
              <input
                name="customerNote"
                value={customerNote}
                onChange={(event) => setCustomerNote(event.target.value)}
                maxLength={500}
                placeholder="Customer note +"
                className="w-full bg-transparent text-right text-[10px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>
          <div className="grid h-[38px] grid-cols-3 gap-[7px]">
            {(["CASH", "CARD", "MOBILE"] as const).map((method) => (
              <button
                type="button"
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={cn(
                  "rounded-lg border text-[11px]",
                  paymentMethod === method
                    ? "border-primary bg-primary font-semibold text-primary-foreground"
                    : "border-border",
                )}
              >
                {method === "MOBILE" ? "Mobile pay" : method[0] + method.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          {isRestaurant ? (
            restaurantTables.length ? (
              <label className="grid gap-1.5 text-[10px] tracking-[0.08em] text-muted-foreground">
                TABLE FOR HELD BILL
                <select
                  value={restaurantTableId}
                  onChange={(event) => setRestaurantTableId(event.target.value)}
                  className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none"
                >
                  <option value="">Select a table</option>
                  {restaurantTables.map((table) => {
                    const occupiedByAnother = Boolean(
                      table.occupiedOrderId && table.occupiedOrderId !== heldOrderId,
                    );
                    return (
                      <option key={table.id} value={table.id} disabled={occupiedByAnother}>
                        {table.name} · {table.seats} {table.seats === 1 ? "seat" : "seats"}{occupiedByAnother ? " · Occupied" : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : (
              <Link href={`/registers/${registerId}/restaurant`} className="flex h-10 items-center justify-center rounded-lg border border-chart-1/40 bg-chart-1/10 px-3 text-[11px] font-semibold text-chart-1">
                Set up restaurant tables before holding a bill
              </Link>
            )
          ) : null}
          <SubmitButtons
            permissions={permissions}
            totalLaari={totalLaari}
            physicalHoldAction={holdAction}
            creditHoldAction={creditHoldAction}
            holdReady={!isRestaurant || Boolean(restaurantTableId)}
            creditCustomers={creditCustomers}
            paymentMethod={paymentMethod}
          />
          {!canOperate ? (
            <p className="text-center text-[10px] text-muted-foreground">VIEW ONLY</p>
          ) : null}
        </div>
      </form>
      </section>
    </div>
  );
}
