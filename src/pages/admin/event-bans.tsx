import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { AdminMain } from "@/components/page-shell.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import EventBansManager from "./_components/event-bans-manager.tsx";
import EventBansPasswordGate from "./_components/event-bans-password-gate.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { useEventBansViewer } from "@/hooks/use-event-bans-viewer.ts";

function EventBansViewerContent() {
  const viewer = useEventBansViewer();

  if (viewer.isUnlocked && viewer.token) {
    return (
      <div className="flex flex-1 w-full min-w-0">
        <div className="flex-1 p-2 sm:p-6 max-w-7xl mx-auto w-full">
          {viewer.isChecking ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <EventBansManager
              readOnly
              viewerToken={viewer.token}
              onEndViewSession={viewer.clear}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center w-full min-h-[50vh] px-4">
      {viewer.isChecking ? (
        <Skeleton className="h-48 w-full max-w-sm" />
      ) : (
        <EventBansPasswordGate onUnlock={viewer.setToken} showStaffSignIn />
      )}
    </div>
  );
}

function EventBansStaffContent() {
  const { hasEventBanAccess, isLoading } = useUserRole();

  if (isLoading) {
    return (
      <AdminMain showSiteHeader={false}>
        <Skeleton className="h-64 w-full" />
      </AdminMain>
    );
  }

  if (hasEventBanAccess) {
    return (
      <AdminMain showSiteHeader={false}>
        <EventBansManager />
      </AdminMain>
    );
  }

  return <EventBansViewerContent />;
}

export default function EventBansPage() {
  return (
    <>
      <Unauthenticated>
        <EventBansViewerContent />
      </Unauthenticated>

      <AuthLoading>
        <div className="flex flex-1 items-center justify-center w-full min-h-[50vh] p-4">
          <Skeleton className="h-48 w-full max-w-sm" />
        </div>
      </AuthLoading>

      <Authenticated>
        <EventBansStaffContent />
      </Authenticated>
    </>
  );
}
