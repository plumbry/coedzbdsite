import { useState } from "react";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import SiteHeader from "@/components/site-header.tsx";
import AdminSidebar from "@/pages/admin/_components/admin-sidebar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet.tsx";

type PageShellMaxWidth = "default" | "narrow" | "wide";

const maxWidthClasses: Record<PageShellMaxWidth, string> = {
  default: "max-w-7xl",
  narrow: "max-w-lg",
  wide: "max-w-[1600px]",
};

interface PageShellProps {
  maxWidth?: PageShellMaxWidth;
  showSiteHeader?: boolean;
  className?: string;
  children: React.ReactNode;
}

export default function PageShell({
  maxWidth = "default",
  showSiteHeader = true,
  className,
  children,
}: PageShellProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {showSiteHeader && <SiteHeader />}
      <main className="flex flex-1 flex-col w-full mx-auto px-3 md:px-6 py-3 md:py-4">
        <div
          className={cn(
            "mx-auto flex w-full flex-1 flex-col space-y-4",
            maxWidthClasses[maxWidth],
            className,
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

interface AdminMainProps {
  maxWidth?: PageShellMaxWidth;
  showSiteHeader?: boolean;
  showSidebar?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Authenticated admin content area with sidebar. */
export function AdminMain({
  maxWidth = "default",
  showSiteHeader = true,
  showSidebar = true,
  className,
  children,
}: AdminMainProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 bg-background">
      {showSidebar && <AdminSidebar />}
      {showSidebar && (
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0 md:hidden">
            <SheetTitle className="sr-only">Admin navigation</SheetTitle>
            <AdminSidebar
              inSheet
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {showSiteHeader && <SiteHeader />}
        {showSidebar && (
          <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open admin menu"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-muted-foreground">Admin menu</span>
          </div>
        )}
        <main className="flex-1 overflow-x-hidden p-3 md:overflow-x-auto md:p-5">
          <div
            className={cn(
              "mx-auto w-full space-y-4",
              maxWidthClasses[maxWidth],
              className,
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export { maxWidthClasses, type PageShellMaxWidth };
