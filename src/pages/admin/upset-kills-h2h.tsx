import { useState, useRef, useEffect, useCallback } from "react";
import { useConvex } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  ArrowLeftIcon,
  SwordsIcon,
  SearchIcon,
  UserIcon,
  SkullIcon,
  ShieldIcon,
  XIcon,
  Loader2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

type SelectedPlayer = {
  _id: Id<"players">;
  name: string;
  epicUsername?: string;
  tier?: string;
};

type SearchResult = {
  _id: Id<"players">;
  name: string;
  epicUsername?: string;
  tier?: string;
};

function tierColor(tier?: string) {
  switch (tier?.toUpperCase()) {
    case "S": return "text-yellow-500";
    case "A": return "text-emerald-500";
    case "B": return "text-blue-500";
    case "C": return "text-purple-500";
    case "D": return "text-red-500";
    default: return "text-muted-foreground";
  }
}

function PlayerSearchInput({
  label,
  selected,
  onSelect,
  onClear,
  excludeId,
}: {
  label: string;
  selected: SelectedPlayer | null;
  onSelect: (p: SelectedPlayer) => void;
  onClear: () => void;
  excludeId?: Id<"players">;
}) {
  const convex = useConvex();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced one-off search
  const doSearch = useCallback(
    (term: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (term.length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }
      setSearching(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await convex.query(api.upsetKills.searchPlayersByName, { search: term });
          const filtered = excludeId ? res.filter((p: SearchResult) => p._id !== excludeId) : res;
          setResults(filtered);
          setOpen(filtered.length > 0);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      }, 350);
    },
    [convex, excludeId]
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/50">
        <UserIcon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{selected.name}</span>
        {selected.tier && (
          <Badge variant="secondary" className={cn("text-xs", tierColor(selected.tier))}>
            {selected.tier}
          </Badge>
        )}
        <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={onClear}>
          <XIcon className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={label}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            doSearch(e.target.value);
          }}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          className="pl-9"
        />
        {searching && (
          <Loader2Icon className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-auto">
          {results.map((p) => (
            <button
              key={p._id}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
              onClick={() => {
                onSelect(p);
                setSearch("");
                setResults([]);
                setOpen(false);
              }}
            >
              <span className="font-medium">{p.name}</span>
              {p.epicUsername && p.epicUsername !== p.name && (
                <span className="text-muted-foreground text-xs">({p.epicUsername})</span>
              )}
              {p.tier && (
                <Badge variant="secondary" className={cn("ml-auto text-xs", tierColor(p.tier))}>
                  {p.tier}
                </Badge>
              )}
            </button>
          ))}
        </div>
      )}
      {open && search.length >= 2 && !searching && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-3 text-sm text-muted-foreground shadow-md">
          No players found
        </div>
      )}
    </div>
  );
}

type H2HEvent = {
  _id: string;
  sessionId: string;
  eventType: string;
  weapon?: string;
  timeInMatch?: number;
  isUpset: boolean;
  killerTier?: string;
  victimTier?: string;
  eventName: string;
  eventDate?: string;
};

type H2HResult = {
  playerA: { id: string; name: string; tier: string | undefined };
  playerB: { id: string; name: string; tier: string | undefined };
  aKilledBCount: number;
  bKilledACount: number;
  aKilledBEvents: H2HEvent[];
  bKilledAEvents: H2HEvent[];
} | null;

export default function UpsetKillsH2H() {
  const convex = useConvex();
  const [playerA, setPlayerA] = useState<SelectedPlayer | null>(null);
  const [playerB, setPlayerB] = useState<SelectedPlayer | null>(null);
  const [h2h, setH2h] = useState<H2HResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCompare = useCallback(async () => {
    if (!playerA || !playerB) return;
    setLoading(true);
    setH2h(null);
    try {
      const result = await convex.query(api.upsetKills.getHeadToHead, {
        playerAId: playerA._id,
        playerBId: playerB._id,
      });
      setH2h(result);
    } catch {
      setH2h(null);
    } finally {
      setLoading(false);
    }
  }, [convex, playerA, playerB]);

  // Clear results when players change
  const clearA = () => { setPlayerA(null); setH2h(null); };
  const clearB = () => { setPlayerB(null); setH2h(null); };

  const bothSelected = !!playerA && !!playerB;
  const total = (h2h?.aKilledBCount ?? 0) + (h2h?.bKilledACount ?? 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/upset-kills">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SwordsIcon className="h-6 w-6 text-amber-500" />
            Head-to-Head Kills
          </h1>
          <p className="text-sm text-muted-foreground">
            See how often two players have eliminated each other
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Based on Yunite match replay data. Knocker always gets credit. Counts may differ from leaderboard totals.
          </p>
        </div>
      </div>

      {/* Player Pickers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Two Players</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-start">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Player A
              </label>
              <PlayerSearchInput
                label="Search player A..."
                selected={playerA}
                onSelect={setPlayerA}
                onClear={clearA}
                excludeId={playerB?._id}
              />
            </div>
            <div className="flex items-center justify-center pt-6">
              <span className="text-xl font-bold text-muted-foreground">vs</span>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Player B
              </label>
              <PlayerSearchInput
                label="Search player B..."
                selected={playerB}
                onSelect={setPlayerB}
                onClear={clearB}
                excludeId={playerA?._id}
              />
            </div>
          </div>
          <div className="flex justify-center">
            <Button
              onClick={handleCompare}
              disabled={!bothSelected || loading}
              size="lg"
            >
              {loading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Comparing...
                </>
              ) : (
                <>
                  <SwordsIcon className="mr-2 h-4 w-4" />
                  Compare
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {/* Results */}
      {h2h && !loading && (
        <>
          {/* Score Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  <span className="font-semibold text-foreground">{h2h.playerA.name}</span> killed
                </p>
                <p className="text-4xl font-bold text-emerald-500">{h2h.aKilledBCount}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  time{h2h.aKilledBCount !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">Total Encounters</p>
                <p className="text-4xl font-bold">{total}</p>
                {total > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {h2h.aKilledBCount > h2h.bKilledACount
                      ? `${h2h.playerA.name} leads`
                      : h2h.bKilledACount > h2h.aKilledBCount
                        ? `${h2h.playerB.name} leads`
                        : "Tied"}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  <span className="font-semibold text-foreground">{h2h.playerB.name}</span> killed
                </p>
                <p className="text-4xl font-bold text-red-500">{h2h.bKilledACount}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  time{h2h.bKilledACount !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Kill log tables */}
          {total === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <ShieldIcon className="mx-auto h-10 w-10 mb-3 opacity-50" />
                <p className="font-medium">No recorded kills between these two players</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* A killed B */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <SkullIcon className="h-4 w-4 text-emerald-500" />
                    {h2h.playerA.name} killed {h2h.playerB.name} ({h2h.aKilledBCount})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {h2h.aKilledBEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None</p>
                  ) : (
                    <div className="overflow-auto max-h-80">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Event</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Tiers</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {h2h.aKilledBEvents.map((e) => (
                            <TableRow key={e._id}>
                              <TableCell className="text-xs">{e.eventName}</TableCell>
                              <TableCell>
                                <Badge variant={e.eventType === "elimination" ? "default" : "secondary"} className="text-xs">
                                  {e.eventType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                <span className={tierColor(e.killerTier)}>{e.killerTier || "?"}</span>
                                {" → "}
                                <span className={tierColor(e.victimTier)}>{e.victimTier || "?"}</span>
                                {e.isUpset && (
                                  <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0">
                                    upset
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* B killed A */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <SkullIcon className="h-4 w-4 text-red-500" />
                    {h2h.playerB.name} killed {h2h.playerA.name} ({h2h.bKilledACount})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {h2h.bKilledAEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None</p>
                  ) : (
                    <div className="overflow-auto max-h-80">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Event</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Tiers</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {h2h.bKilledAEvents.map((e) => (
                            <TableRow key={e._id}>
                              <TableCell className="text-xs">{e.eventName}</TableCell>
                              <TableCell>
                                <Badge variant={e.eventType === "elimination" ? "default" : "secondary"} className="text-xs">
                                  {e.eventType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                <span className={tierColor(e.killerTier)}>{e.killerTier || "?"}</span>
                                {" → "}
                                <span className={tierColor(e.victimTier)}>{e.victimTier || "?"}</span>
                                {e.isUpset && (
                                  <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0">
                                    upset
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
