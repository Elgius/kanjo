import { can, requireAuthorization } from "@/lib/authorization";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const authorization = await requireAuthorization();
  const canViewSettings = can(authorization, "SETTINGS_VIEW");
  return (
    <div>
      <SettingsNav showAccounts={canViewSettings} showRoles={canViewSettings && authorization.user.isSiteAdmin} showAudit={can(authorization, "AUDIT_LOG_VIEW_ALL")} />
      {children}
    </div>
  );
}
