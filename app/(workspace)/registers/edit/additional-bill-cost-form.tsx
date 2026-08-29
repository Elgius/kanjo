"use client";

import { useState } from "react";

import { createAdditionalBillCostAction } from "./actions";

const fieldClass = "h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

export function AdditionalBillCostForm({
  registers,
}: {
  registers: ReadonlyArray<{ id: string; name: string; code: string }>;
}) {
  const [type, setType] = useState<"PERCENTAGE" | "FLAT_RATE">("PERCENTAGE");

  return (
    <form action={createAdditionalBillCostAction} className="grid gap-3 border-t border-border px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_180px_auto] lg:items-end">
      <label className="grid gap-1.5 text-[10px] text-muted-foreground">
        REGISTER
        <select name="registerId" required className={fieldClass}>
          {registers.map((register) => (
            <option key={register.id} value={register.id}>{register.name} · {register.code}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-[10px] text-muted-foreground">
        COST NAME
        <input name="name" required minLength={2} maxLength={80} placeholder="GST or Plastic bag" className={fieldClass} />
      </label>
      <label className="grid gap-1.5 text-[10px] text-muted-foreground">
        CALCULATION
        <select
          name="type"
          value={type}
          onChange={(event) => setType(event.target.value === "FLAT_RATE" ? "FLAT_RATE" : "PERCENTAGE")}
          className={fieldClass}
        >
          <option value="PERCENTAGE">Percentage</option>
          <option value="FLAT_RATE">Flat rate</option>
        </select>
      </label>
      {type === "PERCENTAGE" ? (
        <label className="grid gap-1.5 text-[10px] text-muted-foreground">
          PERCENTAGE
          <span className="flex h-10 items-center rounded-lg border border-border bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15">
            <input name="percentage" required type="number" inputMode="decimal" min="0.01" max="100" step="0.01" placeholder="6" className="min-w-0 flex-1 bg-transparent px-3 text-xs outline-none" />
            <span className="pr-3 text-xs">%</span>
          </span>
        </label>
      ) : (
        <label className="grid gap-1.5 text-[10px] text-muted-foreground">
          FLAT RATE
          <span className="flex h-10 items-center rounded-lg border border-border bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/15">
            <span className="pl-3 text-xs">MVR</span>
            <input name="flatAmount" required type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="10.00" className="min-w-0 flex-1 bg-transparent px-2 text-xs outline-none" />
          </span>
        </label>
      )}
      <button type="submit" disabled={!registers.length} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">
        Add cost
      </button>
    </form>
  );
}
