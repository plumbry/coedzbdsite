import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { ArrowLeft, ExternalLink, Search } from "lucide-react";
import {
  audienceSegmentPageTitle,
  isAudienceChartType,
  isValidSegmentKey,
  type AudienceChartType,
} from "@/lib/audience-insights-segments.ts";

type MemberRow = {
  playerId: Id<"players">;
  discordUsername: string;
  epicUsername: string;
  tier: string | undefined;
  eventsPlayedCount: number;
  genderLabel: string;
  serverJoinDate: string;
};

export default function AudienceInsightsSegmentPage() {
  const { chart, segment } = useParams<{ chart: string; segment: string }>();
  const [search, setSearch] = useState("");
  const [allMembers, setAllMembers] = useState<MemberRow[]>([]);
  const [playersCursor, setPlayersCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const chartType = chart && isAudienceChartType(chart) ? chart : null;
  const segmentKey = segment ?? "";

  const page = useQuery(
    api.audienceInsights.listAudienceInsightMembers,
    chartType && isValidSegmentKey(chartType, segmentKey)
      ? {
          chart: chartType,
          segment: segmentKey,
          playersCursor: playersCursor ?? undefined,
        }
      : "skip",
  );

  useEffect(() => {
    setAllMembers([]);
    setPlayersCursor(null);
    setHasMore(true);
    setInitialLoaded(false);
    setSearch("");
  }, [chartType, segmentKey]);

  useEffect(() => {
    if (!page) return;

    setAllMembers((prev) => {
      const seen = new Set(prev.map((m) => m.playerId));
      const merged = [...prev];
      for (const member of page.members) {
        if (!seen.has(member.playerId)) {
          merged.push(member);
        }
      }
      return merged;
    });
    setHasMore(page.hasMore);
    setInitialLoaded(true);
  }, [page]);

  const loadMore = useCallback(() => {
    if (!page?.hasMore || !page.nextCursor) return;
    setPlayersCursor(page.nextCursor);
  }, [page]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allMembers;
    const term = search.toLowerCase();
    return allMembers.filter(
      (m) =>
        m.discordUsername.toLowerCase().includes(term) ||
        m.epicUsername.toLowerCase().includes(term),
    );
  }, [allMembers, search]);

  if (!chartType || !isValidSegmentKey(chartType, segmentKey)) {
    return <Navigate to="/admin/audience-insights" replace />;
  }

  const title = audienceSegmentPageTitle(chartType, segmentKey);
  const isLoadingFirstPage = !initialLoaded && page === undefined;

  return (
    <AdminPageLayout
      requireAdmin
      title={title}
      description="Accepted members in this audience segment."
      authTitle="Sign in to view audience segment"
      header={{
        actions: (
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/audience-insights">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to charts
            </Link>
          </Button>
        ),
      }}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search Discord or Epic name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {isLoadingFirstPage ? (
              "Loading members…"
            ) : (
              <>
                Showing {filtered.length}
                {search.trim() ? ` of ${allMembers.length}` : ""} loaded
                {hasMore ? " (more available)" : ""}
              </>
            )}
          </p>
        </div>

        {isLoadingFirstPage ? (
          <Skeleton className="h-96 w-full" />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            No members found in this segment.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Discord</TableHead>
                  <TableHead>Epic</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((member) => {
                  const profileUsername = member.epicUsername || member.discordUsername;
                  return (
                    <TableRow key={member.playerId}>
                      <TableCell className="font-medium">{member.discordUsername}</TableCell>
                      <TableCell>{member.epicUsername}</TableCell>
                      <TableCell>
                        {member.tier ? (
                          <Badge variant="outline">{member.tier}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{member.genderLabel}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {member.eventsPlayedCount}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link
                            to={`/player/${encodeURIComponent(profileUsername)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open player profile"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {hasMore && !search.trim() && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={page === undefined}
            >
              {page === undefined ? "Loading…" : "Load more members"}
            </Button>
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
}
