import { AppShell } from "@/components/pos/app-shell";
import { canAccess, firstAccessiblePath, requireAuthorization } from "@/lib/authorization";
import { PAGE_KEYS } from "@/lib/permissions";
import { getSidebarRegisters } from "@/lib/pos/queries";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authorization = await requireAuthorization();
  const allowedPages = PAGE_KEYS.filter((page) => canAccess(authorization, page));
  const registers = canAccess(authorization, "REGISTERS")
    ? await getSidebarRegisters()
    : [];

  return (
    <AppShell
      user={authorization.user}
      registers={registers}
      allowedPages={allowedPages}
      homeHref={firstAccessiblePath(authorization) ?? "/access-denied"}
    >
      {children}
    </AppShell>
  );
}
