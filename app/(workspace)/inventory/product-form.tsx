"use client";

import { useState } from "react";

import { createProductAction } from "./actions";

const fieldClass =
  "h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

type RegisterOption = {
  id: string;
  code: string;
  name: string;
};

export function NewProductMenu({ registers }: { registers: RegisterOption[] }) {
  const [kind, setKind] = useState<"GOODS" | "CONSUMABLE">("GOODS");

  return (
    <details className="group relative">
      <summary className="flex h-10 cursor-pointer list-none items-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        Add item
      </summary>
      <form
        action={createProductAction}
        className="absolute right-0 z-20 mt-2 grid max-h-[calc(100vh-7rem)] w-[min(94vw,660px)] gap-3 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <h2 className="text-sm font-semibold">New inventory item</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Assign the item to the register that will hold and sell this stock.
          </p>
        </div>

        <label className="grid gap-1.5 text-xs sm:col-span-2">
          Register
          <select className={fieldClass} name="registerId" defaultValue="" required>
            <option value="" disabled>Select a register</option>
            {registers.map((register) => (
              <option key={register.id} value={register.id}>
                {register.name} · {register.code}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="grid gap-2 sm:col-span-2">
          <legend className="text-xs">Item type</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ["GOODS", "Goods", "Sold as complete units"],
              ["CONSUMABLE", "Consumable", "Portioned into servings"],
            ] as const).map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-xs transition-colors ${kind === value ? "border-primary bg-accent" : "border-border"}`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={value}
                  checked={kind === value}
                  onChange={() => setKind(value)}
                  className="mt-0.5 accent-primary"
                />
                <span className="grid gap-0.5">
                  <span className="font-semibold">{label}</span>
                  <span className="text-[10px] text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {kind === "CONSUMABLE" ? (
          <section className="grid gap-3 rounded-lg border border-chart-1/30 bg-chart-1/5 p-3 sm:col-span-2 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <h3 className="text-xs font-semibold">Serving information</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Describe the contents of one stock unit and the amount used per serving.
              </p>
            </div>
            <label className="grid gap-1.5 text-xs">
              Quantity metric
              <select className={fieldClass} name="quantityMetric" defaultValue="ml" required>
                <option value="ml">Millilitres (ml)</option>
                <option value="L">Litres (L)</option>
                <option value="g">Grams (g)</option>
                <option value="kg">Kilograms (kg)</option>
                <option value="unit">Units</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs">
              Quantity per item
              <input className={fieldClass} name="quantityValue" type="number" min="0.001" step="0.001" placeholder="1000" required />
            </label>
            <label className="grid gap-1.5 text-xs">
              Quantity per serving
              <input className={fieldClass} name="servingSize" type="number" min="0.001" step="0.001" placeholder="30" required />
            </label>
          </section>
        ) : null}

        <label className="grid gap-1.5 text-xs">Name<input className={fieldClass} name="name" required /></label>
        <label className="grid gap-1.5 text-xs">SKU<input className={fieldClass} name="sku" required /></label>
        <label className="grid gap-1.5 text-xs">Barcode<input className={fieldClass} name="barcode" /></label>
        <label className="grid gap-1.5 text-xs">Category<input className={fieldClass} name="category" required /></label>
        <label className="grid gap-1.5 text-xs">Retail price (MVR)<input className={fieldClass} name="retailPrice" inputMode="decimal" defaultValue="0.00" required /></label>
        <label className="grid gap-1.5 text-xs">Cost price (MVR)<input className={fieldClass} name="costPrice" inputMode="decimal" defaultValue="0.00" required /></label>
        <label className="grid gap-1.5 text-xs">Opening stock<input className={fieldClass} name="stockQuantity" type="number" min="0" defaultValue="0" required /></label>
        <label className="grid gap-1.5 text-xs">Low-stock threshold<input className={fieldClass} name="lowStockThreshold" type="number" min="0" defaultValue="10" required /></label>
        <label className="grid gap-1.5 text-xs sm:col-span-2">Description<textarea className="min-h-20 rounded-lg border border-border bg-card p-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15" name="description" /></label>

        {!registers.length ? (
          <p role="alert" className="text-xs text-destructive sm:col-span-2">
            Add an active register before creating inventory items.
          </p>
        ) : null}
        <button
          className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:col-start-2"
          type="submit"
          disabled={!registers.length}
        >
          Save item
        </button>
      </form>
    </details>
  );
}
