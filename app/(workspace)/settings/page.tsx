import { PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { canAccess, requirePageAccess } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  assignRoleAction,
  createAccountAction,
  setSiteAdminAction,
} from "./actions";

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

const fieldClass =
  "h-10 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/15";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const authorization = await requirePageAccess("SETTINGS");
  const params = await searchParams;
  const [accounts, roles] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ username: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        isSiteAdmin: true,
        createdAt: true,
        roleId: true,
        role: { select: { name: true } },
      },
    }),
    prisma.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const success = single(params.success);
  const error = single(params.error);
  const isSiteAdmin = authorization.user.isSiteAdmin;

  return (
    <PageContainer className="gap-[22px]">
      <PageHeader
        eyebrow="Settings / Accounts"
        title="Accounts"
        description="Assign one role per account. Site administrators manage accounts and administrative access."
      />

      {success || error ? (
        <p role={error ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-xs", error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-chart-1/30 bg-chart-1/10")}>
          {error ?? success}
        </p>
      ) : null}

      <section className={cn("grid gap-3.5", isSiteAdmin && "xl:grid-cols-[380px_minmax(0,1fr)]")}>
        {isSiteAdmin ? (
          <Surface className="h-fit p-5">
            <h2 className="font-serif text-2xl font-semibold">Create account</h2>
            <p className="mt-1 text-xs text-muted-foreground">Create a username credential and attach an existing role.</p>
            <form action={createAccountAction} className="mt-5 grid gap-4">
              <label className="grid gap-1.5 text-xs font-semibold">Username<input name="username" autoComplete="off" minLength={3} maxLength={30} required className={fieldClass} placeholder="floor.manager" /></label>
              <label className="grid gap-1.5 text-xs font-semibold">Initial password<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className={fieldClass} /></label>
              <label className="grid gap-1.5 text-xs font-semibold">Role<select name="roleId" required className={fieldClass} defaultValue=""><option value="" disabled>Select role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
              <button type="submit" disabled={!roles.length} className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">Create account</button>
              {!roles.length ? <p className="text-xs text-destructive">Create a role before adding an account.</p> : null}
            </form>
          </Surface>
        ) : null}

        <Surface className="overflow-hidden px-5">
          <header className="flex items-end justify-between border-b border-border py-5">
            <div><h2 className="text-sm font-semibold">Team accounts</h2><p className="mt-1 text-[11px] text-muted-foreground">Role changes take effect on the next request.</p></div>
            <span className="text-[11px] text-muted-foreground">{accounts.length} accounts</span>
          </header>
          <div className="divide-y divide-border">
            {accounts.map((account) => {
              const label = account.username ?? account.email;
              return (
                <article key={account.id} className="grid gap-4 py-5 lg:grid-cols-[minmax(220px,1fr)_minmax(210px,320px)_auto] lg:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">{initials(label)}</span>
                    <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold">{account.username ? `@${account.username}` : account.email}</span>{account.id === authorization.user.id ? <span className="text-[10px] text-chart-1">YOU</span> : null}{account.isSiteAdmin ? <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground">SITE ADMIN</span> : null}</span><span className="mt-1 block text-[10px] text-muted-foreground">{account.role.name} · Joined {account.createdAt.toLocaleDateString("en-MV")}</span></span>
                  </div>
                  {isSiteAdmin ? (
                    <form action={assignRoleAction.bind(null, account.id)} className="flex gap-2">
                      <select name="roleId" defaultValue={account.roleId} className={`${fieldClass} min-w-0 flex-1`}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
                      <button type="submit" className="h-10 rounded-lg border border-border px-3 text-[11px] font-semibold hover:bg-accent">Save role</button>
                    </form>
                  ) : <span className="text-xs text-muted-foreground">{account.role.name}</span>}
                  {isSiteAdmin ? (
                    <form action={setSiteAdminAction.bind(null, account.id)}>
                      <input type="hidden" name="isSiteAdmin" value={account.isSiteAdmin ? "false" : "true"} />
                      <button type="submit" className={cn("h-10 rounded-lg border px-3 text-[11px] font-semibold", account.isSiteAdmin ? "border-destructive/30 text-destructive hover:bg-destructive/10" : "border-border hover:bg-accent")}>
                        {account.isSiteAdmin ? "Demote" : "Promote"}
                      </button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        </Surface>
      </section>

      {!isSiteAdmin && canAccess(authorization, "SETTINGS") ? (
        <p className="text-xs text-muted-foreground">Account and role changes are reserved for site administrators.</p>
      ) : null}
    </PageContainer>
  );
}
