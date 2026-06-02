import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import ImportThirdParty from "./_components/import-third-party.tsx";
import YuniteDashboard from "./_components/yunite-dashboard.tsx";
import { YuniteDebugContent } from "./yunite-debug.tsx";

const VALID_TABS = ["imports", "yunite", "debug"] as const;

export default function UploadsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "imports";
  const activeTab = VALID_TABS.includes(tabParam as (typeof VALID_TABS)[number])
    ? tabParam
    : "imports";

  const handleTabChange = (value: string) => {
    setSearchParams(value === "imports" ? {} : { tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout requireAdmin
      title="Uploads & Imports"
      description="Import third-party results and Yunite tournament sync"
    >
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="imports">Imports</TabsTrigger>
          <TabsTrigger value="yunite">Yunite</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>

        <TabsContent value="imports" className="space-y-4 mt-4">
          <ImportThirdParty />
        </TabsContent>

        <TabsContent value="yunite" className="space-y-4 mt-4">
          <YuniteDashboard showBulkSync={true} showOverview={true} />
        </TabsContent>

        <TabsContent value="debug" className="space-y-4 mt-4">
          <YuniteDebugContent />
        </TabsContent>
      </Tabs>

    </AdminPageLayout>
  );
}
