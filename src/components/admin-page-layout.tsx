import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import PageShell, { AdminMain, type PageShellMaxWidth } from "@/components/page-shell.tsx";
import PageHeader, { type PageHeaderProps } from "@/components/page-header.tsx";
import AuthGate from "@/components/auth-gate.tsx";

interface AdminPageLayoutProps {
  title?: string;
  description?: string;
  authTitle?: string;
  maxWidth?: PageShellMaxWidth;
  showSiteHeader?: boolean;
  showSidebar?: boolean;
  skipHeader?: boolean;
  header?: Omit<PageHeaderProps, "title" | "description">;
  children: React.ReactNode;
}

export default function AdminPageLayout({
  title,
  description,
  authTitle = "Sign in to access staff panel",
  maxWidth = "default",
  showSiteHeader = false,
  showSidebar = true,
  skipHeader = false,
  header,
  children,
}: AdminPageLayoutProps) {
  return (
    <>
      <Unauthenticated>
        <PageShell showSiteHeader={showSiteHeader}>
          <AuthGate title={authTitle}>
            <SignInButton />
          </AuthGate>
        </PageShell>
      </Unauthenticated>

      <AuthLoading>
        <PageShell showSiteHeader={showSiteHeader}>
          <Skeleton className="h-64 w-full" />
        </PageShell>
      </AuthLoading>

      <Authenticated>
        <AdminMain maxWidth={maxWidth} showSiteHeader={showSiteHeader} showSidebar={showSidebar}>
          {!skipHeader && title && (
            <PageHeader
              title={title}
              description={description}
              variant="compact"
              {...header}
            />
          )}
          {children}
        </AdminMain>
      </Authenticated>
    </>
  );
}
