import AdminPageLayout from "@/components/admin-page-layout.tsx";
import UserManagementContent from "./_components/user-management-content.tsx";

export default function UserManagementPage() {
  return (
    <AdminPageLayout
      title="User Management"
      description="Manage admin access for users"
      authTitle="Sign in to access user management"
    >
      <UserManagementContent />
    </AdminPageLayout>
  );
}
