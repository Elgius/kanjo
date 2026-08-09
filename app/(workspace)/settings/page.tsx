import { PageContainer, PageHeader, Surface } from "@/components/pos/primitives";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/pos/session";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function SettingsPage() {
  const currentUser = await requireUser();
  const accounts = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, emailVerified: true, createdAt: true },
  });

  return (
    <PageContainer className="gap-[22px]">
      <PageHeader
        eyebrow="Settings / Accounts"
        title="Accounts"
        description="Authenticated accounts with access to this workspace."
      />

      <section className="grid gap-3.5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Surface className="flex flex-col gap-3 p-[18px]">
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-sm font-semibold">Team accounts</h2>
            <span className="text-[11px] text-muted-foreground">{accounts.length} active</span>
          </div>
          {accounts.map((account) => (
            <article key={account.id} className="flex min-h-[74px] items-center gap-[11px] rounded-[9px] border border-border p-[11px]">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">{initials(account.name)}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1"><span className="truncate text-xs font-semibold">{account.name}</span><span className="truncate text-[10px] text-muted-foreground">{account.email}</span></span>
              {account.id === currentUser.id ? <span className="text-[10px] text-chart-1">YOU</span> : null}
            </article>
          ))}
        </Surface>

        <Surface className="flex min-h-[360px] flex-col gap-5 p-6">
          <div><h2 className="font-serif text-2xl font-semibold">Workspace access</h2><p className="mt-1 text-xs text-muted-foreground">Accounts are managed by the configured Better Auth provider.</p></div>
          <div className="grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
            <div className="rounded-lg bg-accent p-4"><p className="text-[10px] text-muted-foreground">SIGNED IN AS</p><p className="mt-2 text-sm font-semibold">{currentUser.name}</p><p className="mt-1 text-xs text-muted-foreground">{currentUser.email}</p></div>
            <div className="rounded-lg bg-accent p-4"><p className="text-[10px] text-muted-foreground">ACCESS MODEL</p><p className="mt-2 text-sm font-semibold">Authenticated workspace</p><p className="mt-1 text-xs text-muted-foreground">Role-based permissions are not configured.</p></div>
          </div>
        </Surface>
      </section>
    </PageContainer>
  );
}
