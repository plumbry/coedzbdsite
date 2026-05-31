import { cn } from "@/lib/utils.ts";
import SiteHeader from "@/components/site-header.tsx";
import AdminSidebar from "@/pages/admin/_components/admin-sidebar.tsx";

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
      <main className="flex-1 w-full mx-auto px-4 md:px-6 py-4">
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
  return (
    <div className="flex min-h-0 min-w-0 flex-1 bg-background">
      {showSidebar && <AdminSidebar />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {showSiteHeader && <SiteHeader />}
        <main className="flex-1 overflow-x-auto p-4 md:p-5">
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
