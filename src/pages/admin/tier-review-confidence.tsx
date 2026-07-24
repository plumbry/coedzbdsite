import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
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
  FileJson,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { compareTierField } from "@/lib/tier-sort.ts";

type ActionFilter =
  | "all"
  | "attention"
  | "review_recommended"
  | "optional_review"
  | "no_change";
type ConfidenceFilter = "all" | "low" | "medium" | "high";
type SortField =
  | "playerName"
  | "tier"
  | "evaluation"
  | "ttConclusion"
  | "overall"
  | "recommendationConfidence"
  | "action";
type SortDirection = "asc" | "desc";

const CONFIDENCE_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };
const ACTION_RANK: Record<string, number> = {
  review_recommended: 0,
  optional_review: 1,
  no_change: 2,
};

function Stars({ count }: { count: number }) {
  return (
    <span className="inline-block whitespace-nowrap text-xs tracking-tight text-amber-600 dark:text-amber-400">
      {"★".repeat(count)}
      <span className="text-muted-foreground/40">{"☆".repeat(Math.max(0, 5 - count))}</span>
    </span>
  );
}

function ActionBadge({ action, label }: { action: string; label: string }) {
  if (action === "review_recommended") {
    return (
      <Badge variant="outline" className="whitespace-nowrap border-amber-400 text-amber-800 dark:text-amber-300">
        {label}
      </Badge>
    );
  }
  if (action === "optional_review") {
    return (
      <Badge variant="outline" className="whitespace-nowrap">
        {label}
      </Badge>
    );
  }
  return <Badge variant="secondary" className="whitespace-nowrap">{label}</Badge>;
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
  return sortDirection === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
}

function TierRecommendationContent() {
  const { isModeratorOrAdmin, isLoading: isLoadingUser } = useUserRole();
  const canView = isModeratorOrAdmin;
  const importInputRef = useRef<HTMLInputElement>(null);

  const data = useQuery(
    api.tierReviewConfidence.getTierReviewConfidence,
    canView && !isLoadingUser ? {} : "skip",
  );
  const ttImportStatus = useQuery(
    api.ttReviewMetrics.getTtReviewMetricsImportStatus,
    canView && !isLoadingUser ? {} : "skip",
  );
  const importTtReviewMetrics = useMutation(api.ttReviewMetrics.importTtReviewMetrics);
  const [importing, setImporting] = useState(false);

  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [recConfidenceFilter, setRecConfidenceFilter] = useState<ConfidenceFilter>("all");
  const [sortField, setSortField] = useState<SortField>("action");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [displayLimit, setDisplayLimit] = useState(100);

  const filtered = useMemo(() => {
    if (!data?.reviews) return [];
    let rows = data.reviews;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.discordUsername.toLowerCase().includes(q) ||
          r.epicUsername.toLowerCase().includes(q) ||
          (r.nickname?.toLowerCase().includes(q) ?? false),
      );
    }
    if (tierFilter !== "all") rows = rows.filter((r) => r.currentTier === tierFilter);
    if (actionFilter === "attention") {
      rows = rows.filter((r) => r.action !== "no_change");
    } else if (actionFilter !== "all") {
      rows = rows.filter((r) => r.action === actionFilter);
    }
    if (recConfidenceFilter !== "all") {
      rows = rows.filter((r) => r.recommendationConfidence === recConfidenceFilter);
    }

    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "playerName":
          cmp = a.discordUsername.localeCompare(b.discordUsername);
          break;
        case "tier":
          cmp = compareTierField(a.currentTier, b.currentTier, sortDirection);
          break;
        case "evaluation":
          cmp = a.evaluationScore - b.evaluationScore;
          break;
        case "ttConclusion":
          cmp = (a.ttConclusion ?? "").localeCompare(b.ttConclusion ?? "");
          break;
        case "overall":
          cmp = a.overallFitLabel.localeCompare(b.overallFitLabel);
          break;
        case "recommendationConfidence":
          cmp =
            CONFIDENCE_RANK[a.recommendationConfidence] -
            CONFIDENCE_RANK[b.recommendationConfidence];
          break;
        case "action":
          cmp = ACTION_RANK[a.action] - ACTION_RANK[b.action];
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data?.reviews, search, tierFilter, actionFilter, recConfidenceFilter, sortField, sortDirection]);

  const visible = filtered.slice(0, displayLimit);
  const hasMore = filtered.length > displayLimit;

  async function handleTtImportFile(file: File) {
    setImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as {
        contract?: string;
        schemaVersion?: string;
        generatedAt?: string;
        playerCount?: number;
        players?: unknown[];
      };
      if (payload.contract !== "zbd.tt.reviewMetrics") {
        throw new Error('Expected contract "zbd.tt.reviewMetrics".');
      }
      if (!Array.isArray(payload.players) || payload.players.length === 0) {
        throw new Error("Export contains no players.");
      }
      const result = await importTtReviewMetrics({
        contract: payload.contract,
        schemaVersion: payload.schemaVersion ?? "1.0.0",
        generatedAt: payload.generatedAt ?? new Date().toISOString(),
        playerCount: payload.playerCount ?? payload.players.length,
        players: payload.players as never[],
      });
      toast.success(
        `Imported Tier Tool metrics for ${result.matched} players` +
          (result.skipped ? ` (${result.skipped} unmatched)` : ""),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import review metrics");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

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
          description={
            data?.summary.ttImport.active
              ? "Recommendations from imported Tier Tool ECP pillar consensus."
              : "Import Tier Tool review metrics to drive evidence-based recommendations."
          }
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/stats">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Analytics Hub
              </Link>
            </Button>
          }
        />

        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileJson className="h-4 w-4" />
              Tier Tool import
            </CardTitle>
            <CardDescription>
              Export <code className="text-xs">zbd.tt.reviewMetrics</code> from Tier Tool → Data,
              then import here. Website no longer runs holistic/TAP modelling.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleTtImportFile(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              {importing ? "Importing…" : "Import review metrics"}
            </Button>
            {ttImportStatus?.active ? (
              <p className="text-sm text-muted-foreground">
                Active: {ttImportStatus.playerCount} players · generated{" "}
                {new Date(ttImportStatus.generatedAt).toLocaleString()}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No snapshot imported yet.</p>
            )}
          </CardContent>
        </Card>

        {data?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>Compared</CardDescription>
                <CardTitle className="text-2xl">{data.summary.totalCompared}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>Needs attention</CardDescription>
                <CardTitle className="text-2xl">{data.summary.needsAttention}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>TT matched</CardDescription>
                <CardTitle className="text-2xl">
                  {data.summary.ttImport.active ? data.summary.ttImport.matchedInReviews : "—"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardDescription>Missing from export</CardDescription>
                <CardTitle className="text-2xl">{data.summary.missingFromExport}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search player…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
          >
            <option value="all">All tiers</option>
            {(["S", "A", "B", "C"] as const).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as ActionFilter)}
          >
            <option value="all">All actions</option>
            <option value="attention">Needs attention</option>
            <option value="review_recommended">Review recommended</option>
            <option value="optional_review">Optional review</option>
            <option value="no_change">No change</option>
          </select>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={recConfidenceFilter}
            onChange={(e) => setRecConfidenceFilter(e.target.value as ConfidenceFilter)}
          >
            <option value="all">All confidence</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {!data ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("playerName")}>
                        Player <SortIcon field="playerName" sortField={sortField} sortDirection={sortDirection} />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("tier")}>
                        Tier <SortIcon field="tier" sortField={sortField} sortDirection={sortDirection} />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("evaluation")}>
                        Eval <SortIcon field="evaluation" sortField={sortField} sortDirection={sortDirection} />
                      </button>
                    </TableHead>
                    <TableHead>Eval fit</TableHead>
                    <TableHead>
                      <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("ttConclusion")}>
                        TT evidence <SortIcon field="ttConclusion" sortField={sortField} sortDirection={sortDirection} />
                      </button>
                    </TableHead>
                    <TableHead>Form</TableHead>
                    <TableHead>
                      <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("action")}>
                        Action <SortIcon field="action" sortField={sortField} sortDirection={sortDirection} />
                      </button>
                    </TableHead>
                    <TableHead>
                      <button type="button" className="flex items-center gap-1" onClick={() => toggleSort("recommendationConfidence")}>
                        Confidence <SortIcon field="recommendationConfidence" sortField={sortField} sortDirection={sortDirection} />
                      </button>
                    </TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.playerId}>
                      <TableCell>
                        <div className="font-medium">{row.discordUsername}</div>
                        {row.nickname && (
                          <div className="text-xs text-muted-foreground">{row.nickname}</div>
                        )}
                      </TableCell>
                      <TableCell>{row.currentTier}</TableCell>
                      <TableCell>{row.evaluationScore}</TableCell>
                      <TableCell className="text-sm">{row.evaluationFitLabel}</TableCell>
                      <TableCell>
                        {row.recommendationSource === "tier_tool" ? (
                          <Badge variant="outline">{row.ttConclusion ?? "—"}</Badge>
                        ) : (
                          <Badge variant="secondary">
                            {row.recommendationSource === "missing_from_export"
                              ? "Not in export"
                              : "Import required"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {row.formTrendLevel ?? "—"}
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={row.action} label={row.actionLabel} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Stars count={row.stars} />
                          <span className="text-xs text-muted-foreground">
                            {row.recommendationConfidenceLabel}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs text-sm text-muted-foreground">
                        {row.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {hasMore && (
              <Button variant="outline" onClick={() => setDisplayLimit((n) => n + 100)}>
                Show more ({filtered.length - displayLimit} remaining)
              </Button>
            )}
          </>
        )}
      </div>
    </RoleGate>
  );
}

export default function TierReviewConfidencePage() {
  return (
    <AdminPageLayout
      requireModerator
      title="Tier Recommendation"
      authTitle="Sign in to access tier recommendations"
    >
      <TierRecommendationContent />
    </AdminPageLayout>
  );
}
