"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChartNoAxesCombined,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  Store,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
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
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/registers", label: "Registers", icon: Store },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/reporting", label: "Reporting", icon: ChartNoAxesCombined },
  { href: "/settings", label: "Settings", icon: Settings },
];

type SidebarRegister = {
  id: string;
  code: string;
  name: string;
  isOpen: boolean;
  salesLaari: number;
};

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-[11px] px-2">
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

function Navigation() {
  const pathname = usePathname();

  return (
    <SidebarGroup className="px-5 py-0">
      <SidebarMenu className="gap-1.5">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                render={<Link href={href} />}
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
  const [activeRegisterId, setActiveRegisterId] = useState(
    registers.find((register) => register.isOpen)?.id ?? registers[0]?.id ?? "",
  );
  const activeRegister =
    registers.find((register) => register.id === activeRegisterId) ?? registers[0];

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
            value={activeRegisterId}
            onValueChange={(value) => {
              const registerId = String(value);
              setActiveRegisterId(registerId);
              router.push(`/registers?register=${registerId}`);
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
  };
  registers: SidebarRegister[];
};

export function Sidebar({ user, registers }: SidebarProps) {
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
        <Brand />
      </SidebarHeader>
      <SidebarContent className="gap-7">
        <Navigation />
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
              {user.email}
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

export function MobileHeader() {
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
        <Brand compact />
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
