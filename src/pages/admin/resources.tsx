import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { AdminMain } from "@/components/page-shell.tsx";import PageHeader from "@/components/page-header.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import OpsPasswordGate from "./_components/ops-password-gate.tsx";
import ResourcesHubTabs from "./_components/resources-hub-tabs.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { useEventBansViewer } from "@/hooks/use-event-bans-viewer.ts";

const PAGE_DESCRIPTION =
  "Moderation references, bot commands, and live operations data for events.";

function ResourcesPasswordContent({
  showStaffSignIn = false,
}: {
  showStaffSignIn?: boolean;
}) {
  const viewer = useEventBansViewer();

  const handleLock = () => {
    viewer.clear();
  };

  if (viewer.isChecking) {
    return <Skeleton className="h-48 w-full max-w-sm mx-auto" />;
  }

  if (viewer.isUnlocked && viewer.token) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Resources"
          description={PAGE_DESCRIPTION}
          variant="compact"
        />
        <ResourcesHubTabs
          viewerToken={viewer.token}
          accessLabel="Password access"
          canEdit={false}
          showLock
          onLock={handleLock}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center w-full min-h-[50vh] px-4">
      <div className="w-full max-w-sm">
        <OpsPasswordGate onUnlock={viewer.setToken} showStaffSignIn={showStaffSignIn} />
      </div>
    </div>
  );
}

function ResourcesStaffContent() {
  const { isAdmin, hasEventBanAccess, isLoading } = useUserRole();
  const viewer = useEventBansViewer();

  if (isLoading) {
    return (
      <AdminMain showSiteHeader={false} showSidebar>
        <Skeleton className="h-64 w-full" />
      </AdminMain>
    );
  }

  if (hasEventBanAccess) {
    return (
      <AdminMain showSiteHeader={false} showSidebar>
        <PageHeader
          title="Resources"
          description={PAGE_DESCRIPTION}
          variant="compact"
        />
        <ResourcesHubTabs
          canEdit={isAdmin}
          accessLabel={isAdmin ? "Admin" : "Staff"}
        />
      </AdminMain>
    );
  }

  if (viewer.isUnlocked && viewer.token) {
    return (
      <AdminMain showSiteHeader={false} showSidebar={false}>
        <div className="p-2 sm:p-6 max-w-7xl mx-auto w-full">
          <ResourcesPasswordContent />
        </div>
      </AdminMain>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center w-full min-h-[50vh] px-4">
      <ResourcesPasswordContent showStaffSignIn />
    </div>
  );
}

export default function ResourcesPage() {
  return (
    <>
      <Unauthenticated>
        <div className="flex flex-1 w-full min-w-0">
          <div className="flex-1 p-2 sm:p-6 max-w-7xl mx-auto w-full">
            <ResourcesPasswordContent />
          </div>
        </div>
      </Unauthenticated>

      <AuthLoading>
        <div className="flex flex-1 items-center justify-center w-full min-h-[50vh] p-4">
          <Skeleton className="h-48 w-full max-w-sm" />
        </div>
      </AuthLoading>

      <Authenticated>
        <ResourcesStaffContent />
      </Authenticated>
    </>
  );
}
