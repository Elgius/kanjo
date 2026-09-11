import { PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/authorization";
import { getSettingsRoles } from "@/lib/settings-queries";
import { WORKSPACES } from "@/lib/access-settings";
import { cn } from "@/lib/utils";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "../actions";
import { SettingsSubmit } from "../account-access-editor";
import { CapabilityEditor } from "./capability-editor";

function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
const fieldClass = "h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";
function RoleFields({ name = "", description = "" }: { name?: string; description?: string | null }) {
  return <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-semibold">Role name<input name="name" required minLength={2} maxLength={60} defaultValue={name} placeholder="e.g. Cashier" className={fieldClass} /></label><label className="grid gap-1.5 text-xs font-semibold">Description <span className="sr-only">(optional)</span><input name="description" maxLength={500} defaultValue={description ?? ""} placeholder="What does this team member do?" className={fieldClass} /></label></div>;
}

export default async function RolesPage({ searchParams }: PageProps<"/settings/roles">) {
  const authorization = await requireCapability("SETTINGS_VIEW", "ROLES_PAGE");
  if (!authorization.user.isSiteAdmin) notFound();
  const params = await searchParams;
  const roles = await getSettingsRoles();
  const success = single(params.success);
  const error = single(params.error);

  return (
    <PageContainer className="gap-6">
      <PageHeader eyebrow="Settings / Roles" title="Roles & permissions" description="Define the job once. Assign each person’s registers in Team accounts." />
      {(success || error) && <p role={error ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-xs", error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-chart-1/30 bg-chart-1/10")}>{error ?? success}</p>}
      <Surface className="p-5">
        <details open={!roles.length}>
          <summary className="cursor-pointer text-sm font-semibold">Create role<span className="ml-3 text-[11px] font-normal text-muted-foreground">Start with a job preset</span></summary>
          <form action={createRoleAction} className="mt-5 grid gap-6"><RoleFields /><CapabilityEditor /><SettingsSubmit>Create role</SettingsSubmit></form>
        </details>
      </Surface>
      <section className="grid gap-4" aria-label="Existing roles">
        {roles.map((role) => <Surface key={`${role.id}:${role.updatedAt.toISOString()}`} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-2xl font-semibold">{role.name}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{role.description || "A custom set of allowed actions."}</p></div><span className="rounded-full bg-accent px-3 py-1.5 text-[10px] font-semibold">{WORKSPACES.find(({ key }) => key === role.workspace)?.label ?? "Custom"}</span></div>
          <p className="mt-3 text-[11px] text-muted-foreground">{role._count.users} accounts · {role.effectiveCapabilities.length} allowed actions</p>
          <details className="mt-4 border-t border-border pt-4">
            <summary className="cursor-pointer text-xs font-semibold">Edit permissions</summary>
            <form action={updateRoleAction.bind(null, role.id)} className="mt-5 grid gap-6"><RoleFields name={role.name} description={role.description} /><CapabilityEditor initialCapabilities={role.effectiveCapabilities} initialWorkspace={role.workspace} /><p className="text-xs leading-5 text-muted-foreground">Saving updates actions for all {role._count.users} assigned accounts. Their register assignments stay the same.</p><SettingsSubmit>Save role</SettingsSubmit></form>
          </details>
          <form action={deleteRoleAction.bind(null, role.id)} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-[11px] text-muted-foreground">{role._count.users ? "Reassign these accounts before deleting this role." : "This role has no assigned accounts."}</p><button type="submit" disabled={role._count.users > 0} className="h-9 rounded-lg border border-destructive/30 px-3 text-[11px] font-semibold text-destructive disabled:cursor-not-allowed disabled:opacity-40">Delete role</button></form>
        </Surface>)}
      </section>
    </PageContainer>
  );
}
