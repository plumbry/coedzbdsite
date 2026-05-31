import AdminPageLayout from "@/components/admin-page-layout.tsx";
import DiscordMembers from "./_components/discord-members.tsx";

export default function DiscordMembersPage() {
  return (
    <AdminPageLayout
      title="Discord Members"
      description="Browse and manage synced Discord member records"
      authTitle="Sign in to access Discord members"
    >
      <DiscordMembers />
    </AdminPageLayout>
  );
}
