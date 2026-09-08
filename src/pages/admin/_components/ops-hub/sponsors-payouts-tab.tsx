import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { opsQueryArgs, type OpsHubTabProps } from "./types.ts";
import { ALL_EVENTS, collectEventNames } from "./event-filter.tsx";
import SponsorLogTab from "./sponsor-log-tab.tsx";
import PayoutsTab from "./payouts-tab.tsx";

const VALID_SECTIONS = ["sponsors", "payouts"] as const;
type Section = (typeof VALID_SECTIONS)[number];

function resolveSection(value: string | null): Section {
  if (value === "payouts") return "payouts";
  return "sponsors";
}

export default function SponsorsPayoutsTab({
  viewerToken,
  canEdit = false,
}: OpsHubTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = resolveSection(searchParams.get("section"));
  const [eventFilter, setEventFilter] = useState(ALL_EVENTS);

  const sponsors = useQuery(
    api.opsHub.queries.listSponsorLogs,
    opsQueryArgs(viewerToken),
  );
  const payouts = useQuery(
    api.opsHub.queries.listPayouts,
    opsQueryArgs(viewerToken),
  );

  const eventNames = useMemo(
    () =>
      collectEventNames([
        ...(sponsors ?? []).map((row) => row.intendedEvent),
        ...(payouts ?? []).map((row) => row.event),
      ]),
    [sponsors, payouts],
  );

  const handleSectionChange = (value: string) => {
    const next = resolveSection(value);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("tab", "sponsors");
        if (next === "payouts") params.set("section", "payouts");
        else params.delete("section");
        return params;
      },
      { replace: true },
    );
  };

  const shared = {
    viewerToken,
    canEdit,
    eventFilter,
    eventNames,
    onEventFilterChange: setEventFilter,
  };

  return (
    <Tabs value={section} onValueChange={handleSectionChange}>
      <TabsList className="h-9 w-full max-w-sm">
        <TabsTrigger value="sponsors" className="cursor-pointer">
          Sponsors
        </TabsTrigger>
        <TabsTrigger value="payouts" className="cursor-pointer">
          Payouts
        </TabsTrigger>
      </TabsList>
      <TabsContent value="sponsors" className="mt-4">
        <SponsorLogTab {...shared} />
      </TabsContent>
      <TabsContent value="payouts" className="mt-4">
        <PayoutsTab {...shared} />
      </TabsContent>
    </Tabs>
  );
}
