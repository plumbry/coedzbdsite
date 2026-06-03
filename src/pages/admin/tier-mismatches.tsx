import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Search, AlertTriangle, AlertCircle, ShieldAlert, ArrowUpDown, ExternalLink, ClipboardEdit, FileWarning, VenusAndMars, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import ScorePlayerDialog from "../_components/score-player-dialog.tsx";
import { useClientPagination } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";

type MismatchStatus = "missing_role" | "wrong_role" | "multiple_roles";

function getMismatchLabel(status: MismatchStatus): string {
  switch (status) {
    case "wrong_role":
      return "Wrong Role";
    case "multiple_roles":
      return "Multiple Roles";
    case "missing_role":
      return "Missing Role";
  }
}

function getMismatchBadgeVariant(status: MismatchStatus): "destructive" | "default" | "secondary" {
  switch (status) {
    case "wrong_role":
      return "destructive";
    case "multiple_roles":
      return "default";
    case "missing_role":
      return "secondary";
  }
}

function getMismatchIcon(status: MismatchStatus) {
  switch (status) {
    case "wrong_role":
      return <ShieldAlert className="h-3.5 w-3.5" />;
    case "multiple_roles":
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case "missing_role":
      return <AlertCircle className="h-3.5 w-3.5" />;
  }
}

function TierBadge({ tier }: { tier: string }) {
  const variant = tier === "S" ? "default" : tier === "A" ? "secondary" : "outline";
  return <Badge variant={variant}>{tier}</Badge>;
}

function MissingGenderBadge() {
  return (
    <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700">
      <VenusAndMars className="h-3 w-3" />
      No Gender
    </Badge>
  );
}

function SheetFemaleMismatchBadge() {
  return (
    <Badge
      variant="outline"
      className="gap-1 text-pink-700 border-pink-300 dark:text-pink-400 dark:border-pink-700"
      title="Verified on Mod Log Girl Role sheet but evaluation gender is not female"
    >
      <Trophy className="h-3 w-3" />
      Sheet F, not site
    </Badge>
  );
}

function MissingGenderSection() {
  const missingGender = useQuery(api.discord.tierMismatches.getPlayersMissingGender, {});
  const [search, setSearch] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<Id<"players"> | null>(null);
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!missingGender) return [];
    if (!search.trim()) return missingGender;
    const term = search.toLowerCase();
    return missingGender.filter(
      (p) =>
        p.discordUsername.toLowerCase().includes(term) ||
        p.epicUsername.toLowerCase().includes(term) ||
        (p.nickname && p.nickname.toLowerCase().includes(term)),
    );
  }, [missingGender, search]);

  const pagination = useClientPagination(filtered, { resetDeps: [search] });

  if (missingGender === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (missingGender.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No players missing gender. All active evaluations have male or female set.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Active and accepted players whose evaluation does not have gender set to male or female.
      </p>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by username or epic..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Badge variant="secondary" className="whitespace-nowrap">
            {missingGender.length} player{missingGender.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Epic</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pagination.pageItems ?? []).map((p) => (
                <TableRow key={p.playerId} className="bg-amber-50/50 dark:bg-amber-950/10">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link
                        to={`/player/${p.discordUsername}`}
                        className="hover:underline text-primary"
                      >
                        {p.nickname || p.discordUsername}
                      </Link>
                      <MissingGenderBadge />
                      {p.sheetFemaleNotOnSite && <SheetFemaleMismatchBadge />}
                      {p.nickname && (
                        <span className="text-xs text-muted-foreground">
                          ({p.discordUsername})
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{p.epicUsername}</TableCell>
                  <TableCell>
                    {p.tier ? <TierBadge tier={p.tier} /> : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => {
                          setSelectedPlayerId(p.playerId as Id<"players">);
                          setIsScoreDialogOpen(true);
                        }}
                      >
                        <ClipboardEdit className="h-3.5 w-3.5 mr-1" />
                        Evaluate
                      </Button>
                      <Link to={`/player/${p.discordUsername}`}>
                        <Button variant="ghost" size="sm" className="cursor-pointer">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <TablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalCount={pagination.totalCount}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          onPageChange={pagination.setPage}
          itemLabel="players missing gender"
        />

      {selectedPlayerId && (
        <ScorePlayerDialog
          open={isScoreDialogOpen}
          onOpenChange={setIsScoreDialogOpen}
          playerId={selectedPlayerId}
        />
      )}
    </div>
  );
}

function IncompleteEvaluationsSection() {
  const incomplete = useQuery(api.discord.tierMismatches.getIncompleteEvaluations, {});
  const [search, setSearch] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<Id<"players"> | null>(null);
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!incomplete) return [];
    if (!search.trim()) return incomplete;
    const term = search.toLowerCase();
    return incomplete.filter(
      (p) =>
        p.discordUsername.toLowerCase().includes(term) ||
        p.epicUsername.toLowerCase().includes(term) ||
        (p.nickname && p.nickname.toLowerCase().includes(term)),
    );
  }, [incomplete, search]);

  const incompletePagination = useClientPagination(filtered, { resetDeps: [search] });

  if (incomplete === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (incomplete.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No incomplete evaluations. All scored players have every evaluation field filled.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Players who have an evaluation but are missing one or more score fields.
        These players may have inaccurate tier placements.
      </p>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by username or epic..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Badge variant="secondary" className="whitespace-nowrap">
            {incomplete.length} player{incomplete.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead>Epic</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Completion</TableHead>
                <TableHead>Missing Fields</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(incompletePagination.pageItems ?? []).map((p) => (
                <TableRow key={p.playerId} className="bg-amber-50/50 dark:bg-amber-950/10">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      <Link
                        to={`/player/${p.discordUsername}`}
                        className="hover:underline text-primary"
                      >
                        {p.nickname || p.discordUsername}
                      </Link>
                      {p.isFemale && (
                        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-400 text-[10px] font-bold shrink-0" title="Female on site">
                          F
                        </span>
                      )}
                      {p.sheetFemaleNotOnSite && <SheetFemaleMismatchBadge />}
                      {p.nickname && (
                        <span className="text-xs text-muted-foreground">
                          ({p.discordUsername})
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{p.epicUsername}</TableCell>
                  <TableCell>
                    <TierBadge tier={p.tier} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-muted rounded-full h-2">
                        <div
                          className="bg-amber-500 h-2 rounded-full transition-all"
                          style={{ width: `${(p.filledCount / p.totalFields) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {p.filledCount}/{p.totalFields}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {p.missingFields.map((f) => (
                        <Badge key={f} variant="secondary" className="text-xs">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer"
                        onClick={() => {
                          setSelectedPlayerId(p.playerId as Id<"players">);
                          setIsScoreDialogOpen(true);
                        }}
                      >
                        <ClipboardEdit className="h-3.5 w-3.5 mr-1" />
                        Evaluate
                      </Button>
                      <Link to={`/player/${p.discordUsername}`}>
                        <Button variant="ghost" size="sm" className="cursor-pointer">
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <TablePagination
          page={incompletePagination.page}
          totalPages={incompletePagination.totalPages}
          totalCount={incompletePagination.totalCount}
          startIndex={incompletePagination.startIndex}
          endIndex={incompletePagination.endIndex}
          onPageChange={incompletePagination.setPage}
          itemLabel="incomplete evaluations"
        />

      {selectedPlayerId && (
        <ScorePlayerDialog
          open={isScoreDialogOpen}
          onOpenChange={setIsScoreDialogOpen}
          playerId={selectedPlayerId}
        />
      )}
    </div>
  );
}

function MissingRoleSection() {
  const mismatches = useQuery(api.discord.tierMismatches.getTierMismatches, {});
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("mismatchStatus");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedPlayerId, setSelectedPlayerId] = useState<Id<"players"> | null>(null);
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredMismatches = useMemo(() => {
    if (!mismatches) return [];

    let result = [...mismatches];

    // Filter by website tier
    if (filterTier !== "all") {
      result = result.filter((m) => m.websiteTier === filterTier);
    }

    // Search filter
    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.discordUsername.toLowerCase().includes(term) ||
          m.epicUsername.toLowerCase().includes(term) ||
          m.discordUserId.includes(term) ||
          (m.nickname && m.nickname.toLowerCase().includes(term)),
      );
    }

    // Sort
    result.sort((a, b) => {
      const aVal = a[sortField as keyof typeof a];
      const bVal = b[sortField as keyof typeof b];
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return 0;
    });

    return result;
  }, [mismatches, filterTier, search, sortField, sortDirection]);

  const mismatchesPagination = useClientPagination(filteredMismatches, {
    resetDeps: [filterTier, search, sortField, sortDirection],
  });

  const handleEvaluatePlayer = (playerId: string) => {
    setSelectedPlayerId(playerId as Id<"players">);
    setIsScoreDialogOpen(true);
  };

  if (mismatches === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Discord tier roles that do not match the player&apos;s website tier, based on cached role data from the last sync.
      </p>

      {/* Filters and table */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          {/* Filters row */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by username, epic, or Discord ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              {["all", "S", "A", "B", "C"].map((tier) => (
                <Button
                  key={tier}
                  variant={filterTier === tier ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setFilterTier(tier)}
                  className="cursor-pointer"
                >
                  {tier === "all" ? "All Tiers" : `Tier ${tier}`}
                </Button>
              ))}
            </div>
          </div>

          {/* Results */}
          {filteredMismatches.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {mismatches.length === 0
                ? "No tier/role mismatches found. All players are in sync."
                : "No mismatches match your current filters."}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleSort("mismatchStatus")}
                    >
                      <div className="flex items-center gap-1">
                        Issue
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleSort("discordUsername")}
                    >
                      <div className="flex items-center gap-1">
                        Player
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleSort("epicUsername")}
                    >
                      <div className="flex items-center gap-1">
                        Epic
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleSort("websiteTier")}
                    >
                      <div className="flex items-center gap-1">
                        Website Tier
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead>Discord Tier(s)</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(mismatchesPagination.pageItems ?? []).map((m) => (
                    <TableRow
                      key={m.playerId}
                      className={
                        m.mismatchStatus === "wrong_role"
                          ? "bg-red-50/50 dark:bg-red-950/10"
                          : m.mismatchStatus === "multiple_roles"
                            ? "bg-yellow-50/50 dark:bg-yellow-950/10"
                            : ""
                      }
                    >
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge
                            variant={getMismatchBadgeVariant(m.mismatchStatus)}
                            className="gap-1"
                          >
                            {getMismatchIcon(m.mismatchStatus)}
                            {getMismatchLabel(m.mismatchStatus)}
                          </Badge>
                          {m.missingGender && <MissingGenderBadge />}
                          {m.sheetFemaleNotOnSite && <SheetFemaleMismatchBadge />}
                        </div>
                      </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      <Link
                        to={`/player/${m.discordUsername}`}
                        className="hover:underline text-primary"
                      >
                        {m.nickname || m.discordUsername}
                      </Link>
                      {m.isFemale && (
                        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-400 text-[10px] font-bold shrink-0" title="Female">
                          F
                        </span>
                      )}
                      {m.nickname && (
                        <span className="text-xs text-muted-foreground">
                          ({m.discordUsername})
                        </span>
                      )}
                    </div>
                  </TableCell>
                      <TableCell>{m.epicUsername}</TableCell>
                      <TableCell>
                        <TierBadge tier={m.websiteTier} />
                      </TableCell>
                      <TableCell>
                        {m.discordTiers.length === 0 ? (
                          <span className="text-muted-foreground text-sm">None</span>
                        ) : (
                          <div className="flex gap-1">
                            {m.discordTiers.map((t) => (
                              <TierBadge key={t} tier={t} />
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="cursor-pointer"
                            onClick={() => handleEvaluatePlayer(m.playerId)}
                          >
                            <ClipboardEdit className="h-3.5 w-3.5 mr-1" />
                            Evaluate
                          </Button>
                          <Link to={`/player/${m.discordUsername}`}>
                            <Button variant="ghost" size="sm" className="cursor-pointer">
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              View
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <TablePagination
            page={mismatchesPagination.page}
            totalPages={mismatchesPagination.totalPages}
            totalCount={mismatchesPagination.totalCount}
            startIndex={mismatchesPagination.startIndex}
            endIndex={mismatchesPagination.endIndex}
            onPageChange={mismatchesPagination.setPage}
            itemLabel="mismatches"
          />
        </CardContent>
      </Card>

      {selectedPlayerId && (
        <ScorePlayerDialog
          open={isScoreDialogOpen}
          onOpenChange={setIsScoreDialogOpen}
          playerId={selectedPlayerId}
        />
      )}
    </div>
  );
}

function TabCountBadge({ count }: { count: number | undefined }) {
  if (count === undefined) {
    return <Skeleton className="ml-1.5 h-5 w-8 inline-block align-middle" />;
  }
  return (
    <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1.5 text-xs">
      {count}
    </Badge>
  );
}

function TierMismatchesInner() {
  const mismatches = useQuery(api.discord.tierMismatches.getTierMismatches, {});
  const incomplete = useQuery(api.discord.tierMismatches.getIncompleteEvaluations, {});
  const missingGender = useQuery(api.discord.tierMismatches.getPlayersMissingGender, {});

  const roleCount = mismatches?.length;
  const evalCount = incomplete?.length;
  const genderCount = missingGender?.length;

  const isLoading =
    mismatches === undefined || incomplete === undefined || missingGender === undefined;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="missing_role" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3 h-auto">
        <TabsTrigger value="missing_role" className="cursor-pointer gap-1 py-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Missing Role
          <TabCountBadge count={roleCount} />
        </TabsTrigger>
        <TabsTrigger value="missing_eval" className="cursor-pointer gap-1 py-2">
          <FileWarning className="h-3.5 w-3.5 shrink-0" />
          Missing Eval
          <TabCountBadge count={evalCount} />
        </TabsTrigger>
        <TabsTrigger value="missing_gender" className="cursor-pointer gap-1 py-2">
          <VenusAndMars className="h-3.5 w-3.5 shrink-0" />
          Missing Gender
          <TabCountBadge count={genderCount} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="missing_role" className="mt-4">
        <MissingRoleSection />
      </TabsContent>

      <TabsContent value="missing_eval" className="mt-4">
        <IncompleteEvaluationsSection />
      </TabsContent>

      <TabsContent value="missing_gender" className="mt-4">
        <MissingGenderSection />
      </TabsContent>
    </Tabs>
  );
}

export default function TierMismatchesPage() {
  return (
    <AdminPageLayout requireAdmin
      title="Tier Mismatches"
      description="Discord tier role mismatches, gender gaps, sheet vs site female verification, and incomplete evaluations"
      authTitle="Sign in to view tier mismatches"
    >
      <TierMismatchesInner />
    </AdminPageLayout>
  );
}
