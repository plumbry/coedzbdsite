import AdminPageLayout from "@/components/admin-page-layout.tsx";
import EventBansManager from "./_components/event-bans-manager.tsx";

export default function EventBansPage() {
  return (
    <AdminPageLayout
      skipHeader
      title="Event Bans"
      description="Synced to the Mod Log Google Sheet"
      authTitle="Sign in to manage event bans"
    >
      <EventBansManager />
    </AdminPageLayout>
  );
}
