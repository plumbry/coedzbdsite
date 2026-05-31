import { useState, useRef, useEffect, useCallback } from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  SearchIcon,
  UserIcon,
  SkullIcon,
  CrosshairIcon,
  XIcon,
  Loader2Icon,
  TargetIcon,
  TrophyIcon,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import UpsetKillsLayout from "./_components/upset-kills-layout.tsx";

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

function tierBorder(tier?: string) {
  switch (tier?.toUpperCase()) {
    case "S": return "border-yellow-500/30 bg-yellow-500/5";
    case "A": return "border-emerald-500/30 bg-emerald-500/5";
    case "B": return "border-blue-500/30 bg-blue-500/5";
    case "C": return "border-purple-500/30 bg-purple-500/5";
    case "D": return "border-red-500/30 bg-red-500/5";
    default: return "";
  }
}

function PlayerSearchInput({
  selected,
  onSelect,
  onClear,
}: {
  selected: SelectedPlayer | null;
  onSelect: (p: SelectedPlayer) => void;
  onClear: () => void;
}) {
  const convex = useConvex();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
          setResults(res);
          setOpen(res.length > 0);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      }, 350);
    },
    [convex]
  );

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
        <Button variant="ghost" size="icon" className="ml-auto min-h-9 min-w-9 h-9 w-9" onClick={onClear}>
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
          placeholder="Search for a player..."
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

type TopEntry = {
  key: string;
  playerId: string | undefined;
  count: number;
  name: string;
  tier: string | undefined;
};

type TopResult = {
  player: { id: string; name: string; tier: string | undefined };
  totalKills: number;
  totalDeaths: number;
  topVictims: TopEntry[];
  topKillers: TopEntry[];
};

function RankedList({
  title,
  icon,
  items,
  accentClass,
}: {
  title: string;
  icon: React.ReactNode;
  items: TopEntry[];
  accentClass: string;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  const medals = ["🥇", "🥈", "🥉", "4th", "5th"];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, i) => (
          <div
            key={item.key}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3",
              i === 0 ? tierBorder(item.tier) : ""
            )}
          >
            <span className="text-xl w-8 text-center">{medals[i] ?? `#${i + 1}`}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.name}</p>
              {item.tier && (
                <Badge variant="secondary" className={cn("text-xs mt-0.5", tierColor(item.tier))}>
                  Tier {item.tier}
                </Badge>
              )}
            </div>
            <div className="text-right">
              <p className={cn("text-2xl font-bold", accentClass)}>{item.count}</p>
              <p className="text-xs text-muted-foreground">
                kill{item.count !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function UpsetKillsTopContent() {
  const convex = useConvex();
  const [player, setPlayer] = useState<SelectedPlayer | null>(null);
  const [data, setData] = useState<TopResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLookup = useCallback(async () => {
    if (!player) return;
    setLoading(true);
    setData(null);
    try {
      const result = await convex.query(api.upsetKills.getPlayerTopKillersAndVictims, {
        playerId: player._id,
        topN: 5,
      });
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [convex, player]);

  const clearPlayer = () => {
    setPlayer(null);
    setData(null);
  };

  return (
    <UpsetKillsLayout>
      {/* Player Picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select a Player</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md">
            <PlayerSearchInput
              selected={player}
              onSelect={setPlayer}
              onClear={clearPlayer}
            />
          </div>
          <Button
            onClick={handleLookup}
            disabled={!player || loading}
            size="lg"
          >
            {loading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Loading...
              </>
            ) : (
              <>
                <CrosshairIcon className="mr-2 h-4 w-4" />
                Look Up
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      )}

      {/* Results */}
      {data && !loading && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">Player</p>
                <p className="text-lg font-bold truncate">{data.player.name}</p>
                {data.player.tier && (
                  <Badge variant="secondary" className={cn("mt-1 text-xs", tierColor(data.player.tier))}>
                    Tier {data.player.tier}
                  </Badge>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">Tracked Kill Events</p>
                <p className="text-3xl font-bold text-emerald-500">{data.totalKills}</p>
                <p className="text-[10px] text-muted-foreground mt-1">from match replay data</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">Tracked Death Events</p>
                <p className="text-3xl font-bold text-red-500">{data.totalDeaths}</p>
                <p className="text-[10px] text-muted-foreground mt-1">from match replay data</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground mb-1">Kill/Death Ratio</p>
                <p className="text-[10px] text-muted-foreground mb-1">from match replay data</p>
                <p className="text-3xl font-bold">
                  {data.totalDeaths > 0
                    ? (data.totalKills / data.totalDeaths).toFixed(2)
                    : data.totalKills > 0
                      ? "∞"
                      : "0.00"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Top Lists */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <RankedList
              title={`Top 5 Victims (killed most by ${data.player.name})`}
              icon={<TrophyIcon className="h-4 w-4 text-emerald-500" />}
              items={data.topVictims}
              accentClass="text-emerald-500"
            />
            <RankedList
              title={`Top 5 Killers (killed ${data.player.name} the most)`}
              icon={<SkullIcon className="h-4 w-4 text-red-500" />}
              items={data.topKillers}
              accentClass="text-red-500"
            />
          </div>
        </>
      )}
    </UpsetKillsLayout>
  );
}

export default function UpsetKillsTop() {
  return (
    <AdminPageLayout skipHeader requireAdmin authTitle="Sign in to view upset kills">
      <UpsetKillsTopContent />
    </AdminPageLayout>
  );
}
