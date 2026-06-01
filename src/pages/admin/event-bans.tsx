import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import EventBansManager from "./_components/event-bans-manager.tsx";
import EventBansPasswordGate from "./_components/event-bans-password-gate.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { useEventBansViewer } from "@/hooks/use-event-bans-viewer.ts";

export default function EventBansPage() {
  const { hasEventBanAccess, isLoading: roleLoading, isAuthenticated } = useUserRole();
  const viewer = useEventBansViewer();

  if (isAuthenticated && !roleLoading && hasEventBanAccess) {
    return (
      <AdminPageLayout
        requireEventBanAccess
        skipHeader
        title="Event Bans"
        description="Synced to the Mod Log Google Sheet"
        authTitle="Sign in to manage event bans"
      >
        <EventBansManager />
      </AdminPageLayout>
    );
  }

  if (viewer.isUnlocked && viewer.token) {
    return (
      <div className="flex flex-1 w-full min-w-0">
        <div className="flex-1 p-2 sm:p-6 max-w-7xl mx-auto w-full">
          {viewer.isChecking ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <EventBansManager readOnly viewerToken={viewer.token} onEndViewSession={viewer.clear} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center w-full min-h-[50vh]">
      {viewer.isChecking ? (
        <Skeleton className="h-48 w-full max-w-sm" />
      ) : (
        <EventBansPasswordGate onUnlock={viewer.setToken} />
      )}
    </div>
  );
}
