import { PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "../actions";
import { CapabilityEditor } from "./capability-editor";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const fieldClass = "h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

export default async function RolesPage({ searchParams }: PageProps<"/settings/roles">) {
  const authorization = await requireCapability("SETTINGS_VIEW", "ROLES_PAGE");
  if (!authorization.user.isSiteAdmin) notFound();
  const params = await searchParams;
  const [roles, registers] = await Promise.all([
    prisma.role.findMany({
      orderBy: { name: "asc" },
      include: {
        capabilities: true,
        registerAccess: true,
        _count: { select: { users: true } },
      },
    }),
    prisma.cashRegister.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, code: true, active: true },
    }),
  ]);
  const success = single(params.success);
  const error = single(params.error);
  const isSiteAdmin = authorization.user.isSiteAdmin;

  return (
    <PageContainer className="gap-[22px]">
      <PageHeader eyebrow="Settings / Roles" title="Roles" description="Assign exact business capabilities and the registers where each role may use them." />
      {success || error ? <p role={error ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-xs", error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-chart-1/30 bg-chart-1/10")}>{error ?? success}</p> : null}

      {isSiteAdmin ? (
        <Surface className="p-5">
          <form action={createRoleAction} className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-2"><div><h2 className="font-serif text-2xl font-semibold">New role</h2><p className="mt-1 text-[10px] text-muted-foreground">Presets are a starting point and remain fully editable.</p></div><div className="grid gap-3"><label className="grid gap-1.5 text-xs font-semibold">Name<input name="name" required minLength={2} maxLength={60} className={fieldClass} /></label><label className="grid gap-1.5 text-xs font-semibold">Description<textarea name="description" maxLength={500} rows={3} className="rounded-lg border border-border bg-card p-3 text-xs outline-none" /></label></div></div>
            <CapabilityEditor registers={registers} />
            <button type="submit" className="h-10 w-fit rounded-lg bg-primary px-5 text-xs font-semibold text-primary-foreground">Create role</button>
          </form>
        </Surface>
      ) : null}

      <section className="grid gap-3.5">
        {roles.map((role) => (
          <Surface key={role.id} className="p-5">
            {isSiteAdmin ? (
              <form action={updateRoleAction.bind(null, role.id)} className="grid gap-5">
                <div className="grid gap-3 md:grid-cols-2"><div><h2 className="font-serif text-2xl font-semibold">{role.name}</h2><p className="mt-1 text-[10px] text-muted-foreground">{role._count.users} assigned · {role.capabilities.length} capabilities</p></div><div className="grid gap-3"><label className="grid gap-1.5 text-xs font-semibold">Name<input name="name" required minLength={2} maxLength={60} defaultValue={role.name} className={fieldClass} /></label><label className="grid gap-1.5 text-xs font-semibold">Description<textarea name="description" maxLength={500} rows={3} defaultValue={role.description ?? ""} className="rounded-lg border border-border bg-card p-3 text-xs outline-none" /></label></div></div>
                <CapabilityEditor registers={registers} initialCapabilities={role.capabilities.map(({ capability }) => capability)} initialScopeMode={role.registerScopeMode} initialRegisterIds={role.registerAccess.map(({ registerId }) => registerId)} />
                <button type="submit" className="h-10 w-fit rounded-lg bg-primary px-5 text-xs font-semibold text-primary-foreground">Save role</button>
              </form>
            ) : (
              <div><h2 className="text-sm font-semibold">{role.name}</h2><p className="mt-1 text-xs text-muted-foreground">{role.description || "No description"} · {role._count.users} assigned · {role.registerScopeMode === "ALL" ? "All registers" : `${role.registerAccess.length} selected registers`}</p><div className="mt-4 flex flex-wrap gap-2">{role.capabilities.map(({ capability }) => <span key={capability} className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold">{capability.replaceAll("_", " ")}</span>)}</div></div>
            )}
            {isSiteAdmin ? <form action={deleteRoleAction.bind(null, role.id)} className="mt-4 flex justify-end border-t border-border pt-4"><button type="submit" disabled={role._count.users > 0} className="h-9 rounded-lg border border-destructive/30 px-3 text-[11px] font-semibold text-destructive disabled:cursor-not-allowed disabled:opacity-40">Delete role</button></form> : null}
          </Surface>
        ))}
      </section>
    </PageContainer>
  );
}
