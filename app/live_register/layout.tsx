import type { Metadata } from "next";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { requireCapability } from "@/lib/authorization";
import { RegisterSignOut } from "./sign-out";

export const metadata: Metadata = { title: "Your registers · Kanjo", robots: { index: false, follow: false } };

export default async function LiveRegisterLayout({ children }: { children: React.ReactNode }) {
  const authorization = await requireCapability("REGISTERS_VIEW", "LIVE_REGISTER_WORKSPACE");
  return <div className="min-h-dvh bg-background text-foreground">
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex min-h-20 max-w-[1600px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-5"><Link href="/live_register" className="font-serif text-2xl font-semibold">Kanjo.</Link><span className="hidden text-xs text-muted-foreground sm:block">Cashier workspace</span></div>
        <div className="flex items-center gap-3"><UserRound className="size-4 text-muted-foreground" /><div className="text-xs"><p className="font-semibold">{authorization.user.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{authorization.user.roleName}</p></div><RegisterSignOut /></div>
      </div>
    </header>
    {children}
  </div>;
}
