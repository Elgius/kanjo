"use client";

import { useState } from "react";

import { createMenuItemAction, updateMenuItemAction } from "./actions";

const fieldClass = "h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

type IngredientOption = { id: string; name: string; servingLabel: string; availabilityLabel: string; blocked: boolean };
type ExistingItem = { id: string; name: string; category: string; retailPrice: string; ingredients: Array<{ productId: string; servingMultiplier: number }> };

export function MenuItemForm({ registerId, products, item }: { registerId: string; products: IngredientOption[]; item?: ExistingItem }) {
  const [rows, setRows] = useState(item?.ingredients.length ? item.ingredients : [{ productId: "", servingMultiplier: 1 }]);
  const action = item ? updateMenuItemAction.bind(null, item.id, registerId) : createMenuItemAction.bind(null, registerId);
  return (
    <form action={action} className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
      <label className="grid gap-1.5 text-xs">Name<input name="name" defaultValue={item?.name} className={fieldClass} required /></label>
      <label className="grid gap-1.5 text-xs">Category<input name="category" defaultValue={item?.category} className={fieldClass} required /></label>
      <label className="grid gap-1.5 text-xs sm:col-span-2">Selling price (MVR)<input name="retailPrice" defaultValue={item?.retailPrice ?? "0.00"} inputMode="decimal" className={fieldClass} required /></label>
      <fieldset className="grid gap-2 sm:col-span-2">
        <legend className="mb-2 text-xs font-semibold">Recipe ingredients</legend>
        {rows.map((row, index) => (
          <div key={index} className="grid gap-2 rounded-lg bg-accent p-3 sm:grid-cols-[1fr_110px_auto]">
            <select name="ingredientProductId" value={row.productId} onChange={(event) => setRows((current) => current.map((value, rowIndex) => rowIndex === index ? { ...value, productId: event.target.value } : value))} className={fieldClass} required>
              <option value="" disabled>Select ingredient</option>
              {products.map((product) => <option key={product.id} value={product.id} disabled={product.blocked}>{product.name} · {product.servingLabel} · {product.availabilityLabel}{product.blocked ? " · expiry missing" : ""}</option>)}
            </select>
            <input aria-label="Serving multiplier" name="servingMultiplier" type="number" min="1" step="1" value={row.servingMultiplier} onChange={(event) => setRows((current) => current.map((value, rowIndex) => rowIndex === index ? { ...value, servingMultiplier: Number(event.target.value) } : value))} className={fieldClass} required />
            <button type="button" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} disabled={rows.length === 1} className="h-10 rounded-lg border border-border px-3 text-xs disabled:opacity-40">Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => setRows((current) => [...current, { productId: "", servingMultiplier: 1 }])} className="h-9 justify-self-start rounded-lg border border-border px-3 text-xs">Add ingredient</button>
      </fieldset>
      <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground sm:col-start-2">{item ? "Save changes" : "Create menu item"}</button>
    </form>
  );
}
