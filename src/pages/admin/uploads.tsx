import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Upload } from "lucide-react";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import ImportThirdParty from "./_components/import-third-party.tsx";
import ImportPlayersDialog from "../_components/import-players-dialog.tsx";
import YuniteDashboard from "./_components/yunite-dashboard.tsx";

export default function UploadsPage() {
  const [isImportPlayersDialogOpen, setIsImportPlayersDialogOpen] = useState(false);

  return (
    <AdminPageLayout
      title="Uploads"
      description="Import player data and third-party tournament results"
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Import Player CSV</CardTitle>
          <CardDescription className="text-xs">
            Import player data from CSV file
          </CardDescription>
        </CardHeader>
        <CardContent className="py-3">
          <Button size="sm" onClick={() => setIsImportPlayersDialogOpen(true)}>
            <Upload className="mr-2 h-3.5 w-3.5" />
            Import Player CSV
          </Button>
        </CardContent>
      </Card>

      <ImportThirdParty />

      <YuniteDashboard showBulkSync={false} showOverview={false} />

      <ImportPlayersDialog 
        open={isImportPlayersDialogOpen}
        onOpenChange={setIsImportPlayersDialogOpen}
      />
    </AdminPageLayout>
  );
}
