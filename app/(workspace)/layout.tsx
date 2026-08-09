import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/pos/app-shell";
import { auth } from "@/lib/auth";
import { getSidebarRegisters } from "@/lib/pos/queries";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  const registers = await getSidebarRegisters();

  return <AppShell user={session.user} registers={registers}>{children}</AppShell>;
}
