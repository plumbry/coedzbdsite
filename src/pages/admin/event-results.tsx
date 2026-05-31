import AdminPageLayout from "@/components/admin-page-layout.tsx";
import EventResultsManager from "./_components/event-results-manager.tsx";

export default function EventResultsPage() {
  return (
    <AdminPageLayout requireModerator
      title="Event Results Manager"
      description="Manage individual player event results"
      authTitle="Sign in to manage event results"
    >
      <EventResultsManager />
    </AdminPageLayout>
  );
}
