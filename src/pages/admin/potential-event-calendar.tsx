import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { AdminMain } from "@/components/page-shell.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import PotentialEventCalendarManager from "./_components/potential-event-calendar-manager.tsx";
import PotentialEventCalendarPasswordGate from "./_components/potential-event-calendar-password-gate.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { usePotentialEventCalendarViewer } from "@/hooks/use-potential-event-calendar-viewer.ts";

function PotentialEventCalendarViewerContent() {
  const viewer = usePotentialEventCalendarViewer();

  if (viewer.isUnlocked && viewer.token) {
    return (
      <div className="flex flex-1 w-full min-w-0">
        <div className="flex-1 p-2 sm:p-6 max-w-7xl mx-auto w-full">
          {viewer.isChecking ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <PotentialEventCalendarManager
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
        <PotentialEventCalendarPasswordGate
          onUnlock={viewer.setToken}
          showStaffSignIn
        />
      )}
    </div>
  );
}

function PotentialEventCalendarStaffContent() {
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
        <PotentialEventCalendarManager />
      </AdminMain>
    );
  }

  return <PotentialEventCalendarViewerContent />;
}

export default function PotentialEventCalendarPage() {
  return (
    <>
      <Unauthenticated>
        <PotentialEventCalendarViewerContent />
      </Unauthenticated>

      <AuthLoading>
        <div className="flex flex-1 items-center justify-center w-full min-h-[50vh] p-4">
          <Skeleton className="h-48 w-full max-w-sm" />
        </div>
      </AuthLoading>

      <Authenticated>
        <PotentialEventCalendarStaffContent />
      </Authenticated>
    </>
  );
}
