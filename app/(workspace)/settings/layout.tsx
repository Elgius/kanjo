import Link from "next/link";

import { canAccess, requireAuthorization } from "@/lib/authorization";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const authorization = await requireAuthorization();
  const canViewSettings = canAccess(authorization, "SETTINGS");
  const canViewAudit = canAccess(authorization, "AUDIT_LOG");

  return (
    <div>
      <nav
        aria-label="Settings sections"
        className="mx-auto flex w-full max-w-[1480px] gap-1 px-5 pt-5 sm:px-7 xl:px-10"
      >
        {canViewSettings ? (
          <>
            <Link href="/settings" className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-accent">Accounts</Link>
            <Link href="/settings/roles" className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-accent">Roles</Link>
          </>
        ) : null}
        {canViewAudit ? (
          <Link href="/settings/audit-log" className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-accent">Audit log</Link>
        ) : null}
      </nav>
      {children}
    </div>
  );
}
