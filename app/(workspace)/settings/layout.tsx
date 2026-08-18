import Link from "next/link";

import { can, requireAuthorization } from "@/lib/authorization";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const authorization = await requireAuthorization();
  const canViewSettings = can(authorization, "SETTINGS_VIEW");
  const canViewAudit = can(authorization, "AUDIT_LOG_VIEW_ALL");

  return (
    <div>
      <nav
        aria-label="Settings sections"
        className="mx-auto flex w-full max-w-[1480px] gap-1 px-5 pt-5 sm:px-7 xl:px-10"
      >
        {canViewSettings ? (
          <>
            <Link prefetch={false} href="/settings" className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-accent">Accounts</Link>
            {authorization.user.isSiteAdmin ? <Link prefetch={false} href="/settings/roles" className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-accent">Roles</Link> : null}
          </>
        ) : null}
        {canViewAudit ? (
          <Link prefetch={false} href="/settings/audit-log" className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-accent">Audit log</Link>
        ) : null}
      </nav>
      {children}
    </div>
  );
}
