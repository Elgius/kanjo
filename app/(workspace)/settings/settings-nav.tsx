"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsNav({ showAccounts, showRoles, showAudit }: { showAccounts: boolean; showRoles: boolean; showAudit: boolean }) {
  const pathname = usePathname();
  const links = [
    { href: "/settings", label: "Team accounts", show: showAccounts },
    { href: "/settings/roles", label: "Roles & permissions", show: showRoles },
    { href: "/settings/audit-log", label: "Audit log", show: showAudit },
  ];
  return <nav aria-label="Settings sections" className="mx-auto flex w-full max-w-[1208px] flex-wrap gap-2 px-4 pt-6 sm:px-6 lg:px-10">
    {links.filter(({ show }) => show).map(({ href, label }) => <Link key={href} prefetch={false} href={href} aria-current={pathname === href ? "page" : undefined} className={cn("rounded-lg border border-border px-4 py-2.5 text-xs font-semibold", pathname === href ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent")}>{label}</Link>)}
  </nav>;
}
