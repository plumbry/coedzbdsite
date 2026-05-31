import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import DiscordMembers from "./_components/discord-members.tsx";

export default function DiscordMembersPage() {
  return (
    <AdminPageLayout
      title="Discord Directory"
      description="Advanced Discord role view, matching, and ID management"
      authTitle="Sign in to access the Discord directory"
    >
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Not the evaluation queue</AlertTitle>
        <AlertDescription>
          Synced members waiting for tier evaluation are on{" "}
          <Link to="/admin/member-management?tab=discord" className="font-medium text-primary underline-offset-4 hover:underline">
            Member Management → Discord tab
          </Link>
          . This page is for browsing all synced Discord members and managing roles/IDs.
        </AlertDescription>
      </Alert>

      <DiscordMembers />
    </AdminPageLayout>
  );
}
