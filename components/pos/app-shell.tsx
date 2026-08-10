import { MobileHeader, Sidebar } from "@/components/pos/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { PageKey } from "@/generated/prisma/enums";

type AppShellProps = {
  children: React.ReactNode;
  user: {
    email: string;
    name: string;
    username: string | null;
  };
  registers: Array<{
    id: string;
    code: string;
    name: string;
    isOpen: boolean;
    salesLaari: number;
  }>;
  allowedPages: PageKey[];
  homeHref: string;
};

export function AppShell({ children, user, registers, allowedPages, homeHref }: AppShellProps) {
  return (
    <TooltipProvider>
      <SidebarProvider
        className="bg-background text-foreground"
        style={{ "--sidebar-width": "14.5rem" } as React.CSSProperties}
      >
        <Sidebar user={user} registers={registers} allowedPages={allowedPages} homeHref={homeHref} />
        <SidebarInset className="min-w-0">
          <MobileHeader homeHref={homeHref} />
          <main className="min-w-0 flex-1">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
