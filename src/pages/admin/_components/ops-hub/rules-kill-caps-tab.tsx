import type { OpsHubTabProps } from "./types.ts";
import EventRulesTab from "./event-rules-tab.tsx";
import KillCapsTab from "./kill-caps-tab.tsx";

export default function RulesKillCapsTab(props: OpsHubTabProps) {
  return (
    <div className="space-y-10">
      <KillCapsTab {...props} />
      <EventRulesTab {...props} />
    </div>
  );
}
