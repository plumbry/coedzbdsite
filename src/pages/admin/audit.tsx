import AdminPageLayout from "@/components/admin-page-layout.tsx";
import AuditLogView from "./_components/audit-log-view.tsx";

export default function AuditPage() {
  return (
    <AdminPageLayout requireAdmin
      title="Audit Log"
      description="Review staff actions and system changes"
    >
      <AuditLogView />
    </AdminPageLayout>
  );
}
