import AdminPageLayout from "@/components/admin-page-layout.tsx";
import SupportPanel from "./_components/support-panel.tsx";

export default function SupportAdminPage() {
  return (
    <AdminPageLayout requireModerator
      title="Support Tickets"
      description="Manage support requests from players"
      authTitle="Sign in to manage support tickets"
    >
      <SupportPanel />
    </AdminPageLayout>
  );
}
