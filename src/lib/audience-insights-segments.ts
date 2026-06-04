export type AudienceChartType = "gender" | "tier" | "tenure" | "events";

export const AUDIENCE_CHART_TYPES: AudienceChartType[] = [
  "gender",
  "tier",
  "tenure",
  "events",
];

const LABEL_TO_SEGMENT: Record<AudienceChartType, Record<string, string>> = {
  gender: {
    Male: "male",
    Female: "female",
    Unknown: "unknown",
  },
  tier: {
    "Tier S": "s",
    "Tier A": "a",
    "Tier B": "b",
    "Tier C": "c",
    Unassigned: "unassigned",
  },
  tenure: {
    "Under 3 months": "under3m",
    "3–6 months": "3to6m",
    "6–12 months": "6to12m",
    "1–2 years": "1to2y",
    "2+ years": "2yplus",
    Unknown: "unknown",
  },
  events: {
    "> 5 Events": "over5",
    "5 or fewer events": "fiveOrLess",
  },
};

const SEGMENT_TO_LABEL: Record<AudienceChartType, Record<string, string>> = {
  gender: {
    male: "Male",
    female: "Female",
    unknown: "Unknown",
  },
  tier: {
    s: "Tier S",
    a: "Tier A",
    b: "Tier B",
    c: "Tier C",
    unassigned: "Unassigned",
  },
  tenure: {
    under3m: "Under 3 months",
    "3to6m": "3–6 months",
    "6to12m": "6–12 months",
    "1to2y": "1–2 years",
    "2yplus": "2+ years",
    unknown: "Unknown",
  },
  events: {
    over5: "More than 5 events",
    fiveOrLess: "5 or fewer events",
  },
};

const CHART_TITLES: Record<AudienceChartType, string> = {
  gender: "Gender split",
  tier: "Tier split",
  tenure: "Member tenure",
  events: "Events played",
};

export function isAudienceChartType(value: string): value is AudienceChartType {
  return AUDIENCE_CHART_TYPES.includes(value as AudienceChartType);
}

export function labelToSegmentKey(chart: AudienceChartType, label: string): string | null {
  return LABEL_TO_SEGMENT[chart][label] ?? null;
}

export function segmentKeyToLabel(chart: AudienceChartType, segment: string): string | null {
  return SEGMENT_TO_LABEL[chart][segment] ?? null;
}

export function audienceSegmentPath(
  chart: AudienceChartType,
  segment: string,
  options?: { activeOnly?: boolean },
): string {
  const base = `/admin/audience-insights/${chart}/${segment}`;
  if (options?.activeOnly) {
    return `${base}?members=active`;
  }
  return base;
}

export function audienceSegmentPageTitle(
  chart: AudienceChartType,
  segment: string,
  options?: { activeOnly?: boolean },
): string {
  const segmentLabel = segmentKeyToLabel(chart, segment) ?? segment;
  const scope =
    chart === "tier" && options?.activeOnly ? " (active members)" : "";
  return `${CHART_TITLES[chart]} — ${segmentLabel}${scope}`;
}

export function isValidSegmentKey(chart: AudienceChartType, segment: string): boolean {
  return segment in SEGMENT_TO_LABEL[chart];
}
