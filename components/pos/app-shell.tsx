import { MobileHeader, Sidebar } from "@/components/pos/sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

type AppShellProps = {
  children: React.ReactNode;
  user: {
    email: string;
    name: string;
  };
  registers: Array<{
    id: string;
    code: string;
    name: string;
    isOpen: boolean;
    salesLaari: number;
  }>;
};

export function AppShell({ children, user, registers }: AppShellProps) {
  return (
    <TooltipProvider>
      <SidebarProvider
        className="bg-background text-foreground"
        style={{ "--sidebar-width": "14.5rem" } as React.CSSProperties}
      >
        <Sidebar user={user} registers={registers} />
        <SidebarInset className="min-w-0">
          <MobileHeader />
          <main className="min-w-0 flex-1">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
