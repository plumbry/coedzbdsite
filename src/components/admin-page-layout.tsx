import { useAuth, useClerk } from "@clerk/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { AdminMain, type PageShellMaxWidth } from "@/components/page-shell.tsx";
import PageHeader, { type PageHeaderProps } from "@/components/page-header.tsx";
import AuthGate from "@/components/auth-gate.tsx";
import { useAuth as useAppAuth } from "@/hooks/use-auth.ts";
import { useUserRole } from "@/hooks/use-user-role.ts";

interface AdminPageLayoutProps {
  title?: string;
  description?: string;
  authTitle?: string;
  maxWidth?: PageShellMaxWidth;
  showSiteHeader?: boolean;
  showSidebar?: boolean;
  skipHeader?: boolean;
  requireAdmin?: boolean;
  requireModerator?: boolean;
  requireEventBanAccess?: boolean;
  requireAnalyticsHub?: boolean;
  header?: Omit<PageHeaderProps, "title" | "description">;
  children: React.ReactNode;
}

function SwitchAccountButton() {
  const { signOut } = useClerk();

  return (
    <Button
      onClick={() => {
        void signOut({ redirectUrl: "/admin/summer-slam" });
      }}
    >
      Sign out / switch account
    </Button>
  );
}

function DirectAdminSignInButton() {
  const { signinRedirect, isLoading } = useAppAuth();

  return (
    <Button
      disabled={isLoading}
      onClick={() => {
        void signinRedirect();
      }}
    >
      Sign in with Discord
    </Button>
  );
}

function AdminAuthorizedContent({
  title,
  description,
  maxWidth,
  showSiteHeader,
  showSidebar,
  skipHeader,
  requireAdmin,
  requireModerator,
  requireEventBanAccess,
  requireAnalyticsHub,
  header,
  children,
}: Omit<AdminPageLayoutProps, "authTitle">) {
  const {
    isAdmin,
    isModeratorOrAdmin,
    hasEventBanAccess,
    hasAnalyticsHubAccess,
    isLoading,
  } = useUserRole();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }
    const timeout = window.setTimeout(() => setLoadingTimedOut(true), 30000);
    return () => window.clearTimeout(timeout);
  }, [isLoading]);

  if (isLoading && !loadingTimedOut) {
    return (
      <AdminMain maxWidth={maxWidth} showSiteHeader={showSiteHeader} showSidebar={showSidebar}>
        <Skeleton className="h-64 w-full" />
      </AdminMain>
    );
  }

  if (isLoading && loadingTimedOut) {
    return (
      <AdminMain maxWidth={maxWidth} showSiteHeader={showSiteHeader} showSidebar={showSidebar}>
        <div className="flex min-h-[40vh] flex-col items-center justify-center space-y-4 text-center">
          <h1 className="text-xl font-bold">Still Connecting to Admin Services</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            You are signed in, but the backend has not returned your admin role yet. Refresh the page once; if this keeps happening, the Clerk to Convex auth handshake needs checking.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => window.location.reload()}>Refresh page</Button>
            <SwitchAccountButton />
          </div>
        </div>
      </AdminMain>
    );
  }

  const allowed =
    (!requireAdmin &&
      !requireModerator &&
      !requireEventBanAccess &&
      !requireAnalyticsHub) ||
    (requireAdmin && isAdmin) ||
    (requireModerator && isModeratorOrAdmin) ||
    (requireEventBanAccess && hasEventBanAccess) ||
    (requireAnalyticsHub && hasAnalyticsHubAccess);

  if (!allowed) {
    const descriptionText = requireAnalyticsHub
      ? "This page is only accessible to analytics staff and administrators."
      : requireAdmin
      ? "This page is only accessible to administrators."
      : requireEventBanAccess
        ? "This page is only accessible to event moderators and administrators."
        : "This page is only accessible to administrators and moderators.";

    return (
      <AdminMain maxWidth={maxWidth} showSiteHeader={showSiteHeader} showSidebar={showSidebar}>
        <div className="flex min-h-[40vh] flex-col items-center justify-center space-y-4 text-center">
          <h1 className="text-xl font-bold">Access Denied</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            {descriptionText} Sign out and switch accounts if you expected access.
          </p>
          <SwitchAccountButton />
        </div>
      </AdminMain>
    );
  }

  return (
    <AdminMain maxWidth={maxWidth} showSiteHeader={showSiteHeader} showSidebar={showSidebar}>
      {!skipHeader && title && (
        <PageHeader title={title} description={description} variant="compact" {...header} />
      )}
      {children}
    </AdminMain>
  );
}

export default function AdminPageLayout({
  title,
  description,
  authTitle = "Sign in to access staff panel",
  maxWidth = "default",
  showSiteHeader = false,
  showSidebar = true,
  skipHeader = false,
  requireAdmin = false,
  requireModerator = false,
  requireEventBanAccess = false,
  requireAnalyticsHub = false,
  header,
  children,
}: AdminPageLayoutProps) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex flex-1 w-full items-center justify-center px-4 py-12">
        <Skeleton className="h-48 w-full max-w-sm" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex flex-1 w-full items-center justify-center px-4 py-12">
        <AuthGate title={authTitle}>
          <DirectAdminSignInButton />
        </AuthGate>
      </div>
    );
  }

  return (
    <AdminAuthorizedContent
      title={title}
      description={description}
      maxWidth={maxWidth}
      showSiteHeader={showSiteHeader}
      showSidebar={showSidebar}
      skipHeader={skipHeader}
      requireAdmin={requireAdmin}
      requireModerator={requireModerator}
      requireEventBanAccess={requireEventBanAccess}
      requireAnalyticsHub={requireAnalyticsHub}
      header={header}
    >
      {children}
    </AdminAuthorizedContent>
  );
}
