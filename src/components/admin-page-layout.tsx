import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { AdminMain, type PageShellMaxWidth } from "@/components/page-shell.tsx";
import PageHeader, { type PageHeaderProps } from "@/components/page-header.tsx";
import AuthGate from "@/components/auth-gate.tsx";
import RoleGate from "@/components/role-gate.tsx";
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
  header?: Omit<PageHeaderProps, "title" | "description">;
  children: React.ReactNode;
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
  header,
  children,
}: Omit<AdminPageLayoutProps, "authTitle">) {
  const { isAdmin, isModeratorOrAdmin, hasEventBanAccess, isLoading } = useUserRole();

  if (isLoading) {
    return (
      <AdminMain maxWidth={maxWidth} showSiteHeader={showSiteHeader} showSidebar={showSidebar}>
        <Skeleton className="h-64 w-full" />
      </AdminMain>
    );
  }

  const allowed =
    (!requireAdmin && !requireModerator && !requireEventBanAccess) ||
    (requireAdmin && isAdmin) ||
    (requireModerator && isModeratorOrAdmin) ||
    (requireEventBanAccess && hasEventBanAccess);

  if (!allowed) {
    const descriptionText = requireAdmin
      ? "This page is only accessible to administrators."
      : requireEventBanAccess
        ? "This page is only accessible to event moderators and administrators."
        : "This page is only accessible to administrators and moderators.";

    return (
      <AdminMain maxWidth={maxWidth} showSiteHeader={showSiteHeader} showSidebar={showSidebar}>
        <RoleGate allowed={false} description={descriptionText} showBackButton={false} />
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
  header,
  children,
}: AdminPageLayoutProps) {
  return (
    <>
      <Unauthenticated>
        <div className="flex flex-1 w-full items-center justify-center px-4 py-12">
          <AuthGate title={authTitle}>
            <SignInButton />
          </AuthGate>
        </div>
      </Unauthenticated>

      <AuthLoading>
        <div className="flex flex-1 w-full items-center justify-center px-4 py-12">
          <Skeleton className="h-48 w-full max-w-sm" />
        </div>
      </AuthLoading>

      <Authenticated>
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
          header={header}
        >
          {children}
        </AdminAuthorizedContent>
      </Authenticated>
    </>
  );
}
