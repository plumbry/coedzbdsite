import AdminPageLayout from "@/components/admin-page-layout.tsx";
import DataMaintenanceTools from "./_components/data-maintenance-tools.tsx";

export default function DataMaintenancePage() {
  return (
    <AdminPageLayout
      requireAdmin
      title="Data Maintenance"
      description="Bulk stat refresh, database migrations, and destructive cleanup tools."
      authTitle="Sign in to access data maintenance"
    >
      <DataMaintenanceTools />
    </AdminPageLayout>
  );
}
