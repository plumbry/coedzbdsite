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
type SortField =
  | "playerName"
  | "tier"
  | "evaluation"
  | "holistic"
  | "holisticConfidence"
  | "overall"
  | "recommendationConfidence"
  | "action";
type SortDirection = "asc" | "desc";

const CONFIDENCE_RANK: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
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
      className="tracking-tight text-amber-600 dark:text-amber-400"
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
  return <Badge variant={variant}>{label}</Badge>;
}

function ActionBadge({ action, label }: { action: string; label: string }) {
  if (action === "review_required" || action === "review_move") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  if (action === "review_recommended" || action === "optional_review") {
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

function FitBadge({ label }: { label: string }) {
  const isBorderline = label.startsWith("Borderline");
  const isDisagreement = label === "Review Required";
  if (isDisagreement) {
    return <Badge variant="destructive">{label}</Badge>;
  }
  if (isBorderline) {
    return (
      <Badge
        variant="outline"
        className="border-amber-400 text-amber-800 dark:text-amber-300"
      >
        {label}
      </Badge>
    );
  }
  return <Badge variant="outline">{label}</Badge>;
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
          field === "holisticConfidence"
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
          cmp = a.holisticScore - b.holisticScore;
          break;
        case "holisticConfidence":
          cmp =
            (CONFIDENCE_RANK[a.holisticConfidence] ?? 9) -
            (CONFIDENCE_RANK[b.holisticConfidence] ?? 9);
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
    recConfidenceFilter,
    search,
    sortDirection,
    sortField,
    tierFilter,
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
          description="Best-fit from evaluation and holistic scores. Holistic Confidence flags when teammate strength or duo concentration makes performance less trustworthy."
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
              Two confidence signals
            </CardTitle>
            <CardDescription className="text-sky-900/80 dark:text-sky-200/80">
              <strong className="text-sky-950 dark:text-sky-100">Holistic Confidence</strong> —
              how reliable the performance score is (teammate gap vs evaluation ability, duo
              share, sample size).{" "}
              <strong className="text-sky-950 dark:text-sky-100">Recommendation Confidence</strong> —
              how certain the engine is in its action after reliability weighting. Assigned
              tier only affects the final action.
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
                label="Low holistic conf."
                value={data.summary.byHolisticConfidence.low}
                hint="Teammate / sample risk"
              />
              <SummaryTile
                label="Review move"
                value={data.summary.byAction.review_move}
              />
              <SummaryTile
                label="Review recommended"
                value={data.summary.byAction.review_recommended}
              />
              <SummaryTile
                label="No change"
                value={data.summary.byAction.no_change}
              />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Learned tier centers</CardTitle>
                <CardDescription>
                  Median scores by currently assigned tier — classification anchors.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
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
                        <TableCell className="font-medium">Evaluation</TableCell>
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
                        <TableCell className="font-medium">Holistic</TableCell>
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
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {data.summary.insufficientEvaluation > 0 && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {data.summary.insufficientEvaluation} players with a holistic score
                lack an evaluation score and are omitted.
              </p>
            )}

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
                            Current
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
                            onClick={() => toggleSort("holisticConfidence")}
                          >
                            Holistic conf.
                            <SortIcon
                              field="holisticConfidence"
                              sortField={sortField}
                              sortDirection={sortDirection}
                            />
                          </button>
                        </TableHead>
                        <TableHead>
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
                        <TableHead>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1"
                            onClick={() => toggleSort("recommendationConfidence")}
                          >
                            Rec. conf.
                            <SortIcon
                              field="recommendationConfidence"
                              sortField={sortField}
                              sortDirection={sortDirection}
                            />
                          </button>
                        </TableHead>
                        <TableHead>
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
                            colSpan={8}
                            className="text-center text-muted-foreground py-10"
                          >
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
                              <div className="space-y-1">
                                <FitBadge label={row.evaluationFitLabel} />
                                <div className="text-xs text-muted-foreground">
                                  {Math.round(row.evaluationScore)} pts
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <FitBadge label={row.holisticFitLabel} />
                                <div className="text-xs text-muted-foreground">
                                  {row.holisticScore.toFixed(1)} · {row.totalEvents}{" "}
                                  events
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1 max-w-[12rem]">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex flex-col gap-1 items-start cursor-help">
                                        <Stars count={row.holisticConfidenceStars} />
                                        <ConfidenceBadge
                                          confidence={row.holisticConfidence}
                                          label={row.holisticConfidenceLabel}
                                        />
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs space-y-1">
                                      {(row.holisticConfidenceReasons.length > 0
                                        ? row.holisticConfidenceReasons
                                        : [row.holisticConfidenceSummary]
                                      ).map((line) => (
                                        <p key={line}>{line}</p>
                                      ))}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <p className="text-xs text-muted-foreground leading-snug">
                                  {row.holisticConfidenceSummary}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <FitBadge label={row.overallFitLabel} />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1 items-start">
                                <Stars count={row.stars} />
                                <ConfidenceBadge
                                  confidence={row.recommendationConfidence}
                                  label={row.recommendationConfidenceLabel}
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1 max-w-[15rem]">
                                <ActionBadge
                                  action={row.action}
                                  label={row.actionLabel}
                                />
                                <p className="text-xs text-muted-foreground leading-snug">
                                  {row.reason}
                                </p>
                              </div>
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
                    <strong className="text-foreground">High holistic confidence + disagreement</strong>{" "}
                    — Review Required, high recommendation confidence (meaningful conflict).
                  </li>
                  <li>
                    <strong className="text-foreground">Low holistic confidence + disagreement</strong>{" "}
                    — Review Recommended; lean on evaluation; lower recommendation confidence.
                  </li>
                  <li>
                    <strong className="text-foreground">Holistic Confidence</strong> uses evaluation
                    ability (not assigned tier), teammate strength gap, duo concentration, and
                    sample size. The Holistic Score itself is unchanged.
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
