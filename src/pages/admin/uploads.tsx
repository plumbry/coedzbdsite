import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Upload } from "lucide-react";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import ImportThirdParty from "./_components/import-third-party.tsx";
import ImportPlayersDialog from "../_components/import-players-dialog.tsx";
import YuniteDashboard from "./_components/yunite-dashboard.tsx";
import { YuniteDebugContent } from "./yunite-debug.tsx";

const VALID_TABS = ["imports", "yunite", "debug"] as const;

export default function UploadsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "imports";
  const activeTab = VALID_TABS.includes(tabParam as (typeof VALID_TABS)[number])
    ? tabParam
    : "imports";
  const [isImportPlayersDialogOpen, setIsImportPlayersDialogOpen] = useState(false);

  const handleTabChange = (value: string) => {
    setSearchParams(value === "imports" ? {} : { tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout requireAdmin
      title="Uploads & Imports"
      description="Import player data, third-party results, and Yunite tournament sync"
    >
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="imports">Imports</TabsTrigger>
          <TabsTrigger value="yunite">Yunite</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>

        <TabsContent value="imports" className="space-y-4 mt-4">
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
        </TabsContent>

        <TabsContent value="yunite" className="space-y-4 mt-4">
          <YuniteDashboard showBulkSync={true} showOverview={true} />
        </TabsContent>

        <TabsContent value="debug" className="space-y-4 mt-4">
          <YuniteDebugContent />
        </TabsContent>
      </Tabs>

      <ImportPlayersDialog
        open={isImportPlayersDialogOpen}
        onOpenChange={setIsImportPlayersDialogOpen}
      />
    </AdminPageLayout>
  );
}
