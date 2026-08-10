import { PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { requirePageAccess } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { PAGE_DEFINITIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "../actions";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const fieldClass = "h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

function PermissionRows({ values, prefix }: { values?: Record<string, string>; prefix: string }) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {PAGE_DEFINITIONS.map((page) => {
        const current = values?.[page.key] ?? "NONE";
        const choices = page.editable ? ["NONE", "VIEW", "EDIT"] : ["NONE", "VIEW"];
        return (
          <fieldset key={page.key} className="grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <legend className="sr-only">{page.label} permission</legend>
            <span><span className="block text-xs font-semibold">{page.label}</span><span className="text-[10px] text-muted-foreground">{page.editable ? "Page access and mutations" : "Page access"}</span></span>
            <span className="flex flex-wrap gap-2">
              {choices.map((choice) => (
                <label key={choice} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[10px] font-semibold">
                  <input type="radio" name={`permission_${page.key}`} value={choice} defaultChecked={current === choice} className="accent-primary" />
                  {choice[0] + choice.slice(1).toLowerCase()}
                </label>
              ))}
            </span>
          </fieldset>
        );
      })}
      <input type="hidden" name="permissionForm" value={prefix} />
    </div>
  );
}

export default async function RolesPage({ searchParams }: PageProps<"/settings/roles">) {
  const authorization = await requirePageAccess("SETTINGS");
  const params = await searchParams;
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: { permissions: true, _count: { select: { users: true } } },
  });
  const success = single(params.success);
  const error = single(params.error);
  const isSiteAdmin = authorization.user.isSiteAdmin;

  return (
    <PageContainer className="gap-[22px]">
      <PageHeader eyebrow="Settings / Roles" title="Roles" description="Create roles first, then assign exactly one role to each account." />
      {success || error ? <p role={error ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-xs", error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-chart-1/30 bg-chart-1/10")}>{error ?? success}</p> : null}

      {isSiteAdmin ? (
        <Surface className="p-5">
          <form action={createRoleAction} className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_auto] xl:items-start">
            <div className="grid gap-3"><h2 className="font-serif text-2xl font-semibold">New role</h2><label className="grid gap-1.5 text-xs font-semibold">Name<input name="name" required minLength={2} maxLength={60} className={fieldClass} /></label><label className="grid gap-1.5 text-xs font-semibold">Description<textarea name="description" maxLength={500} rows={3} className="rounded-lg border border-border bg-card p-3 text-xs outline-none" /></label></div>
            <PermissionRows prefix="new" />
            <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Create role</button>
          </form>
        </Surface>
      ) : null}

      <section className="grid gap-3.5">
        {roles.map((role) => {
          const values = Object.fromEntries(role.permissions.map((permission) => [permission.page, permission.level]));
          return (
            <Surface key={role.id} className="p-5">
              {isSiteAdmin ? (
                <form action={updateRoleAction.bind(null, role.id)} className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_auto] xl:items-start">
                  <div className="grid gap-3"><div><span className="text-[10px] text-muted-foreground">{role._count.users} assigned</span></div><label className="grid gap-1.5 text-xs font-semibold">Name<input name="name" required minLength={2} maxLength={60} defaultValue={role.name} className={fieldClass} /></label><label className="grid gap-1.5 text-xs font-semibold">Description<textarea name="description" maxLength={500} rows={3} defaultValue={role.description ?? ""} className="rounded-lg border border-border bg-card p-3 text-xs outline-none" /></label></div>
                  <PermissionRows values={values} prefix={role.id} />
                  <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Save role</button>
                </form>
              ) : (
                <div><h2 className="text-sm font-semibold">{role.name}</h2><p className="mt-1 text-xs text-muted-foreground">{role.description || "No description"} · {role._count.users} assigned</p><div className="mt-4 flex flex-wrap gap-2">{role.permissions.filter((permission) => permission.level !== "NONE").map((permission) => <span key={permission.page} className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold">{permission.page.replaceAll("_", " ")} · {permission.level}</span>)}</div></div>
              )}
              {isSiteAdmin ? (
                <form action={deleteRoleAction.bind(null, role.id)} className="mt-4 flex justify-end border-t border-border pt-4">
                  <button type="submit" disabled={role._count.users > 0} className="h-9 rounded-lg border border-destructive/30 px-3 text-[11px] font-semibold text-destructive disabled:cursor-not-allowed disabled:opacity-40">Delete role</button>
                </form>
              ) : null}
            </Surface>
          );
        })}
      </section>
    </PageContainer>
  );
}
