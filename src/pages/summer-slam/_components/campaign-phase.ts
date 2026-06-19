export type CampaignPhase =
  | "not_configured"
  | "not_started"
  | "active"
  | "ended";

export type CampaignPublic = {
  title: string;
  description?: string;
  isActive: boolean;
  startsAt?: number;
  endsAt?: number;
  stampName: string;
  littleWheelEntryEveryStamps: number;
  bigWheelEntryEveryStamps: number;
};

export function getCampaignPhase(
  campaign: CampaignPublic | null | undefined,
  now = Date.now(),
): CampaignPhase {
  if (!campaign) return "not_configured";
  if (campaign.startsAt && now < campaign.startsAt) return "not_started";
  if (campaign.endsAt && now > campaign.endsAt) return "ended";
  if (!campaign.isActive) return "ended";
  return "active";
}

export function formatCampaignDateRange(
  campaign: Pick<CampaignPublic, "startsAt" | "endsAt"> | null | undefined,
) {
  if (!campaign?.startsAt && !campaign?.endsAt) {
    // TODO: Set startsAt/endsAt in admin when season dates are confirmed.
    return "Season dates coming soon";
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (campaign.startsAt && campaign.endsAt) {
    return `${formatter.format(campaign.startsAt)} – ${formatter.format(campaign.endsAt)}`;
  }
  if (campaign.startsAt) {
    return `Starts ${formatter.format(campaign.startsAt)}`;
  }
  return `Ends ${formatter.format(campaign.endsAt!)}`;
}

export function phaseMessage(phase: CampaignPhase) {
  switch (phase) {
    case "not_configured":
      return "Summer Slam is still being prepared. Staff are setting up quests and rewards — watch Discord for the official launch date.";
    case "not_started":
      return "The season hasn't started yet. Watch Discord for the official start date, then return here to open your passport.";
    case "ended":
      return "Summer Slam is not currently active. Passport progress may be read-only until the next season begins.";
    default:
      return null;
  }
}

export function phaseBadge(phase: CampaignPhase) {
  switch (phase) {
    case "active":
      return { label: "Live now", className: "bg-emerald-100 text-emerald-800" };
    case "not_started":
      return { label: "Coming soon", className: "bg-amber-100 text-amber-800" };
    case "ended":
      return { label: "Season closed", className: "bg-slate-200 text-slate-700" };
    default:
      return { label: "Setting up", className: "bg-slate-200 text-slate-700" };
  }
}
