import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ArrowLeft, Users, ArrowRight } from "lucide-react";
import { useUserRole } from "@/hooks/use-user-role.ts";
import SiteHeader from "@/components/site-header.tsx";
import AdminSidebar from "./_components/admin-sidebar.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { toast } from "sonner";

function TierSimulationContent() {
  const { isModeratorOrAdmin, isLoading: isLoadingUser } = useUserRole();
  const canView = isModeratorOrAdmin;

  const [tierSimulations, setTierSimulations] = useState<Map<string, string>>(
    new Map()
  ); // playerId -> newTier
  const [playerSearchInput, setPlayerSearchInput] = useState("");
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);

  // Fetch cached re-evaluation data for current medians
  const cachedData = useQuery(
    api.tierReEvaluation.getCachedTierReEvaluationData,
    canView && !isLoadingUser ? {} : "skip"
  );

  // Fetch all players for search (lightweight query - no enrichment)
  const allPlayers = useQuery(
    api.players.getPlayersForSimulation,
    canView && !isLoadingUser ? {} : "skip"
  );

  // Filter players for search autocomplete
  const filteredPlayersForSearch = useMemo(() => {
    if (!playerSearchInput.trim() || !allPlayers) return [];
    const searchLower = playerSearchInput.toLowerCase();
    return allPlayers
      .filter((p) => !tierSimulations.has(p._id))
      .filter(
        (p) =>
          (p.discordUsername?.toLowerCase().includes(searchLower) || false) ||
          (p.epicUsername?.toLowerCase().includes(searchLower) || false)
      )
      .slice(0, 10)
      .map((p) => ({
        playerId: p._id,
        playerName: p.discordUsername || p.epicUsername,
        tier: p.tier || "C",
      }));
  }, [playerSearchInput, allPlayers, tierSimulations]);

  // Calculate current medians
  const currentMedians = useMemo(() => {
    if (!cachedData?.evaluations) return { S: 0, A: 0, B: 0, C: 0 };

    const tierScores = { S: [] as number[], A: [] as number[], B: [] as number[], C: [] as number[] };

    for (const evaluation of cachedData.evaluations) {
      const tier = evaluation.tier as "S" | "A" | "B" | "C";
      if (tier && tierScores[tier]) {
        tierScores[tier].push(evaluation.holisticScore || 0);
      }
    }

    const medians: Record<string, number> = {};
    for (const tier of ["S", "A", "B", "C"]) {
      const scores = tierScores[tier as keyof typeof tierScores];
      if (scores.length > 0) {
        scores.sort((a, b) => a - b);
        const mid = Math.floor(scores.length / 2);
        medians[tier] =
          scores.length % 2 === 0
            ? (scores[mid - 1] + scores[mid]) / 2
            : scores[mid];
      } else {
        medians[tier] = 0;
      }
    }

    return medians;
  }, [cachedData]);

  // Calculate simulated medians
  const simulatedMedians = useMemo(() => {
    if (!cachedData || !cachedData.evaluations || tierSimulations.size === 0) {
      return currentMedians;
    }

    const tierScores = { S: [] as number[], A: [] as number[], B: [] as number[], C: [] as number[] };

    for (const e of cachedData.evaluations) {
      const simulatedTier = tierSimulations.get(e.playerId);
      const effectiveTier = (simulatedTier || e.tier) as "S" | "A" | "B" | "C";
      if (effectiveTier && tierScores[effectiveTier]) {
        tierScores[effectiveTier].push(e.holisticScore || 0);
      }
    }

    const medians: Record<string, number> = {};
    for (const tier of ["S", "A", "B", "C"]) {
      const scores = tierScores[tier as keyof typeof tierScores];
      if (scores.length > 0) {
        scores.sort((a, b) => a - b);
        const mid = Math.floor(scores.length / 2);
        medians[tier] =
          scores.length % 2 === 0
            ? (scores[mid - 1] + scores[mid]) / 2
            : scores[mid];
      } else {
        medians[tier] = 0;
      }
    }

    return medians;
  }, [cachedData, tierSimulations, currentMedians]);

  // Tier simulation functions
  const addPlayerToSimulation = (playerId: string, newTier: string) => {
    const newMap = new Map(tierSimulations);
    newMap.set(playerId, newTier);
    setTierSimulations(newMap);
  };

  const removePlayerFromSimulation = (playerId: string) => {
    const newMap = new Map(tierSimulations);
    newMap.delete(playerId);
    setTierSimulations(newMap);
  };

  const clearSimulation = () => {
    setTierSimulations(new Map());
  };

  // Show loading while checking permissions
  if (isLoadingUser) {
    return (
      <div className="flex h-screen pt-14 lg:pt-0">
        <AdminSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <SiteHeader />
          <div className="flex-1 overflow-y-auto p-8">
            <Skeleton className="h-8 w-64 mb-4" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex h-screen pt-14 lg:pt-0">
        <AdminSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <SiteHeader />
          <div className="flex-1 overflow-y-auto p-8">
            <Card>
              <CardHeader>
                <CardTitle>Access Denied</CardTitle>
                <CardDescription>
                  You need admin or moderator access to view this page.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen pt-14 lg:pt-0">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <SiteHeader />
        <div className="flex-1 overflow-y-auto">
          <div className="p-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
              <Link to="/admin/tier-re-evaluation">
                <Button variant="ghost" size="sm" className="mb-4">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Re-Evaluations
                </Button>
              </Link>
              <h1 className="text-3xl font-bold">Tier Simulation Tool</h1>
              <p className="text-muted-foreground mt-2">
                Preview how tier median changes would look if you changed specific players' tiers
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Add Players */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      <CardTitle>Add Players to Simulation</CardTitle>
                    </div>
                    {tierSimulations.size > 0 && (
                      <Button variant="outline" size="sm" onClick={clearSimulation}>
                        Clear All
                      </Button>
                    )}
                  </div>
                  <CardDescription>
                    Search for any accepted member and assign them a new tier
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Add Player Form */}
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 relative">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Player Name
                      </label>
                      <input
                        type="text"
                        className="border rounded px-3 py-2 text-sm w-full"
                        placeholder="Start typing a player name..."
                        value={playerSearchInput}
                        onChange={(e) => {
                          setPlayerSearchInput(e.target.value);
                          setShowPlayerDropdown(true);
                        }}
                        onFocus={() => setShowPlayerDropdown(true)}
                        onBlur={() => {
                          setTimeout(() => setShowPlayerDropdown(false), 200);
                        }}
                      />
                      {/* Autocomplete Dropdown */}
                      {showPlayerDropdown && filteredPlayersForSearch.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {filteredPlayersForSearch.map((player) => (
                            <button
                              key={player.playerId}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                              onClick={() => {
                                const tierSelect = document.getElementById(
                                  "simulation-tier-select"
                                ) as HTMLSelectElement;
                                if (tierSelect) {
                                  addPlayerToSimulation(player.playerId, tierSelect.value);
                                  setPlayerSearchInput("");
                                  setShowPlayerDropdown(false);
                                }
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{player.playerName}</span>
                                <Badge variant="outline" className="ml-2">
                                  {player.tier}
                                </Badge>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="w-32">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        New Tier
                      </label>
                      <select
                        id="simulation-tier-select"
                        className="border rounded px-3 py-2 text-sm w-full"
                        defaultValue="S"
                      >
                        <option value="S">S</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                      </select>
                    </div>
                    <Button
                      onClick={() => {
                        const tierSelect = document.getElementById(
                          "simulation-tier-select"
                        ) as HTMLSelectElement;
                        if (
                          filteredPlayersForSearch.length === 1 &&
                          playerSearchInput.trim()
                        ) {
                          const player = filteredPlayersForSearch[0];
                          if (tierSelect) {
                            addPlayerToSimulation(player.playerId, tierSelect.value);
                            setPlayerSearchInput("");
                            setShowPlayerDropdown(false);
                          }
                        } else if (
                          filteredPlayersForSearch.length === 0 &&
                          playerSearchInput.trim()
                        ) {
                          toast.error("No player found matching that name");
                        } else {
                          toast.error("Please type a player name");
                        }
                      }}
                      size="sm"
                      className="h-10"
                    >
                      Add
                    </Button>
                  </div>

                  {/* Simulated Changes List */}
                  {tierSimulations.size > 0 ? (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">
                        Simulated Changes ({tierSimulations.size})
                      </h4>
                      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                        {Array.from(tierSimulations.entries()).map(([playerId, newTier]) => {
                          // Look up player in all players list
                          let playerName = "Unknown";
                          let currentTier = "C";

                          if (allPlayers) {
                            const player = allPlayers.find((p) => p._id === playerId);
                            if (player) {
                              playerName = player.discordUsername || player.epicUsername;
                              currentTier = player.tier || "C";
                            }
                          }

                          return (
                            <div
                              key={playerId}
                              className="flex items-center justify-between bg-accent/50 border rounded p-3"
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-medium">{playerName}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{currentTier}</Badge>
                                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                  <Badge variant="default">{newTier}</Badge>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removePlayerFromSimulation(playerId)}
                              >
                                Remove
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No players added to simulation yet. Search and add players above.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Right Column: Tier Median Impact */}
              <Card>
                <CardHeader>
                  <CardTitle>Tier Median Impact</CardTitle>
                  <CardDescription>
                    See how your simulated changes affect tier medians
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {tierSimulations.size > 0 ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <h5 className="text-xs font-medium text-muted-foreground mb-3">
                            Current Medians
                          </h5>
                          <div className="space-y-2">
                            {["S", "A", "B", "C"].map((tier) => (
                              <div
                                key={tier}
                                className="flex items-center justify-between p-2 bg-accent/30 rounded"
                              >
                                <Badge variant="outline" className="font-bold">
                                  {tier}
                                </Badge>
                                <span className="font-mono text-sm">
                                  {(currentMedians as Record<string, number>)[tier]?.toFixed(
                                    2
                                  ) || "N/A"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h5 className="text-xs font-medium text-muted-foreground mb-3">
                            Simulated Medians
                          </h5>
                          <div className="space-y-2">
                            {["S", "A", "B", "C"].map((tier) => {
                              const current = (currentMedians as Record<string, number>)[tier];
                              const simulated = (simulatedMedians as Record<string, number>)[
                                tier
                              ];
                              const diff = simulated - current;
                              const hasDiff = Math.abs(diff) > 0.01;

                              return (
                                <div
                                  key={tier}
                                  className="flex items-center justify-between p-2 bg-accent/30 rounded"
                                >
                                  <Badge variant="outline" className="font-bold">
                                    {tier}
                                  </Badge>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm">
                                      {simulated?.toFixed(2) || "N/A"}
                                    </span>
                                    {hasDiff && (
                                      <span
                                        className={`text-xs font-medium ${
                                          diff > 0
                                            ? "text-green-600 dark:text-green-400"
                                            : "text-red-600 dark:text-red-400"
                                        }`}
                                      >
                                        ({diff > 0 ? "+" : ""}
                                        {diff.toFixed(2)})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t">
                        <h5 className="text-xs font-medium text-muted-foreground mb-2">
                          Summary
                        </h5>
                        <div className="text-sm text-muted-foreground">
                          {tierSimulations.size} player{tierSimulations.size !== 1 ? "s" : ""}{" "}
                          simulated with tier changes. Green indicates median increase, red
                          indicates decrease.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      Add players to the simulation to see median impact
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TierSimulation() {
  return (
    <>
      <Authenticated>
        <TierSimulationContent />
      </Authenticated>
      <Unauthenticated>
        <div className="flex h-screen items-center justify-center">
          <Card>
            <CardHeader>
              <CardTitle>Sign In Required</CardTitle>
              <CardDescription>Please sign in to access this page.</CardDescription>
            </CardHeader>
            <CardContent>
              <SignInButton />
            </CardContent>
          </Card>
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="flex h-screen items-center justify-center">
          <Spinner />
        </div>
      </AuthLoading>
    </>
  );
}
