import { PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { requireCapability } from "@/lib/authorization";
import { getSettingsAccounts, getSettingsRegisterOptions, getSettingsRoleOptions } from "@/lib/settings-queries";
import { cn } from "@/lib/utils";
import { assignRoleAction, createAccountAction } from "./actions";
import { AccountAccessEditor } from "./account-access-editor";
import { TeamAccountActions } from "./team-account-actions";

const fieldClass = "h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";
function single(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const authorization = await requireCapability("SETTINGS_VIEW", "SETTINGS_PAGE");
  const params = await searchParams;
  const [accounts, roles, registers] = await Promise.all([getSettingsAccounts(), getSettingsRoleOptions(), getSettingsRegisterOptions()]);
  const success = single(params.success);
  const error = single(params.error);
  const isSiteAdmin = authorization.user.isSiteAdmin;

  return (
    <PageContainer className="gap-6">
      <PageHeader eyebrow="Settings / Team" title="People & access" description="Choose what each person can do, then assign the registers where they work." />
      {(success || error) && <p role={error ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-xs", error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-chart-1/30 bg-chart-1/10")}>{error ?? success}</p>}

      {isSiteAdmin && <Surface className="p-5">
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Create account<span className="ml-3 text-[11px] font-normal text-muted-foreground">Add a teammate and set their access</span></summary>
          <form action={createAccountAction} className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="grid content-start gap-4">
              <div><h2 className="font-serif text-2xl font-semibold">Welcome someone new.</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Create their sign-in, choose a role, and assign their registers. Site administrator access is managed separately.</p></div>
              <label className="grid gap-1.5 text-xs font-semibold">Username<input name="username" autoComplete="off" minLength={3} maxLength={30} required className={fieldClass} placeholder="aisha.cashier" /></label>
              <label className="grid gap-1.5 text-xs font-semibold">Initial password<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className={fieldClass} /></label>
              {!roles.length && <p className="text-xs text-destructive">Create a role in Roles & permissions before adding an account.</p>}
            </div>
            <AccountAccessEditor roles={roles} registers={registers} submitLabel="Create account" />
          </form>
        </details>
      </Surface>}

      <Surface className="overflow-hidden px-5">
        <header className="flex items-end justify-between gap-3 border-b border-border py-5"><div><h2 className="text-sm font-semibold">Team accounts</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Roles define actions. Register assignments belong to each person.</p></div><span className="shrink-0 text-[11px] text-muted-foreground">{accounts.length} accounts</span></header>
        <div className="divide-y divide-border">
          {accounts.map((account) => {
            const label = account.username ?? account.email;
            const assignments = account.registerAccess.filter(({ register }) => register.active).map(({ register }) => register.name);
            return <article key={account.id} className="py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">{label.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-all text-sm font-semibold">{account.username ? `@${account.username}` : account.email}</h3>{account.id === authorization.user.id && <span className="text-[10px] text-chart-1">YOU</span>}{account.isSiteAdmin && <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground">SITE ADMIN</span>}</div><p className="mt-1 text-xs text-muted-foreground">{account.role.name}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{account.isSiteAdmin || account.registerScopeMode === "ALL" ? "All registers" : assignments.length ? assignments.join(" · ") : "No active registers assigned"}</p></div></div>
                {isSiteAdmin && <TeamAccountActions account={{ id: account.id, username: account.username, email: account.email, isSiteAdmin: account.isSiteAdmin }} currentUserId={authorization.user.id} />}
              </div>
              {isSiteAdmin && <details className="mt-4 rounded-xl border border-border">
                <summary className="cursor-pointer px-4 py-3 text-xs font-semibold">Edit role & register access</summary>
                <form action={assignRoleAction.bind(null, account.id)} className="border-t border-border p-4">
                  <AccountAccessEditor key={`${account.roleId}:${account.registerScopeMode}:${account.registerAccess.map(({ registerId }) => registerId).sort().join(",")}`} roles={roles} registers={registers} initialRoleId={account.roleId} initialScopeMode={account.registerScopeMode} initialRegisterIds={account.registerAccess.map(({ registerId }) => registerId)} isSiteAdmin={account.isSiteAdmin} />
                </form>
              </details>}
            </article>;
          })}
          {!accounts.length && <p className="py-10 text-center text-xs text-muted-foreground">No team accounts yet.</p>}
        </div>
      </Surface>
      <p className="text-xs leading-5 text-muted-foreground">{isSiteAdmin ? "Access changes take effect on the next request. Updating a person’s registers does not change their teammates’ assignments." : "Account and role changes are reserved for site administrators."}</p>
    </PageContainer>
  );
}
