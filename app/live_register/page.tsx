import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { authorizedRegisterIds, can, requireCapability } from "@/lib/authorization";
import { getRegisterSummaries } from "@/lib/pos/queries";

export default async function LiveRegisterPage() {
  const authorization = await requireCapability("REGISTERS_VIEW", "LIVE_REGISTER_SELECTION");
  const registers = await getRegisterSummaries(authorizedRegisterIds(authorization));
  return <main className="mx-auto max-w-[1100px] px-5 py-12 sm:px-8 sm:py-16">
    <p className="mb-3 font-mono text-[10px] tracking-[0.12em] text-muted-foreground">YOUR WORKSPACE</p>
    <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Choose your register.</h1>
    <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">Hello, {authorization.user.name}. Select a register to start or continue your shift.</p>
    <div className="mb-5 mt-10 flex items-center justify-between border-b border-border pb-4"><h2 className="text-sm font-semibold">Your registers</h2><span className="text-[11px] text-muted-foreground">{registers.length} available {registers.length === 1 ? "register" : "registers"}</span></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {registers.map((register) => {
        const shift = register.shifts[0];
        const own = shift?.openedBy.id === authorization.user.id;
        const inUse = shift && !own && !can(authorization, "SHIFT_OVERRIDE");
        return <Link key={register.id} prefetch={false} href={`/live_register/${register.id}`} className="group flex min-h-72 flex-col rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          <div className="flex items-center justify-between"><span className="flex size-12 items-center justify-center rounded-xl bg-accent"><Store className="size-6 text-muted-foreground" strokeWidth={1.4} /></span><span className="rounded-full bg-accent px-2.5 py-1.5 text-[10px] font-semibold">{inUse ? "IN USE" : shift ? "SHIFT OPEN" : "SHIFT CLOSED"}</span></div>
          <p className="mb-1 mt-7 font-mono text-[10px] tracking-wider text-muted-foreground">{register.code}</p><h3 className="font-serif text-2xl font-semibold">{register.name}</h3>
          <p className="mt-2 text-xs text-muted-foreground">{register.purpose === "RESTAURANT" ? "Restaurant" : "Shop"} · {own ? "Your shift" : shift ? `Shift: ${shift.openedBy.name}` : "No active shift"}</p>
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs font-semibold"><span>{inUse ? "View availability" : shift ? "Continue to register" : can(authorization, "SHIFT_OPEN") ? "Go to register · Start shift" : "View register"}</span><ArrowRight className="size-4" /></div>
        </Link>;
      })}
    </div>
    {!registers.length && <div className="rounded-xl border border-dashed border-border p-10 text-center"><h2 className="font-serif text-2xl font-semibold">No registers assigned yet</h2><p className="mt-3 text-sm text-muted-foreground">Ask your manager to assign an active register to your account.</p></div>}
    <p className="mt-6 text-[11px] leading-5 text-muted-foreground">Only active registers you have access to appear here.</p>
  </main>;
}
