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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Info,
  Search,
  ShieldCheck,
} from "lucide-react";
import { compareTierField } from "@/lib/tier-sort.ts";

type ConfidenceFilter = "all" | "low" | "moderate" | "high" | "very_high" | "attention";
type SortField =
  | "playerName"
  | "tier"
  | "evaluation"
  | "holistic"
  | "confidence"
  | "gap";
type SortDirection = "asc" | "desc";

const CONFIDENCE_RANK: Record<string, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  very_high: 3,
};

function Stars({ count }: { count: number }) {
  return (
    <span className="tracking-tight text-amber-600 dark:text-amber-400" aria-label={`${count} of 5 stars`}>
      {"★".repeat(count)}
      <span className="text-muted-foreground/40">{"☆".repeat(Math.max(0, 5 - count))}</span>
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
      : confidence === "moderate"
        ? "default"
        : "secondary";
  return <Badge variant={variant}>{label}</Badge>;
}

function RecommendationBadge({
  recommendation,
  label,
}: {
  recommendation: string;
  label: string;
}) {
  if (recommendation === "review_required") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  if (
    recommendation === "borderline_promotion" ||
    recommendation === "borderline_demotion"
  ) {
    return (
      <Badge
        variant="outline"
        className="border-amber-400 text-amber-800 dark:text-amber-300"
      >
        {label}
      </Badge>
    );
  }
  return <Badge variant="secondary">{label}</Badge>;
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
  if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
  return sortDirection === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" />
  );
}

function TierReviewConfidenceContent() {
  const { isModeratorOrAdmin, isLoading: isLoadingUser } = useUserRole();
  const canView = isModeratorOrAdmin;

  const data = useQuery(
    api.tierReviewConfidence.getTierReviewConfidence,
    canView && !isLoadingUser ? {} : "skip",
  );

  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [sortField, setSortField] = useState<SortField>("confidence");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [displayLimit, setDisplayLimit] = useState(75);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "playerName" ? "asc" : "desc");
      if (field === "confidence") setSortDirection("asc");
    }
  };

  const filtered = useMemo(() => {
    if (!data?.reviews) return [];

    let rows = data.reviews;

    if (tierFilter !== "all") {
      rows = rows.filter((r) => r.currentTier === tierFilter);
    }

    if (confidenceFilter === "attention") {
      rows = rows.filter(
        (r) => r.confidence === "low" || r.confidence === "moderate",
      );
    } else if (confidenceFilter !== "all") {
      rows = rows.filter((r) => r.confidence === confidenceFilter);
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
          cmp = a.evaluationPercentile - b.evaluationPercentile;
          break;
        case "holistic":
          cmp = a.holisticPercentile - b.holisticPercentile;
          break;
        case "confidence":
          cmp =
            (CONFIDENCE_RANK[a.confidence] ?? 9) -
            (CONFIDENCE_RANK[b.confidence] ?? 9);
          if (cmp === 0) cmp = b.percentileGap - a.percentileGap;
          break;
        case "gap":
          cmp = a.percentileGap - b.percentileGap;
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [confidenceFilter, data?.reviews, search, sortDirection, sortField, tierFilter]);

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
      description="Tier review confidence is available to moderators and admins."
    >
      <div className="space-y-6">
        <PageHeader
          title="Tier Review Confidence"
          description="Compare evaluation placement vs ZBD performance within each tier. Surfaces who is clearly placed, borderline, or worth discussing — without auto-changing tiers."
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
              Review prioritisation — not auto-tiering
            </CardTitle>
            <CardDescription className="text-sky-900/80 dark:text-sky-200/80">
              Relative within-tier position for both metrics. Agreement raises confidence;
              disagreement or shared proximity to a tier boundary flags discussion. Final
              decisions always stay with admins.
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
                hint="Low + Moderate"
                emphasize
              />
              <SummaryTile label="Low" value={data.summary.byConfidence.low} />
              <SummaryTile label="Moderate" value={data.summary.byConfidence.moderate} />
              <SummaryTile label="High" value={data.summary.byConfidence.high} />
              <SummaryTile
                label="Very High"
                value={data.summary.byConfidence.very_high}
              />
            </div>

            {data.summary.insufficientEvaluation > 0 && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {data.summary.insufficientEvaluation} players with a holistic score lack an
                evaluation score and are omitted from confidence.
              </p>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle className="text-base">Players</CardTitle>
                    <CardDescription>
                      Showing {visible.length} of {filtered.length}
                      {confidenceFilter === "attention"
                        ? " needing attention"
                        : confidenceFilter === "all"
                          ? " with holistic scores"
                          : ""}
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
                      <option value="all">All tiers</option>
                      <option value="S">S</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                    </select>
                    <select
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={confidenceFilter}
                      onChange={(e) => {
                        setConfidenceFilter(e.target.value as ConfidenceFilter);
                        setDisplayLimit(75);
                      }}
                    >
                      <option value="all">All confidence</option>
                      <option value="attention">Needs attention</option>
                      <option value="low">Low only</option>
                      <option value="moderate">Moderate only</option>
                      <option value="high">High only</option>
                      <option value="very_high">Very High only</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
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
                        <TableHead>
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
                        <TableHead>
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
                        <TableHead>
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
                        <TableHead>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1"
                            onClick={() => toggleSort("confidence")}
                          >
                            Confidence
                            <SortIcon
                              field="confidence"
                              sortField={sortField}
                              sortDirection={sortDirection}
                            />
                          </button>
                        </TableHead>
                        <TableHead>Recommendation</TableHead>
                        <TableHead>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1"
                                  onClick={() => toggleSort("gap")}
                                >
                                  Gap
                                  <SortIcon
                                    field="gap"
                                    sortField={sortField}
                                    sortDirection={sortDirection}
                                  />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Absolute percentile difference between evaluation and holistic
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                            No players match these filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        visible.map((row) => (
                          <TableRow key={row.playerId}>
                            <TableCell>
                              <Link
                                to={`/player/${encodeURIComponent(row.discordUsername)}`}
                                className="font-medium hover:underline"
                              >
                                {row.discordUsername}
                              </Link>
                              <div className="text-xs text-muted-foreground">
                                {row.epicUsername}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{row.currentTier}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{row.evaluationLabel}</div>
                              <div className="text-xs text-muted-foreground">
                                {Math.round(row.evaluationScore)} pts
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{row.holisticLabel}</div>
                              <div className="text-xs text-muted-foreground">
                                {row.holisticScore.toFixed(1)} · {row.totalEvents} events
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1 items-start">
                                <Stars count={row.stars} />
                                <ConfidenceBadge
                                  confidence={row.confidence}
                                  label={row.confidenceLabel}
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1 max-w-[14rem]">
                                <RecommendationBadge
                                  recommendation={row.recommendation}
                                  label={row.recommendationLabel}
                                />
                                <p className="text-xs text-muted-foreground leading-snug">
                                  {row.reason}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="tabular-nums text-sm text-muted-foreground">
                              {Math.round(row.percentileGap)} pts
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

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
                <CardTitle className="text-base">How confidence is decided</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Each player is ranked <em>within their current tier</em> for evaluation score
                  and for holistic score. Raw scores are never compared directly.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    <strong className="text-foreground">Very High / High</strong> — both systems
                    agree the player sits comfortably in the tier. No review.
                  </li>
                  <li>
                    <strong className="text-foreground">Moderate</strong> — both agree the player
                    is near an actionable boundary (not top of S or bottom of C). Optional
                    discussion.
                  </li>
                  <li>
                    <strong className="text-foreground">Low</strong> — systems disagree
                    substantially. Review recommended.
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
        {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export default function TierReviewConfidencePage() {
  return (
    <AdminPageLayout
      skipHeader
      requireModerator
      authTitle="Sign in to access tier review confidence"
    >
      <TierReviewConfidenceContent />
    </AdminPageLayout>
  );
}
