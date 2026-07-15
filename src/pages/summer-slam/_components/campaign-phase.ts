export type CampaignPhase =
  | "not_configured"
  | "not_started"
  | "active"
  | "submissions_closed"
  | "ended";

export type CampaignPublic = {
  title: string;
  description?: string;
  isActive: boolean;
  startsAt?: number;
  endsAt?: number;
  /** When false, passports can be claimed after start but evidence submit is blocked. */
  submissionsEnabled?: boolean;
  stampName: string;
  littleWheelEntryEveryStamps: number;
  bigWheelEntryEveryStamps: number;
  activeQuestCount?: number;
  categoryTaglines?: {
    traveller?: string;
    competitor?: string;
    summer_spirit?: string;
    team_player?: string;
    community?: string;
    summer_legend?: string;
  };
};

export function getCampaignPhase(
  campaign: CampaignPublic | null | undefined,
  now = Date.now(),
): CampaignPhase {
  if (!campaign) return "not_configured";
  if (!campaign.isActive) return "ended";
  if (campaign.startsAt && now < campaign.startsAt) return "not_started";
  if (campaign.endsAt && now > campaign.endsAt) return "submissions_closed";
  return "active";
}

/** Legacy campaigns without the field are treated as submissions enabled. */
export function isSubmissionsSwitchOn(
  campaign: Pick<CampaignPublic, "submissionsEnabled"> | null | undefined,
): boolean {
  return campaign?.submissionsEnabled !== false;
}

/** Players can submit evidence only while the season is live and submissions are switched on. */
export function areSubmissionsOpen(
  campaign: CampaignPublic | null | undefined,
  now = Date.now(),
  options?: { adminPreview?: boolean },
): boolean {
  const phase = getCampaignPhase(campaign, now);
  if (phase === "not_started") return Boolean(options?.adminPreview);
  if (phase !== "active") return false;
  return isSubmissionsSwitchOn(campaign);
}

/**
 * Profile (avatar/birthplace) edits follow passport claim window, not the submissions switch.
 * Locked after season end.
 */
export function areProfileEditsOpen(
  campaign: CampaignPublic | null | undefined,
  now = Date.now(),
  options?: { adminPreview?: boolean },
): boolean {
  const phase = getCampaignPhase(campaign, now);
  if (phase === "not_started") return Boolean(options?.adminPreview);
  return phase === "active";
}

/** Passport entry is available once the campaign is live and has quests configured. */
export function isPassportAccessible(
  campaign: CampaignPublic | null | undefined,
  now = Date.now(),
  options?: { adminPreview?: boolean },
): boolean {
  if (!campaign) return false;
  const phase = getCampaignPhase(campaign, now);
  if (phase === "not_configured" || phase === "ended") return false;
  if (phase === "not_started" && !options?.adminPreview) return false;
  return (campaign.activeQuestCount ?? 0) > 0;
}

/** Admins can claim a passport before the season start date to verify setup. */
export function isAdminPassportPreview(
  campaign: CampaignPublic | null | undefined,
  isAdmin: boolean,
  now = Date.now(),
): boolean {
  if (!isAdmin || !campaign) return false;
  return campaign.isActive && getCampaignPhase(campaign, now) === "not_started";
}

export function formatCampaignDateRange(
  campaign: Pick<CampaignPublic, "startsAt" | "endsAt"> | null | undefined,
): string | null {
  if (!campaign?.startsAt && !campaign?.endsAt) {
    return null;
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
    case "submissions_closed":
      return "Submissions are closed for this season. You can still view your passport while staff finish reviewing evidence.";
    case "ended":
      return "Summer Slam is not currently active. Passport progress may be read-only until the next season begins.";
    default:
      return null;
  }
}

/** Status copy when passports are claimable but evidence submissions are still off. */
export function submissionsPendingMessage(
  campaign: CampaignPublic | null | undefined,
  now = Date.now(),
): string | null {
  if (getCampaignPhase(campaign, now) !== "active") return null;
  if (isSubmissionsSwitchOn(campaign)) return null;
  return "Passports are open — explore your quests. Evidence submissions will turn on soon; watch Discord for the go-ahead.";
}

export function phaseBadge(phase: CampaignPhase) {
  switch (phase) {
    case "active":
      return { label: "Live now", className: "bg-emerald-100 text-emerald-800" };
    case "not_started":
      return { label: "Coming soon", className: "bg-amber-100 text-amber-800" };
    case "submissions_closed":
      return { label: "Submissions closed", className: "bg-slate-200 text-slate-700" };
    case "ended":
      return { label: "Season closed", className: "bg-slate-200 text-slate-700" };
    default:
      return { label: "Setting up", className: "bg-slate-200 text-slate-700" };
  }
}
