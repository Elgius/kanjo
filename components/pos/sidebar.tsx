"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Package,
  PencilLine,
  ReceiptText,
  Settings,
  Store,
  UsersRound,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
import type { PageKey } from "@/generated/prisma/enums";
import { formatMvr } from "@/lib/pos/money";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navigation = [
  { page: "OVERVIEW", href: "/", label: "Overview", icon: LayoutDashboard },
  { page: "REGISTERS", href: "/registers", label: "Registers", icon: Store },
  { page: "INVENTORY", href: "/inventory", label: "Inventory", icon: Package },
  { page: "STOCK", href: "/stock", label: "Stock", icon: Boxes },
  { page: "REPORTING", href: "/reporting", label: "Reporting", icon: ChartNoAxesCombined },
  { page: "BILL_HISTORY", href: "/bill-history", label: "Bill history", icon: ReceiptText },
  { page: "CUSTOMERS", href: "/customers", label: "Customers", icon: UsersRound },
  { page: "SETTINGS", href: "/settings", label: "Settings", icon: Settings },
] as const;

type SidebarRegister = {
  id: string;
  code: string;
  name: string;
  isOpen: boolean;
  salesLaari: number;
};

function Brand({ compact = false, homeHref = "/" }: { compact?: boolean; homeHref?: string }) {
  return (
    <Link prefetch={false} href={homeHref} className="flex min-w-0 items-center gap-[11px] px-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-serif text-lg font-bold text-primary-foreground">
        K
      </span>
      <span
        className={
          compact
            ? "text-[15px] font-bold tracking-[-0.01em]"
            : "truncate text-[15px] font-bold tracking-[-0.01em] group-data-[collapsible=icon]:hidden"
        }
      >
        Kanjo
      </span>
    </Link>
  );
}

function Navigation({ allowedPages }: { allowedPages: PageKey[] }) {
  const pathname = usePathname();
  const [registersOpen, setRegistersOpen] = useState(true);
  const visibleNavigation = navigation
    .filter((item) =>
      allowedPages.includes(item.page) ||
      (item.page === "SETTINGS" && allowedPages.includes("AUDIT_LOG")),
    )
    .map((item) =>
      item.page === "SETTINGS" && !allowedPages.includes("SETTINGS")
        ? { ...item, href: "/settings/audit-log" }
        : item,
    );

  return (
    <SidebarGroup className="px-5 py-0">
      <SidebarMenu className="gap-1.5">
        {visibleNavigation.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

          if (href === "/registers") {
            const sessionsActive = pathname.startsWith("/registers/sessions");
            const editActive = pathname.startsWith("/registers/edit");
            const selectionActive = active && !sessionsActive && !editActive;

            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  type="button"
                  onClick={() => setRegistersOpen((open) => !open)}
                  aria-expanded={registersOpen}
                  tooltip={label}
                  className="h-10 gap-3 rounded-lg px-3 text-[13px] font-medium group-data-[collapsible=icon]:size-10!"
                >
                  <Icon className="size-[17px]!" aria-hidden="true" />
                  <span>{label}</span>
                  <ChevronDown
                    className={`ml-auto size-3.5 transition-transform group-data-[collapsible=icon]:hidden ${registersOpen ? "rotate-0" : "-rotate-90"}`}
                    aria-hidden="true"
                  />
                </SidebarMenuButton>
                {registersOpen ? (
                  <SidebarMenuSub className="pb-1 pt-1">
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        render={<Link href="/registers" prefetch={false} />}
                        isActive={selectionActive}
                        className="h-8 rounded-lg text-[12px] data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground"
                      >
                        <ListChecks aria-hidden="true" />
                        <span>Register selection</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        render={<Link href="/registers/sessions" prefetch={false} />}
                        isActive={sessionsActive}
                        className="h-8 rounded-lg text-[12px] data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground"
                      >
                        <Clock3 aria-hidden="true" />
                        <span>Sessions</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        render={<Link href="/registers/edit" prefetch={false} />}
                        isActive={editActive}
                        className="h-8 rounded-lg text-[12px] data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground"
                      >
                        <PencilLine aria-hidden="true" />
                        <span>Edit</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                ) : null}
              </SidebarMenuItem>
            );
          }

          return (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                render={<Link href={href} prefetch={false} />}
                isActive={active}
                tooltip={label}
                className="h-10 gap-3 rounded-lg px-3 text-[13px] font-medium data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground group-data-[collapsible=icon]:size-10!"
              >
                <Icon className="size-[17px]!" aria-hidden="true" />
                <span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function RegistryPicker({ registers }: { registers: SidebarRegister[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const routeRegisterId = pathname.match(/^\/registers\/([^/]+)/)?.[1];
  const [activeRegisterId, setActiveRegisterId] = useState(
    registers.find((register) => register.id === routeRegisterId)?.id ??
      registers.find((register) => register.isOpen)?.id ??
      registers[0]?.id ??
      "",
  );
  const currentRegisterId = registers.some((register) => register.id === routeRegisterId)
    ? routeRegisterId!
    : activeRegisterId;
  const activeRegister =
    registers.find((register) => register.id === currentRegisterId) ?? registers[0];

  if (!activeRegister) return null;

  return (
    <SidebarGroup className="gap-2.5 px-5 py-0 group-data-[collapsible=icon]:hidden">
      <p className="px-2 font-mono text-[10px] tracking-[0.08em] text-muted-foreground">
        REGISTRY
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex w-full flex-col gap-[7px] rounded-lg border border-sidebar-border bg-card p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            />
          }
        >
          <span className="flex items-center justify-between text-[13px] font-semibold">
            {activeRegister.name}
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </span>
          <span className="flex items-center gap-[7px] text-[11px] text-muted-foreground">
            <span
              className={
                activeRegister.isOpen
                  ? "size-[7px] rounded-full bg-chart-1"
                  : "size-[7px] rounded-full border border-muted-foreground"
              }
            />
            {activeRegister.isOpen ? "Open" : "Closed"} · {activeRegister.isOpen ? formatMvr(activeRegister.salesLaari) : "—"}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="rounded-lg border border-sidebar-border bg-card p-1 shadow-lg ring-0"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2.5 pb-1 pt-1.5 font-mono text-[9px] tracking-[0.08em]">
              SELECT REGISTER
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuRadioGroup
            value={currentRegisterId}
            onValueChange={(value) => {
              const registerId = String(value);
              setActiveRegisterId(registerId);
              router.push(`/registers/${registerId}`);
            }}
          >
            {registers.map((register) => (
              <DropdownMenuRadioItem
                key={register.id}
                value={register.id}
                closeOnClick
                className="min-h-12 rounded-md px-2.5 py-2 pr-8"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs font-semibold">{register.name}</span>
                  <span className="flex items-center gap-[7px] text-[10px] text-muted-foreground">
                    <span
                      className={
                        register.isOpen
                          ? "size-1.5 rounded-full bg-chart-1"
                          : "size-1.5 rounded-full border border-muted-foreground"
                      }
                    />
                    {register.isOpen ? "Open" : "Closed"} · {register.isOpen ? formatMvr(register.salesLaari) : "—"}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarGroup>
  );
}

type SidebarProps = {
  user: {
    email: string;
    name: string;
    username: string | null;
  };
  registers: SidebarRegister[];
  allowedPages: PageKey[];
  homeHref: string;
};

export function Sidebar({ user, registers, allowedPages, homeHref }: SidebarProps) {
  const router = useRouter();
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <SidebarPrimitive collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="gap-0 px-5 py-7 group-data-[collapsible=icon]:px-2">
        <Brand homeHref={homeHref} />
      </SidebarHeader>
      <SidebarContent className="gap-7">
        <Navigation allowedPages={allowedPages} />
        <RegistryPicker registers={registers} />
      </SidebarContent>
      <SidebarFooter className="px-5 pb-7 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-2.5 border-t border-sidebar-border px-2 pt-[18px] group-data-[collapsible=icon]:px-0">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
            {initials}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
            <span className="truncate text-xs font-semibold">{user.name}</span>
            <span className="truncate text-[10px] text-muted-foreground">
              {user.username ? `@${user.username}` : user.email}
            </span>
          </span>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
            className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
          >
            <LogOut className="size-4" aria-hidden="true" />
          </button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </SidebarPrimitive>
  );
}

export function MobileHeader({ homeHref }: { homeHref: string }) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border bg-sidebar/95 px-4 backdrop-blur md:hidden">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="size-9 rounded-lg border border-sidebar-border bg-card" />
        <Brand compact homeHref={homeHref} />
      </div>
      <button
        type="button"
        onClick={signOut}
        aria-label="Sign out"
        className="flex size-9 items-center justify-center rounded-lg border border-sidebar-border bg-card"
      >
        <LogOut className="size-4" aria-hidden="true" />
      </button>
    </header>
  );
}
