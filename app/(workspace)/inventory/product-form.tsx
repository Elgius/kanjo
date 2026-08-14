"use client";

import { useRef, useState } from "react";

import { createCategoryAction, createProductAction, deleteCategoryAction, deleteProductAction, updateCategoryAction, updateProductAction } from "./actions";

const fieldClass =
  "h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

type RegisterOption = {
  id: string;
  code: string;
  name: string;
  purpose: "SHOP" | "RESTAURANT";
};

export type CategoryOption = {
  id: string;
  name: string;
  productCount: number;
};

export type EditableProduct = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: string;
  description: string | null;
  retailPriceLaari: number;
  costPriceLaari: number;
  lowStockThreshold: number;
  kind: "GOODS" | "CONSUMABLE";
  registerName: string;
};

export function NewProductMenu({ registers, categories }: { registers: RegisterOption[]; categories: CategoryOption[] }) {
  const [kind, setKind] = useState<"GOODS" | "CONSUMABLE">("GOODS");
  const [registerId, setRegisterId] = useState("");
  const [openingStock, setOpeningStock] = useState(0);
  const restaurant = registers.find((register) => register.id === registerId)?.purpose === "RESTAURANT";

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
          <select className={fieldClass} name="registerId" value={registerId} onChange={(event) => setRegisterId(event.target.value)} required>
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
        <label className="grid gap-1.5 text-xs">SKU<span className={`${fieldClass} flex items-center text-muted-foreground`}>Generated automatically when saved</span></label>
        <label className="grid gap-1.5 text-xs">Barcode<input className={fieldClass} name="barcode" /></label>
        <label className="grid gap-1.5 text-xs">Category<select className={fieldClass} name="categoryId" defaultValue="" required><option value="" disabled>Select a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="grid gap-1.5 text-xs">Retail price (MVR)<input className={fieldClass} name="retailPrice" inputMode="decimal" defaultValue="0.00" required /></label>
        <label className="grid gap-1.5 text-xs">Cost price (MVR)<input className={fieldClass} name="costPrice" inputMode="decimal" defaultValue="0.00" required /></label>
        <label className="grid gap-1.5 text-xs">Opening stock<input className={fieldClass} name="stockQuantity" type="number" min="0" value={openingStock} onChange={(event) => setOpeningStock(Number(event.target.value))} required /></label>
        {restaurant ? <label className="grid gap-1.5 text-xs">Opening batch expiry<input className={fieldClass} name="expiryDate" type="date" required={openingStock > 0} /><span className="text-[10px] text-muted-foreground">Required when restaurant opening stock is above zero.</span></label> : null}
        <label className="grid gap-1.5 text-xs">Low-stock threshold<input className={fieldClass} name="lowStockThreshold" type="number" min="0" defaultValue="10" required /></label>
        <label className="grid gap-1.5 text-xs sm:col-span-2">Description<textarea className="min-h-20 rounded-lg border border-border bg-card p-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15" name="description" /></label>

        {!registers.length || !categories.length ? (
          <p role="alert" className="text-xs text-destructive sm:col-span-2">
            {!registers.length ? "Add an active register before creating inventory items." : "Add a category before creating inventory items."}
          </p>
        ) : null}
        <button
          className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:col-start-2"
          type="submit"
          disabled={!registers.length || !categories.length}
        >
          Save item
        </button>
      </form>
    </details>
  );
}

export function CategoryManager({ categories }: { categories: CategoryOption[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryOption | null>(null);

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} className="h-10 rounded-lg border border-border bg-card px-4 text-xs font-semibold">Categories</button>
      <dialog ref={dialogRef} className="m-auto w-[min(620px,calc(100%-32px))] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/35">
        <div className="grid gap-5 p-6">
          <div><p className="text-xs text-muted-foreground">Inventory setup</p><h2 className="font-serif text-2xl font-semibold">Product categories</h2><p className="mt-1 text-xs text-muted-foreground">Create the categories available when registering or editing an item.</p></div>
          <form action={createCategoryAction} className="flex gap-2"><label className="sr-only" htmlFor="new-category-name">New category name</label><input id="new-category-name" name="name" placeholder="New category" className={`${fieldClass} min-w-0 flex-1`} required /><button className="rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Add</button></form>
          <div className="grid max-h-[360px] gap-2 overflow-y-auto">
            {categories.map((category) => <form key={category.id} action={updateCategoryAction.bind(null, category.id)} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><label className="grid gap-1 text-[10px] text-muted-foreground">CATEGORY<input name="name" defaultValue={category.name} className={fieldClass} required /></label><span className="text-[10px] text-muted-foreground">{category.productCount} item{category.productCount === 1 ? "" : "s"}</span><div className="flex gap-2"><button className="h-9 rounded-lg border border-border px-3 text-[11px] font-semibold">Save</button><button type="button" onClick={() => { setDeleteTarget(category); confirmRef.current?.showModal(); }} className="h-9 rounded-lg border border-destructive/30 px-3 text-[11px] font-semibold text-destructive">Delete</button></div></form>)}
            {!categories.length ? <p className="py-8 text-center text-xs text-muted-foreground">No categories yet.</p> : null}
          </div>
          <div className="flex justify-end"><button type="button" onClick={() => dialogRef.current?.close()} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold">Done</button></div>
        </div>
      </dialog>
      <dialog ref={confirmRef} className="m-auto w-[min(420px,calc(100%-32px))] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/35">
        <div className="grid gap-5 p-6"><div><p className="text-xs text-destructive">Are you sure?</p><h2 className="font-serif text-2xl font-semibold">Delete {deleteTarget?.name}?</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">The category can only be deleted when no inventory items use it.</p></div><div className="flex justify-end gap-2"><button type="button" onClick={() => confirmRef.current?.close()} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold">Cancel</button>{deleteTarget ? <form action={deleteCategoryAction.bind(null, deleteTarget.id)}><button className="h-10 rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground">Yes, delete</button></form> : null}</div></div>
      </dialog>
    </>
  );
}

export function InventoryItemActions({ product, categories }: { product: EditableProduct; categories: CategoryOption[] }) {
  const editorRef = useRef<HTMLDialogElement>(null);
  const saveConfirmRef = useRef<HTMLDialogElement>(null);
  const deleteConfirmRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button type="button" onClick={() => editorRef.current?.showModal()} className="h-9 rounded-md border border-border px-3 text-[11px] font-semibold hover:bg-accent">Edit</button>
      <dialog ref={editorRef} className="m-auto w-[min(660px,calc(100%-32px))] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/35">
        <form ref={formRef} action={updateProductAction.bind(null, product.id)} className="grid gap-4 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">{product.registerName} · {product.sku}</p><h2 className="font-serif text-2xl font-semibold">Edit inventory item</h2><p className="mt-1 text-xs text-muted-foreground">SKU, item type, and register stay fixed so stock history remains consistent.</p></div>
          <label className="grid gap-1.5 text-xs">Name<input name="name" defaultValue={product.name} className={fieldClass} required /></label>
          <label className="grid gap-1.5 text-xs">Category<select name="categoryId" defaultValue={product.categoryId} className={fieldClass} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs">Barcode<input name="barcode" defaultValue={product.barcode ?? ""} className={fieldClass} /></label>
          <label className="grid gap-1.5 text-xs">Low-stock threshold<input name="lowStockThreshold" type="number" min="0" defaultValue={product.lowStockThreshold} className={fieldClass} required /></label>
          <label className="grid gap-1.5 text-xs">Retail price (MVR)<input name="retailPrice" inputMode="decimal" defaultValue={(product.retailPriceLaari / 100).toFixed(2)} className={fieldClass} required /></label>
          <label className="grid gap-1.5 text-xs">Cost price (MVR)<input name="costPrice" inputMode="decimal" defaultValue={(product.costPriceLaari / 100).toFixed(2)} className={fieldClass} required /></label>
          <label className="grid gap-1.5 text-xs sm:col-span-2">Description<textarea name="description" defaultValue={product.description ?? ""} className="min-h-20 rounded-lg border border-border bg-card p-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15" /></label>
          <div className="flex flex-wrap justify-between gap-2 sm:col-span-2"><button type="button" onClick={() => deleteConfirmRef.current?.showModal()} className="h-10 rounded-lg border border-destructive/30 px-4 text-xs font-semibold text-destructive">Delete item</button><div className="flex gap-2"><button type="button" onClick={() => editorRef.current?.close()} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold">Cancel</button><button type="button" onClick={() => saveConfirmRef.current?.showModal()} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Save changes</button></div></div>
        </form>
      </dialog>
      <dialog ref={saveConfirmRef} className="m-auto w-[min(420px,calc(100%-32px))] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/35"><div className="grid gap-5 p-6"><div><p className="text-xs text-chart-1">Are you sure?</p><h2 className="font-serif text-2xl font-semibold">Save these changes?</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Pricing and product details will update everywhere this item is shown.</p></div><div className="flex justify-end gap-2"><button type="button" onClick={() => saveConfirmRef.current?.close()} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold">Cancel</button><button type="button" onClick={() => formRef.current?.requestSubmit()} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Yes, save</button></div></div></dialog>
      <dialog ref={deleteConfirmRef} className="m-auto w-[min(420px,calc(100%-32px))] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/35"><div className="grid gap-5 p-6"><div><p className="text-xs text-destructive">Are you sure?</p><h2 className="font-serif text-2xl font-semibold">Delete {product.name}?</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">The item will be removed from inventory and registers. Its past sales and stock history remain available.</p></div><div className="flex justify-end gap-2"><button type="button" onClick={() => deleteConfirmRef.current?.close()} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold">Cancel</button><form action={deleteProductAction.bind(null, product.id)}><button className="h-10 rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground">Yes, delete</button></form></div></div></dialog>
    </>
  );
}
