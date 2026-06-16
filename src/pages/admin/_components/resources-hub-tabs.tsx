import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Lock } from "lucide-react";
import PunishmentMatrixContent from "./punishment-matrix-content.tsx";
import BotCommandsReference from "./bot-commands-reference.tsx";
import SponsorLogTab from "./ops-hub/sponsor-log-tab.tsx";
import EventRulesTab from "./ops-hub/event-rules-tab.tsx";
import KillCapsTab from "./ops-hub/kill-caps-tab.tsx";
import ModDetailsTab from "./ops-hub/mod-details-tab.tsx";
import TicketRepliesTab from "./ops-hub/ticket-replies-tab.tsx";
import ResponsibilitiesTab from "./ops-hub/responsibilities-tab.tsx";
import TodosTab from "./ops-hub/todos-tab.tsx";
import VodPolicyTab from "./ops-hub/vod-policy-tab.tsx";

const VALID_TABS = [
  "commands",
  "punishment-matrix",
  "sponsors",
  "rules",
  "kill-caps",
  "mods",
  "tickets",
  "responsibilities",
  "todos",
  "vod",
] as const;

const DEFAULT_TAB = "commands";

type ResourcesHubTabsProps = {
  viewerToken?: string;
  canEdit?: boolean;
  accessLabel?: string;
  showLock?: boolean;
  onLock?: () => void;
};

export default function ResourcesHubTabs({
  viewerToken,
  canEdit = false,
  accessLabel,
  showLock,
  onLock,
}: ResourcesHubTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") ?? DEFAULT_TAB;
  const activeTab = VALID_TABS.includes(tabParam as (typeof VALID_TABS)[number])
    ? tabParam
    : DEFAULT_TAB;

  const handleTabChange = (value: string) => {
    setSearchParams(value === DEFAULT_TAB ? {} : { tab: value }, { replace: true });
  };

  return (
    <div className="space-y-4">
      {(accessLabel || showLock) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
            {accessLabel && (
              <Badge variant="outline" className="text-xs">
                {accessLabel}
              </Badge>
            )}
            {canEdit && (
              <Badge variant="secondary" className="text-xs">
                Live edit
              </Badge>
            )}
            {!canEdit && accessLabel && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                View only
              </Badge>
            )}
          </div>
          {showLock && onLock && (
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer shrink-0"
              onClick={onLock}
            >
              <Lock className="h-4 w-4 mr-1.5" />
              Lock
            </Button>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="w-max min-w-full sm:min-w-0 h-auto flex-wrap justify-start">
            <TabsTrigger value="commands" className="cursor-pointer">
              Commands
            </TabsTrigger>
            <TabsTrigger value="punishment-matrix" className="cursor-pointer">
              Punishment Matrix
            </TabsTrigger>
            <TabsTrigger value="sponsors" className="cursor-pointer">
              Sponsor Log
            </TabsTrigger>
            <TabsTrigger value="rules" className="cursor-pointer">
              Event Rules
            </TabsTrigger>
            <TabsTrigger value="kill-caps" className="cursor-pointer">
              Kill Caps
            </TabsTrigger>
            <TabsTrigger value="mods" className="cursor-pointer">
              Mod Details
            </TabsTrigger>
            <TabsTrigger value="tickets" className="cursor-pointer">
              Ticket Replies
            </TabsTrigger>
            <TabsTrigger value="responsibilities" className="cursor-pointer">
              Responsibilities
            </TabsTrigger>
            <TabsTrigger value="todos" className="cursor-pointer">
              To-do
            </TabsTrigger>
            <TabsTrigger value="vod" className="cursor-pointer">
              VOD / Evidence
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="commands" className="mt-4">
          <BotCommandsReference />
        </TabsContent>
        <TabsContent value="punishment-matrix" className="mt-4">
          <PunishmentMatrixContent />
        </TabsContent>
        <TabsContent value="sponsors" className="mt-4">
          <SponsorLogTab viewerToken={viewerToken} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <EventRulesTab viewerToken={viewerToken} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="kill-caps" className="mt-4">
          <KillCapsTab viewerToken={viewerToken} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="mods" className="mt-4">
          <ModDetailsTab viewerToken={viewerToken} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="tickets" className="mt-4">
          <TicketRepliesTab viewerToken={viewerToken} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="responsibilities" className="mt-4">
          <ResponsibilitiesTab viewerToken={viewerToken} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="todos" className="mt-4">
          <TodosTab viewerToken={viewerToken} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="vod" className="mt-4">
          <VodPolicyTab viewerToken={viewerToken} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
