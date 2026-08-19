import { AppShell } from "@/components/pos/app-shell";
import { authorizedRegisterIds, can, canAccess, firstAccessiblePath, requireAuthorization } from "@/lib/authorization";
import { getRegisterNavigationVisibility, PAGE_KEYS } from "@/lib/permissions";
import { getSidebarRegisters } from "@/lib/pos/queries";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authorization = await requireAuthorization();
  const allowedPages = PAGE_KEYS.filter((page) => canAccess(authorization, page));
  const registers = can(authorization, "REGISTERS_VIEW")
    ? await getSidebarRegisters(authorizedRegisterIds(authorization))
    : [];

  return (
    <AppShell
      user={authorization.user}
      registers={registers}
      allowedPages={allowedPages}
      registerTree={getRegisterNavigationVisibility(
        authorization.user.isSiteAdmin,
        authorization.capabilities,
      )}
      homeHref={firstAccessiblePath(authorization) ?? "/access-denied"}
    >
      {children}
    </AppShell>
  );
}
