import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import PunishmentMatrixContent from "./_components/punishment-matrix-content.tsx";
import BotCommandsReference from "./_components/bot-commands-reference.tsx";

const VALID_TABS = ["commands", "punishment-matrix"] as const;
const DEFAULT_TAB = "commands";

export default function ResourcesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") ?? DEFAULT_TAB;
  const activeTab = VALID_TABS.includes(tabParam as (typeof VALID_TABS)[number])
    ? tabParam
    : DEFAULT_TAB;

  const handleTabChange = (value: string) => {
    setSearchParams(value === DEFAULT_TAB ? {} : { tab: value }, { replace: true });
  };

  return (
    <AdminPageLayout requireEventBanAccess
      title="Resources"
      description="Moderation reference guides and Discord bot command documentation"
    >
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="commands">Commands</TabsTrigger>
          <TabsTrigger value="punishment-matrix">Punishment Matrix</TabsTrigger>
        </TabsList>

        <TabsContent value="punishment-matrix" className="space-y-4 mt-4">
          <PunishmentMatrixContent />
        </TabsContent>

        <TabsContent value="commands" className="space-y-4 mt-4">
          <BotCommandsReference />
        </TabsContent>
      </Tabs>
    </AdminPageLayout>
  );
}
