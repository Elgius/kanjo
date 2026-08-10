import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { canAccess, requirePageAccess } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { formatMvr } from "@/lib/pos/money";
import { formatQuantity, maldivesDate, measuredPerServing, quantityNumber } from "@/lib/pos/inventory";
import { cn } from "@/lib/utils";
import { toggleMenuItemAction } from "./actions";
import { MenuItemForm } from "./menu-form";

function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function RestaurantMenuPage({ params, searchParams }: PageProps<"/registers/[registerId]/menu">) {
  const authorization = await requirePageAccess("REGISTERS");
  const canEdit = canAccess(authorization, "REGISTERS", "EDIT");
  const { registerId } = await params;
  const register = await prisma.cashRegister.findFirst({
    where: { id: registerId, active: true, purpose: "RESTAURANT" },
    include: {
      products: { where: { active: true }, orderBy: { name: "asc" }, include: { batches: { where: { remainingQuantity: { gt: 0 } } } } },
      menuItems: {
        orderBy: [{ active: "desc" }, { name: "asc" }],
        include: {
          ingredients: {
            include: {
              product: { include: { batches: { where: { remainingQuantity: { gt: 0 } } } } },
            },
          },
        },
      },
    },
  });
  if (!register) notFound();
  const today = maldivesDate();
  const productOptions = register.products.map((product) => {
    const usable = product.batches.filter((batch) => batch.expiryDate && batch.expiryDate >= today).reduce((sum, batch) => sum + quantityNumber(batch.remainingQuantity), 0);
    const undated = product.batches.some((batch) => !batch.expiryDate && quantityNumber(batch.remainingQuantity) > 0);
    return { id: product.id, name: product.name, servingLabel: formatQuantity(product, measuredPerServing(product)), availabilityLabel: `${formatQuantity(product, usable)} usable`, blocked: undated };
  });
  const query = await searchParams;
  const success = single(query.success); const error = single(query.error);
  return <PageContainer>
    <PageHeader eyebrow="Restaurant register" title={`${register.name} menu`} description="Build menu items from inventory servings. Sales consume the earliest-expiring ingredient batches first." actions={<Link href={`/registers?register=${register.id}`} className="flex h-10 items-center rounded-lg border border-border bg-card px-4 text-xs font-semibold">Back to register</Link>} />
    {success || error ? <p role={error ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-xs", error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-chart-1/30 bg-chart-1/10")}>{error ?? success}</p> : null}
    {canEdit ? <details className="rounded-xl border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">Add menu item</summary><div className="mt-4"><MenuItemForm registerId={register.id} products={productOptions} /></div></details> : null}
    <div className="grid gap-4">
      {register.menuItems.length ? register.menuItems.map((item) => <Surface key={item.id} className={cn("grid gap-4 p-5", !item.active && "opacity-60")}>
        <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.category} · {item.active ? "Active" : "Archived"}</p><h2 className="mt-1 text-lg font-semibold">{item.name}</h2><p className="mt-1 font-mono text-sm">{formatMvr(item.retailPriceLaari)}</p></div>{canEdit ? <form action={toggleMenuItemAction.bind(null, item.id, register.id, !item.active)}><button className="h-9 rounded-lg border border-border px-3 text-xs">{item.active ? "Archive" : "Activate"}</button></form> : null}</header>
        <div className="flex flex-wrap gap-2">{item.ingredients.map((ingredient) => <span key={ingredient.productId} className="rounded-full bg-accent px-3 py-1.5 text-[11px]">{ingredient.product.name} · {ingredient.servingMultiplier} × {formatQuantity(ingredient.product, measuredPerServing(ingredient.product))}</span>)}</div>
        {canEdit ? <details><summary className="cursor-pointer text-xs font-semibold">Edit item and recipe</summary><div className="mt-3"><MenuItemForm registerId={register.id} products={productOptions} item={{ id: item.id, name: item.name, category: item.category, retailPrice: (item.retailPriceLaari / 100).toFixed(2), ingredients: item.ingredients.map((ingredient) => ({ productId: ingredient.productId, servingMultiplier: ingredient.servingMultiplier })) }} /></div></details> : null}
      </Surface>) : <Surface className="p-10 text-center text-xs text-muted-foreground">No menu items yet. Add the first recipe to begin restaurant sales.</Surface>}
    </div>
  </PageContainer>;
}
