import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import PageHeader from "@/components/page-header.tsx";
import RoleGate from "@/components/role-gate.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Info,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { compareTierField } from "@/lib/tier-sort.ts";

type ActionFilter =
  | "all"
  | "attention"
  | "review_required"
  | "review_move"
  | "review_recommended"
  | "optional_review"
  | "no_change";
type ConfidenceFilter = "all" | "low" | "medium" | "high";
type PveFilter = "all" | "above" | "around" | "below" | "insufficient";
type TrendFilter = "all" | "improving" | "stable" | "declining" | "insufficient";
type SortField =
  | "playerName"
  | "tier"
  | "evaluation"
  | "holistic"
  | "holisticConfidence"
  | "performanceVsExpected"
  | "performanceTrend"
  | "overall"
  | "recommendationConfidence"
  | "action";
type SortDirection = "asc" | "desc";

const CONFIDENCE_RANK: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const PVE_RANK: Record<string, number> = {
  above: 0,
  around: 1,
  below: 2,
};

const TREND_RANK: Record<string, number> = {
  improving: 0,
  stable: 1,
  declining: 2,
};

const ACTION_RANK: Record<string, number> = {
  review_required: 0,
  review_move: 1,
  review_recommended: 2,
  optional_review: 3,
  no_change: 4,
};

function Stars({ count }: { count: number }) {
  return (
    <span
      className="inline-block whitespace-nowrap text-xs tracking-tight text-amber-600 dark:text-amber-400"
      aria-label={`${count} of 5 stars`}
    >
      {"★".repeat(count)}
      <span className="text-muted-foreground/40">
        {"☆".repeat(Math.max(0, 5 - count))}
      </span>
    </span>
  );
}

function ConfidenceBadge({
  confidence,
  label,
}: {
  confidence: string;
  label: string;
}) {
  const variant =
    confidence === "low"
      ? "destructive"
      : confidence === "medium"
        ? "default"
        : "secondary";
  return (
    <Badge variant={variant} className="whitespace-nowrap">
      {label}
    </Badge>
  );
}

function ActionBadge({ action, label }: { action: string; label: string }) {
  if (action === "review_required" || action === "review_move") {
    return (
      <Badge variant="destructive" className="whitespace-nowrap">
        {label}
      </Badge>
    );
  }
  if (action === "review_recommended" || action === "optional_review") {
    return (
      <Badge
        variant="outline"
        className="whitespace-nowrap border-amber-400 text-amber-800 dark:text-amber-300"
      >
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="whitespace-nowrap">
      {label}
    </Badge>
  );
}

function FitBadge({ label }: { label: string }) {
  const isBorderline = label.startsWith("Borderline");
  const isDisagreement = label === "Review Required";
  if (isDisagreement) {
    return (
      <Badge variant="destructive" className="whitespace-nowrap">
        {label}
      </Badge>
    );
  }
  if (isBorderline) {
    return (
      <Badge
        variant="outline"
        className="whitespace-nowrap border-amber-400 text-amber-800 dark:text-amber-300"
      >
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="whitespace-nowrap">
      {label}
    </Badge>
  );
}

function PerformanceVsExpectedBadge({
  level,
  label,
}: {
  level?: string;
  label?: string;
}) {
  if (!level || !label) {
    return (
      <Badge variant="secondary" className="whitespace-nowrap">
        Insufficient data
      </Badge>
    );
  }
  if (level === "above") {
    return (
      <Badge
        variant="outline"
        className="whitespace-nowrap border-emerald-500 text-emerald-800 dark:text-emerald-300"
      >
        {label}
      </Badge>
    );
  }
  if (level === "below") {
    return (
      <Badge
        variant="outline"
        className="whitespace-nowrap border-rose-400 text-rose-800 dark:text-rose-300"
      >
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="whitespace-nowrap">
      {label}
    </Badge>
  );
}

function PerformanceTrendBadge({
  level,
  displayLabel,
}: {
  level?: string;
  displayLabel?: string;
}) {
  if (!level || !displayLabel) {
    return (
      <Badge variant="secondary" className="whitespace-nowrap">
        Insufficient data
      </Badge>
    );
  }
  if (level === "improving") {
    return (
      <Badge
        variant="outline"
        className="whitespace-nowrap border-emerald-500 text-emerald-800 dark:text-emerald-300"
      >
        {displayLabel}
      </Badge>
    );
  }
  if (level === "declining") {
    return (
      <Badge
        variant="outline"
        className="whitespace-nowrap border-rose-400 text-rose-800 dark:text-rose-300"
      >
        {displayLabel}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="whitespace-nowrap">
      {displayLabel}
    </Badge>
  );
}

function ConfidenceCell({
  stars,
  confidence,
  label,
  tooltipLines,
}: {
  stars: number;
  confidence: string;
  label: string;
  tooltipLines: string[];
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex flex-col items-start gap-1 text-left cursor-help"
        >
          <Stars count={stars} />
          <ConfidenceBadge confidence={confidence} label={label} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-1">
        {tooltipLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

function MetaLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-muted-foreground leading-snug break-words">
      {children}
    </div>
  );
}

function SortIcon({
  field,
  sortField,
  sortDirection,
}: {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}) {
  if (sortField !== field) {
    return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
  }
  return sortDirection === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" />
  );
}

function formatCenter(value: number | undefined): string {
  if (value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function TierRecommendationContent() {
  const { isModeratorOrAdmin, isLoading: isLoadingUser } = useUserRole();
  const canView = isModeratorOrAdmin;

  const data = useQuery(
    api.tierReviewConfidence.getTierReviewConfidence,
    canView && !isLoadingUser ? {} : "skip",
  );

  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [recConfidenceFilter, setRecConfidenceFilter] =
    useState<ConfidenceFilter>("all");
  const [holisticConfidenceFilter, setHolisticConfidenceFilter] =
    useState<ConfidenceFilter>("all");
  const [pveFilter, setPveFilter] = useState<PveFilter>("all");
  const [trendFilter, setTrendFilter] = useState<TrendFilter>("all");
  const [sortField, setSortField] = useState<SortField>("action");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [displayLimit, setDisplayLimit] = useState(75);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(
        field === "playerName" ||
          field === "action" ||
          field === "recommendationConfidence" ||
          field === "holisticConfidence" ||
          field === "performanceVsExpected" ||
          field === "performanceTrend"
          ? "asc"
          : "desc",
      );
    }
  };

  const filtered = useMemo(() => {
    if (!data?.reviews) return [];

    let rows = data.reviews;

    if (tierFilter !== "all") {
      rows = rows.filter((r) => r.currentTier === tierFilter);
    }

    if (actionFilter === "attention") {
      rows = rows.filter((r) => r.action !== "no_change");
    } else if (actionFilter !== "all") {
      rows = rows.filter((r) => r.action === actionFilter);
    }

    if (recConfidenceFilter !== "all") {
      rows = rows.filter((r) => r.recommendationConfidence === recConfidenceFilter);
    }

    if (holisticConfidenceFilter !== "all") {
      rows = rows.filter((r) => r.holisticConfidence === holisticConfidenceFilter);
    }

    if (pveFilter === "insufficient") {
      rows = rows.filter((r) => !r.performanceVsExpected);
    } else if (pveFilter !== "all") {
      rows = rows.filter((r) => r.performanceVsExpected === pveFilter);
    }

    if (trendFilter === "insufficient") {
      rows = rows.filter((r) => !r.performanceTrend);
    } else if (trendFilter !== "all") {
      rows = rows.filter((r) => r.performanceTrend === trendFilter);
    }

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.discordUsername.toLowerCase().includes(term) ||
          r.epicUsername.toLowerCase().includes(term) ||
          (r.nickname && r.nickname.toLowerCase().includes(term)),
      );
    }

    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "playerName":
          cmp = a.discordUsername.localeCompare(b.discordUsername);
          break;
        case "tier":
          cmp = compareTierField(a.currentTier, b.currentTier, "asc");
          break;
        case "evaluation":
          cmp = a.evaluationScore - b.evaluationScore;
          break;
        case "holistic":
          cmp = a.adjustedHolisticScore - b.adjustedHolisticScore;
          break;
        case "holisticConfidence":
          cmp =
            (CONFIDENCE_RANK[a.holisticConfidence] ?? 9) -
            (CONFIDENCE_RANK[b.holisticConfidence] ?? 9);
          break;
        case "performanceVsExpected":
          cmp =
            (PVE_RANK[a.performanceVsExpected ?? ""] ?? 9) -
            (PVE_RANK[b.performanceVsExpected ?? ""] ?? 9);
          break;
        case "performanceTrend":
          cmp =
            (TREND_RANK[a.performanceTrend ?? ""] ?? 9) -
            (TREND_RANK[b.performanceTrend ?? ""] ?? 9);
          break;
        case "overall":
          cmp = a.overallFitLabel.localeCompare(b.overallFitLabel);
          break;
        case "recommendationConfidence":
          cmp =
            (CONFIDENCE_RANK[a.recommendationConfidence] ?? 9) -
            (CONFIDENCE_RANK[b.recommendationConfidence] ?? 9);
          break;
        case "action":
          cmp = (ACTION_RANK[a.action] ?? 9) - (ACTION_RANK[b.action] ?? 9);
          if (cmp === 0) {
            cmp =
              (CONFIDENCE_RANK[a.recommendationConfidence] ?? 9) -
              (CONFIDENCE_RANK[b.recommendationConfidence] ?? 9);
          }
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [
    actionFilter,
    data?.reviews,
    holisticConfidenceFilter,
    pveFilter,
    recConfidenceFilter,
    search,
    sortDirection,
    sortField,
    tierFilter,
    trendFilter,
  ]);

  const visible = filtered.slice(0, displayLimit);
  const hasMore = filtered.length > displayLimit;

  if (isLoadingUser) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <RoleGate
      allowed={canView}
      title="Moderator access required"
      description="Tier recommendations are available to moderators and admins."
    >
      <div className="space-y-6">
        <PageHeader
          title="Tier Recommendation"
          description="Decision-support signals: Evaluation, Holistic, Performance vs Expected, Recent Trend, and a combined recommendation. Does not auto-tier."
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/stats">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Analytics Hub
              </Link>
            </Button>
          }
        />

        <Card className="border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-sky-950 dark:text-sky-100">
              <ShieldCheck className="h-4 w-4" />
              Decision-support signals
            </CardTitle>
            <CardDescription className="text-sky-900/80 dark:text-sky-200/80 space-y-1.5">
              <p>
                <strong className="text-sky-950 dark:text-sky-100">Holistic Confidence</strong> —
                reliability after comparing actual teammates to what ZBD tier
                restrictions (and historical mixes) predict for evaluation ability.
              </p>
              <p>
                <strong className="text-sky-950 dark:text-sky-100">Performance vs Expected</strong> —
                whether the player&apos;s teams outperform or underperform historically
                similar-strength teams (learned from match data; not individual kill attribution).
              </p>
              <p>
                <strong className="text-sky-950 dark:text-sky-100">Recent Trend</strong> —
                whether recent form is improving, stable, or declining versus the
                player&apos;s own earlier placement/kills baseline (not team strength).
              </p>
              <p>
                <strong className="text-sky-950 dark:text-sky-100">Recommendation Confidence</strong> —
                certainty in the suggested action after weighing those signals.
              </p>
            </CardDescription>
          </CardHeader>
        </Card>

        {data === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <SummaryTile
                label="Compared"
                value={data.summary.totalCompared}
                hint="Have both scores"
              />
              <SummaryTile
                label="Needs attention"
                value={data.summary.needsAttention}
                hint="Any action ≠ No Change"
                emphasize
              />
              <SummaryTile
                label="Above expected"
                value={data.summary.byPerformanceVsExpected.above}
                hint="Teams beat strength peers"
              />
              <SummaryTile
                label="Improving"
                value={data.summary.byPerformanceTrend.improving}
                hint="Above own baseline"
              />
              <SummaryTile
                label="Declining"
                value={data.summary.byPerformanceTrend.declining}
                hint="Below own baseline"
              />
              <SummaryTile
                label="No change"
                value={data.summary.byAction.no_change}
              />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Learned centers & teammate expectations</CardTitle>
                <CardDescription>
                  Score medians by assigned tier, plus expected teammate strength by
                  evaluation ability (restriction prior blended with observed history).
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Metric</TableHead>
                        <TableHead>S</TableHead>
                        <TableHead>A</TableHead>
                        <TableHead>B</TableHead>
                        <TableHead>C</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Evaluation median</TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(data.summary.evaluationCenters.S)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(data.summary.evaluationCenters.A)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(data.summary.evaluationCenters.B)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(data.summary.evaluationCenters.C)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Holistic median (raw)</TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(data.summary.holisticCenters.S)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(data.summary.holisticCenters.A)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(data.summary.holisticCenters.B)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(data.summary.holisticCenters.C)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">
                          Holistic median (adjusted)
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(data.summary.adjustedHolisticCenters.S)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(data.summary.adjustedHolisticCenters.A)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(data.summary.adjustedHolisticCenters.B)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(data.summary.adjustedHolisticCenters.C)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">
                          Expected teammate (ability)
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(
                            data.summary.expectedTeammateStrengthByAbility.S,
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(
                            data.summary.expectedTeammateStrengthByAbility.A,
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(
                            data.summary.expectedTeammateStrengthByAbility.B,
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCenter(
                            data.summary.expectedTeammateStrengthByAbility.C,
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium text-muted-foreground">
                          Restriction prior only
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatCenter(data.summary.restrictionPriorsByAbility.S)}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatCenter(data.summary.restrictionPriorsByAbility.A)}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatCenter(data.summary.restrictionPriorsByAbility.B)}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatCenter(data.summary.restrictionPriorsByAbility.C)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Teammate strength scale: S=4, A=3, B=2, C=1. Adjustment uses ~
                  {data.summary.holisticPointsPerTeammateStrength.toFixed(1)}{" "}
                  holistic points per teammate-strength unit of residual (from raw
                  tier-center gaps). Stored raw holistic scores are not modified.
                </p>
              </CardContent>
            </Card>

            {data.summary.insufficientEvaluation > 0 && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {data.summary.insufficientEvaluation} players with a holistic score
                lack an evaluation score and are omitted.
              </p>
            )}
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Performance vs Expected uses {data.summary.teamStrengthSampleCount}{" "}
              team-event samples across {data.summary.teamStrengthExpectationBuckets}{" "}
              strength buckets (roster evaluation scores as of each event). Rebuild the
              tier re-evaluation cache after deploying so samples refresh.
            </p>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="text-base">Players</CardTitle>
                    <CardDescription>
                      Showing {visible.length} of {filtered.length}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-8 w-48"
                        placeholder="Search player…"
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setDisplayLimit(75);
                        }}
                      />
                    </div>
                    <select
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={tierFilter}
                      onChange={(e) => {
                        setTierFilter(e.target.value);
                        setDisplayLimit(75);
                      }}
                    >
                      <option value="all">All current tiers</option>
                      <option value="S">Current S</option>
                      <option value="A">Current A</option>
                      <option value="B">Current B</option>
                      <option value="C">Current C</option>
                    </select>
                    <select
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={actionFilter}
                      onChange={(e) => {
                        setActionFilter(e.target.value as ActionFilter);
                        setDisplayLimit(75);
                      }}
                    >
                      <option value="all">All actions</option>
                      <option value="attention">Needs attention</option>
                      <option value="review_required">Review required</option>
                      <option value="review_move">Review move</option>
                      <option value="review_recommended">Review recommended</option>
                      <option value="optional_review">Optional review</option>
                      <option value="no_change">No change</option>
                    </select>
                    <select
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={holisticConfidenceFilter}
                      onChange={(e) => {
                        setHolisticConfidenceFilter(
                          e.target.value as ConfidenceFilter,
                        );
                        setDisplayLimit(75);
                      }}
                    >
                      <option value="all">All holistic conf.</option>
                      <option value="low">Low holistic</option>
                      <option value="medium">Medium holistic</option>
                      <option value="high">High holistic</option>
                    </select>
                    <select
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={pveFilter}
                      onChange={(e) => {
                        setPveFilter(e.target.value as PveFilter);
                        setDisplayLimit(75);
                      }}
                    >
                      <option value="all">All vs expected</option>
                      <option value="above">Above expected</option>
                      <option value="around">Around expected</option>
                      <option value="below">Below expected</option>
                      <option value="insufficient">Insufficient data</option>
                    </select>
                    <select
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={trendFilter}
                      onChange={(e) => {
                        setTrendFilter(e.target.value as TrendFilter);
                        setDisplayLimit(75);
                      }}
                    >
                      <option value="all">All trends</option>
                      <option value="improving">Improving</option>
                      <option value="stable">Stable</option>
                      <option value="declining">Declining</option>
                      <option value="insufficient">Insufficient data</option>
                    </select>
                    <select
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={recConfidenceFilter}
                      onChange={(e) => {
                        setRecConfidenceFilter(e.target.value as ConfidenceFilter);
                        setDisplayLimit(75);
                      }}
                    >
                      <option value="all">All rec. conf.</option>
                      <option value="low">Low rec.</option>
                      <option value="medium">Medium rec.</option>
                      <option value="high">High rec.</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <TooltipProvider delayDuration={200}>
                  <div className="rounded-md border overflow-x-auto">
                    <Table className="min-w-[1100px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[140px]">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1"
                              onClick={() => toggleSort("playerName")}
                            >
                              Player
                              <SortIcon
                                field="playerName"
                                sortField={sortField}
                                sortDirection={sortDirection}
                              />
                            </button>
                          </TableHead>
                          <TableHead className="w-[72px]">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1"
                              onClick={() => toggleSort("tier")}
                            >
                              Tier
                              <SortIcon
                                field="tier"
                                sortField={sortField}
                                sortDirection={sortDirection}
                              />
                            </button>
                          </TableHead>
                          <TableHead className="w-[130px]">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1"
                              onClick={() => toggleSort("evaluation")}
                            >
                              Evaluation
                              <SortIcon
                                field="evaluation"
                                sortField={sortField}
                                sortDirection={sortDirection}
                              />
                            </button>
                          </TableHead>
                          <TableHead className="w-[160px]">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1"
                              onClick={() => toggleSort("holistic")}
                            >
                              Holistic
                              <SortIcon
                                field="holistic"
                                sortField={sortField}
                                sortDirection={sortDirection}
                              />
                            </button>
                          </TableHead>
                          <TableHead className="w-[100px]">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1"
                              onClick={() => toggleSort("holisticConfidence")}
                            >
                              Hol. conf.
                              <SortIcon
                                field="holisticConfidence"
                                sortField={sortField}
                                sortDirection={sortDirection}
                              />
                            </button>
                          </TableHead>
                          <TableHead className="w-[150px]">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1"
                              onClick={() => toggleSort("performanceVsExpected")}
                            >
                              Vs expected
                              <SortIcon
                                field="performanceVsExpected"
                                sortField={sortField}
                                sortDirection={sortDirection}
                              />
                            </button>
                          </TableHead>
                          <TableHead className="w-[130px]">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1"
                              onClick={() => toggleSort("performanceTrend")}
                            >
                              Trend
                              <SortIcon
                                field="performanceTrend"
                                sortField={sortField}
                                sortDirection={sortDirection}
                              />
                            </button>
                          </TableHead>
                          <TableHead className="w-[130px]">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1"
                              onClick={() => toggleSort("overall")}
                            >
                              Overall
                              <SortIcon
                                field="overall"
                                sortField={sortField}
                                sortDirection={sortDirection}
                              />
                            </button>
                          </TableHead>
                          <TableHead className="w-[100px]">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1"
                              onClick={() =>
                                toggleSort("recommendationConfidence")
                              }
                            >
                              Rec. conf.
                              <SortIcon
                                field="recommendationConfidence"
                                sortField={sortField}
                                sortDirection={sortDirection}
                              />
                            </button>
                          </TableHead>
                          <TableHead className="min-w-[180px]">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1"
                              onClick={() => toggleSort("action")}
                            >
                              Action
                              <SortIcon
                                field="action"
                                sortField={sortField}
                                sortDirection={sortDirection}
                              />
                            </button>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visible.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={10}
                              className="text-center text-muted-foreground py-10"
                            >
                              No players match these filters.
                            </TableCell>
                          </TableRow>
                        ) : (
                          visible.map((row) => {
                            const holConfTips = [
                              ...(row.holisticConfidenceReasons.length > 0
                                ? row.holisticConfidenceReasons
                                : [row.holisticConfidenceSummary]),
                            ];
                            if (
                              row.actualTeammateStrength !== undefined &&
                              row.expectedTeammateStrength !== undefined
                            ) {
                              holConfTips.push(
                                `Teammates ${row.actualTeammateStrength.toFixed(2)} vs expected ${row.expectedTeammateStrength.toFixed(2)}`,
                              );
                            }
                            if (row.compositionBiasLabel) {
                              holConfTips.push(row.compositionBiasLabel);
                            }

                            const pveTips: string[] = [];
                            if (row.performanceVsExpectedSummary) {
                              pveTips.push(row.performanceVsExpectedSummary);
                            }
                            if (
                              row.expectedAvgPlacement !== undefined &&
                              row.actualAvgPlacement !== undefined
                            ) {
                              pveTips.push(
                                `Placement — expected ${row.expectedAvgPlacement.toFixed(1)}, actual ${row.actualAvgPlacement.toFixed(1)}`,
                              );
                            }
                            if (
                              row.expectedAvgTeamKills !== undefined &&
                              row.actualAvgTeamKills !== undefined
                            ) {
                              pveTips.push(
                                `Team kills — expected ${row.expectedAvgTeamKills.toFixed(1)}, actual ${row.actualAvgTeamKills.toFixed(1)}`,
                              );
                            }
                            if (row.performanceVsExpectedEvents !== undefined) {
                              pveTips.push(
                                `${row.performanceVsExpectedEvents} team-events compared`,
                              );
                            }
                            if (pveTips.length === 0) {
                              pveTips.push(
                                "Rebuild tier re-evaluation cache to populate team strength samples.",
                              );
                            }

                            const trendTips: string[] = [
                              ...(row.performanceTrendReasons ?? []),
                            ];
                            if (
                              row.performanceTrendRecentEvents !== undefined &&
                              row.performanceTrendBaselineEvents !== undefined
                            ) {
                              trendTips.push(
                                `Compared last ${row.performanceTrendRecentEvents} events to prior ${row.performanceTrendBaselineEvents}.`,
                              );
                            }
                            if (trendTips.length === 0) {
                              trendTips.push(
                                "Need at least 16 dated event samples after a cache rebuild (placement history with event dates).",
                              );
                            }

                            return (
                              <TableRow key={row.playerId} className="align-top">
                                <TableCell className="align-top">
                                  <Link
                                    to={`/player/${encodeURIComponent(row.discordUsername)}`}
                                    className="font-medium hover:underline"
                                  >
                                    {row.discordUsername}
                                  </Link>
                                  <MetaLine>{row.epicUsername}</MetaLine>
                                </TableCell>
                                <TableCell className="align-top">
                                  <Badge variant="outline">{row.currentTier}</Badge>
                                </TableCell>
                                <TableCell className="align-top">
                                  <div className="flex flex-col items-start gap-1">
                                    <FitBadge label={row.evaluationFitLabel} />
                                    <MetaLine>
                                      {Math.round(row.evaluationScore)} pts
                                    </MetaLine>
                                  </div>
                                </TableCell>
                                <TableCell className="align-top">
                                  <div className="flex flex-col items-start gap-1">
                                    <FitBadge label={row.holisticFitLabel} />
                                    <MetaLine>
                                      {row.adjustedHolisticScore.toFixed(1)}
                                      {row.holisticAdjustmentDelta !== 0
                                        ? ` (${row.holisticAdjustmentDelta > 0 ? "+" : ""}${row.holisticAdjustmentDelta.toFixed(1)})`
                                        : ""}
                                    </MetaLine>
                                    <MetaLine>
                                      raw {row.holisticScore.toFixed(1)} ·{" "}
                                      {row.totalEvents} events
                                    </MetaLine>
                                    {row.rawHolisticFitLabel !==
                                      row.holisticFitLabel && (
                                      <MetaLine>
                                        Raw: {row.rawHolisticFitLabel}
                                      </MetaLine>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="align-top">
                                  <ConfidenceCell
                                    stars={row.holisticConfidenceStars}
                                    confidence={row.holisticConfidence}
                                    label={row.holisticConfidenceLabel}
                                    tooltipLines={holConfTips}
                                  />
                                </TableCell>
                                <TableCell className="align-top">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex flex-col items-start gap-1 cursor-help">
                                        <PerformanceVsExpectedBadge
                                          level={row.performanceVsExpected}
                                          label={row.performanceVsExpectedLabel}
                                        />
                                        {row.actualAvgPlacement !== undefined &&
                                          row.expectedAvgPlacement !==
                                            undefined && (
                                            <MetaLine>
                                              Place {row.actualAvgPlacement.toFixed(1)}{" "}
                                              vs {row.expectedAvgPlacement.toFixed(1)}
                                            </MetaLine>
                                          )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs space-y-1">
                                      {pveTips.map((line) => (
                                        <p key={line}>{line}</p>
                                      ))}
                                    </TooltipContent>
                                  </Tooltip>
                                </TableCell>
                                <TableCell className="align-top">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="cursor-help">
                                        <PerformanceTrendBadge
                                          level={row.performanceTrend}
                                          displayLabel={
                                            row.performanceTrendDisplayLabel
                                          }
                                        />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs space-y-1">
                                      {trendTips.map((line) => (
                                        <p key={line}>{line}</p>
                                      ))}
                                    </TooltipContent>
                                  </Tooltip>
                                </TableCell>
                                <TableCell className="align-top">
                                  <FitBadge label={row.overallFitLabel} />
                                </TableCell>
                                <TableCell className="align-top">
                                  <ConfidenceCell
                                    stars={row.stars}
                                    confidence={row.recommendationConfidence}
                                    label={row.recommendationConfidenceLabel}
                                    tooltipLines={[row.reason]}
                                  />
                                </TableCell>
                                <TableCell className="align-top">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex flex-col items-start gap-1 max-w-[220px] cursor-help">
                                        <ActionBadge
                                          action={row.action}
                                          label={row.actionLabel}
                                        />
                                        <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                                          {row.reason}
                                        </p>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-sm">
                                      <p>{row.reason}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TooltipProvider>

                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setDisplayLimit((n) => n + 75)}
                    >
                      Load more ({filtered.length - displayLimit} remaining)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">How this works</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Evaluation and holistic scores are matched to learned tier centers.
                  Holistic Confidence then asks whether that performance score is a fair
                  individual signal — using teammate strength gap vs evaluation level,
                  consistent-duo concentration, and event sample size.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <strong className="text-foreground">Adjusted holistic</strong> nudges the
                    raw score using actual vs expected teammates under Duos/Trios/Squads
                    restrictions. Stronger-than-expected teams reduce the adjusted score;
                    weaker-than-expected teams raise it.
                  </li>
                  <li>
                    <strong className="text-foreground">Performance vs Expected</strong> compares
                    each player&apos;s teams to historically similar-strength teams (event-time
                    evaluation scores).
                  </li>
                  <li>
                    <strong className="text-foreground">Recent Trend</strong> compares the
                    player&apos;s recent placements and kills to their own earlier baseline.
                    It does not use team strength or Performance vs Expected.
                  </li>
                  <li>
                    <strong className="text-foreground">Best-fit / recommendations</strong> use
                    the adjusted score plus vs-expected and trend context. Raw holistic stays
                    unchanged in the cache.
                  </li>
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </RoleGate>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: number;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <Card className={emphasize ? "border-amber-300 dark:border-amber-800" : undefined}>
      <CardContent className="py-3 px-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? (
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function TierReviewConfidencePage() {
  return (
    <AdminPageLayout
      skipHeader
      requireModerator
      authTitle="Sign in to access tier recommendations"
    >
      <TierRecommendationContent />
    </AdminPageLayout>
  );
}
