import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { toast } from "sonner";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { Plus, Trash2, Settings, Users, Trophy, AlertTriangle, X, Upload, History, Loader2, ExternalLink, Copy } from "lucide-react";

// ─── Series Selector ─────────────────────────────────────────────────────────

function SeriesSelector({
  selectedId,
  onSelect,
}: {
  selectedId: Id<"scrimSeries"> | null;
  onSelect: (id: Id<"scrimSeries"> | null) => void;
}) {
  const seriesList = useQuery(api.scrimSeries.queries.listSeries, {});
  const [showCreate, setShowCreate] = useState(false);

  if (!seriesList) return <Skeleton className="h-10 w-full" />;

  return (
    <div className="flex items-center gap-3">
      <Select
        value={selectedId ?? "none"}
        onValueChange={(v) => onSelect(v === "none" ? null : (v as Id<"scrimSeries">))}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder="Select a series" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">-- Select Series --</SelectItem>
          {seriesList.map((s) => (
            <SelectItem key={s._id} value={s._id}>
              {s.name} {!s.isActive && "(Inactive)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogTrigger asChild>
          <Button size="sm" className="cursor-pointer">
            <Plus className="mr-1 h-4 w-4" /> New Series
          </Button>
        </DialogTrigger>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Create New Series</DialogTitle>
          </DialogHeader>
          <CreateSeriesForm onCreated={(id) => { onSelect(id); setShowCreate(false); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Create Series Form ──────────────────────────────────────────────────────

function CreateSeriesForm({ onCreated }: { onCreated: (id: Id<"scrimSeries">) => void }) {
  const createSeries = useMutation(api.scrimSeries.mutations.createSeries);
  const [name, setName] = useState("");
  const [bestN, setBestN] = useState("18");
  const [numScrims, setNumScrims] = useState("6");
  const [gamesPerScrim, setGamesPerScrim] = useState("6");
  const [penaltyAmount, setPenaltyAmount] = useState("5");
  const [threshold, setThreshold] = useState("60");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    const scrimsCount = parseInt(numScrims, 10);
    const gamesCount = parseInt(gamesPerScrim, 10);
    if (!scrimsCount || scrimsCount < 1) { toast.error("Enter at least 1 scrim"); return; }
    if (!gamesCount || gamesCount < 1) { toast.error("Enter at least 1 game per scrim"); return; }

    // Generate the gamesPerSession array (uniform games per scrim)
    const gamesPerSession = Array.from({ length: scrimsCount }, () => gamesCount);

    setSubmitting(true);
    try {
      const id = await createSeries({
        name: name.trim(),
        bestN: parseInt(bestN, 10) || 18,
        gamesPerSession,
        penaltyAmount: parseInt(penaltyAmount, 10) || 5,
        participationThreshold: parseInt(threshold, 10) || 60,
      });
      toast.success("Series created");
      onCreated(id);
    } catch {
      toast.error("Failed to create series");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Series Name</label>
        <Input placeholder="Season 1" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Leaderboard Links</label>
          <Input type="number" min="1" value={numScrims} onChange={(e) => setNumScrims(e.target.value)} />
          <p className="text-xs text-muted-foreground">Total Yunite leaderboard links</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Games Per Link</label>
          <Input type="number" min="1" value={gamesPerScrim} onChange={(e) => setGamesPerScrim(e.target.value)} />
          <p className="text-xs text-muted-foreground">Scores to pull from each link</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Best N Games</label>
          <Input type="number" value={bestN} onChange={(e) => setBestN(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Penalty Amount</label>
          <Input type="number" value={penaltyAmount} onChange={(e) => setPenaltyAmount(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Participation Threshold (%)</label>
        <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
      </div>
      <Button className="w-full cursor-pointer" onClick={handleSubmit} disabled={submitting}>
        {submitting ? "Creating..." : "Create Series"}
      </Button>
    </div>
  );
}

// ─── Settings Panel ──────────────────────────────────────────────────────────

function SettingsPanel({ seriesId }: { seriesId: Id<"scrimSeries"> }) {
  const series = useQuery(api.scrimSeries.queries.getSeries, { seriesId });
  const updateSeries = useMutation(api.scrimSeries.mutations.updateSeries);
  const deleteSeries = useMutation(api.scrimSeries.mutations.deleteSeries);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [bestN, setBestN] = useState("");
  const [gamesStr, setGamesStr] = useState("");
  const [penalty, setPenalty] = useState("");
  const [threshold, setThreshold] = useState("");

  if (!series) return <Skeleton className="h-40 w-full" />;

  const startEdit = () => {
    setName(series.name);
    setBestN(String(series.bestN));
    setGamesStr(String(series.gamesPerSession.length));
    setPenalty(String(series.penaltyAmount));
    setThreshold(String(series.participationThreshold));
    setEditing(true);
  };

  const saveEdit = async () => {
    const scrimsCount = parseInt(gamesStr, 10);
    const gamesPerScrimVal = series.gamesPerSession[0] ?? 6;
    const gamesPerSession = scrimsCount > 0
      ? Array.from({ length: scrimsCount }, () => gamesPerScrimVal)
      : undefined;
    try {
      await updateSeries({
        seriesId,
        name: name.trim() || undefined,
        bestN: parseInt(bestN, 10) || undefined,
        gamesPerSession,
        penaltyAmount: parseInt(penalty, 10) || undefined,
        participationThreshold: parseInt(threshold, 10) || undefined,
      });
      toast.success("Settings saved");
      setEditing(false);
    } catch {
      toast.error("Failed to save");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this series and all its data? This cannot be undone.")) return;
    try {
      await deleteSeries({ seriesId });
      toast.success("Series deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const toggleActive = async () => {
    await updateSeries({ seriesId, isActive: !series.isActive });
    toast.success(series.isActive ? "Series deactivated" : "Series activated");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Series Settings</CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={toggleActive} className="cursor-pointer">
              {series.isActive ? "Deactivate" : "Activate"}
            </Button>
            {!editing && (
              <Button variant="ghost" size="sm" onClick={startEdit} className="cursor-pointer">
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Best N</label>
                <Input type="number" value={bestN} onChange={(e) => setBestN(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Penalty Amount</label>
                <Input type="number" value={penalty} onChange={(e) => setPenalty(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Threshold %</label>
                <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Leaderboard Links</label>
              <Input type="number" min="1" value={gamesStr} onChange={(e) => setGamesStr(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit} className="cursor-pointer">Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="cursor-pointer">Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Best N</p>
              <p className="font-medium">{series.bestN}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Leaderboard Links</p>
              <p className="font-medium">{series.gamesPerSession.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Games/Link</p>
              <p className="font-medium">{series.gamesPerSession[0] ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Penalty</p>
              <p className="font-medium">-{series.penaltyAmount} pts</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Threshold</p>
              <p className="font-medium">{series.participationThreshold}%</p>
            </div>
          </div>
        )}
        {/* Public leaderboard link */}
        <div className="mt-4 pt-3 border-t space-y-2">
          <p className="text-muted-foreground text-xs font-medium">Public Leaderboard</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-3 py-1.5 rounded text-xs font-mono truncate">
              {`${window.location.origin}/scrim-series/${seriesId}`}
            </code>
            <Button
              size="sm"
              variant="ghost"
              className="cursor-pointer shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/scrim-series/${seriesId}`);
                toast.success("Link copied to clipboard");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <a
              href={`/scrim-series/${seriesId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer"
            >
              <Button size="sm" variant="ghost" className="cursor-pointer shrink-0" asChild>
                <span><ExternalLink className="h-3.5 w-3.5" /></span>
              </Button>
            </a>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t flex items-center justify-between">
          <Badge variant={series.isActive ? "default" : "secondary"}>
            {series.isActive ? "Active" : "Inactive"}
          </Badge>
          <Button variant="destructive" size="sm" onClick={handleDelete} className="cursor-pointer">
            <Trash2 className="mr-1 h-3 w-3" /> Delete Series
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Player Management ───────────────────────────────────────────────────────

function PlayerManagement({ seriesId }: { seriesId: Id<"scrimSeries"> }) {
  const players = useQuery(api.scrimSeries.queries.getPlayers, { seriesId });
  const addPlayer = useMutation(api.scrimSeries.mutations.addPlayer);
  const removePlayer = useMutation(api.scrimSeries.mutations.removePlayer);
  const updatePlayer = useMutation(api.scrimSeries.mutations.updatePlayer);

  const [newName, setNewName] = useState("");
  const [newEpic, setNewEpic] = useState("");
  const [editingId, setEditingId] = useState<Id<"scrimSeriesPlayers"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editEpic, setEditEpic] = useState("");

  if (!players) return <Skeleton className="h-40 w-full" />;

  const handleAdd = async () => {
    if (!newName.trim() || !newEpic.trim()) { toast.error("Both fields required"); return; }
    try {
      await addPlayer({ seriesId, playerName: newName.trim(), epicId: newEpic.trim() });
      setNewName("");
      setNewEpic("");
      toast.success("Player added");
    } catch {
      toast.error("Failed to add player");
    }
  };

  const handleRemove = async (playerId: Id<"scrimSeriesPlayers">) => {
    if (!confirm("Remove this player and all their scores/penalties?")) return;
    try {
      await removePlayer({ playerId });
      toast.success("Player removed");
    } catch {
      toast.error("Failed to remove");
    }
  };

  const startEditing = (player: { _id: Id<"scrimSeriesPlayers">; playerName: string; epicId: string }) => {
    setEditingId(player._id);
    setEditName(player.playerName);
    setEditEpic(player.epicId);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await updatePlayer({ playerId: editingId, playerName: editName.trim(), epicId: editEpic.trim() });
      setEditingId(null);
      toast.success("Player updated");
    } catch {
      toast.error("Failed to update");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" /> Players ({players.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add player form */}
        <div className="flex gap-2">
          <Input placeholder="Player Name" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" />
          <Input placeholder="Epic ID" value={newEpic} onChange={(e) => setNewEpic(e.target.value)} className="flex-1" />
          <Button size="sm" onClick={handleAdd} className="cursor-pointer">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Player list */}
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {players.map((p) => (
            <div key={p._id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 text-sm">
              {editingId === p._id ? (
                <>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 flex-1" />
                  <Input value={editEpic} onChange={(e) => setEditEpic(e.target.value)} className="h-7 flex-1" />
                  <Button size="sm" variant="ghost" onClick={saveEdit} className="h-7 px-2 cursor-pointer">Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 px-2 cursor-pointer">
                    <X className="h-3 w-3" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium cursor-pointer" onClick={() => startEditing(p)}>{p.playerName}</span>
                  <span className="flex-1 text-muted-foreground text-xs truncate">{p.epicId}</span>
                  <Button size="sm" variant="ghost" onClick={() => handleRemove(p._id)} className="h-7 w-7 p-0 cursor-pointer text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Leaderboard Panel ──────────────────────────────────────────────────────

function LeaderboardPanel({ seriesId }: { seriesId: Id<"scrimSeries"> }) {
  const series = useQuery(api.scrimSeries.queries.getSeries, { seriesId });
  const leaderboard = useQuery(api.scrimSeries.queries.getLeaderboard, { seriesId });

  if (!series || !leaderboard) return <Skeleton className="h-60 w-full" />;

  if (leaderboard.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Leaderboard
          </CardTitle>
          <CardDescription>No players or scores yet. Import from Yunite or add scores manually.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Best {series.bestN} Leaderboard
          </CardTitle>
          <Badge variant="secondary">{leaderboard.length} players</Badge>
        </div>
        <CardDescription className="text-xs">
          Ranked by Best {series.bestN} score minus penalties.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-2 font-medium text-muted-foreground w-8">#</th>
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Player</th>
                <th className="text-center py-2 px-2 font-medium text-muted-foreground">Games</th>
                <th className="text-center py-2 px-2 font-medium text-muted-foreground">Best {series.bestN}</th>
                <th className="text-center py-2 px-2 font-medium text-muted-foreground">Penalties</th>
                <th className="text-center py-2 px-2 font-medium">Final</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, idx) => (
                <tr
                  key={entry.playerId}
                  className="border-b border-muted/30 hover:bg-muted/20"
                >
                  <td className="py-1.5 pr-2 text-muted-foreground">{idx + 1}</td>
                  <td className="py-1.5 pr-4">
                    <div className="font-medium truncate max-w-[160px]">{entry.playerName}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[160px]">{entry.epicId}</div>
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <span className={entry.isValid ? "text-foreground" : "text-destructive"}>
                      {entry.gamesPlayed}/{entry.totalGames}
                    </span>
                    <div className="text-xs text-muted-foreground">
                      {entry.totalGames > 0 ? Math.round((entry.gamesPlayed / entry.totalGames) * 100) : 0}%
                    </div>
                  </td>
                  <td className="py-1.5 px-2 text-center font-medium">{entry.bestNTotal}</td>
                  <td className="py-1.5 px-2 text-center">
                    {entry.penaltyCount > 0 ? (
                      <span className="text-destructive">-{entry.penaltyTotal} ({entry.penaltyCount})</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-center font-bold">
                    {entry.finalTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Score Entry Grid ────────────────────────────────────────────────────────

function ScoreEntryGrid({ seriesId }: { seriesId: Id<"scrimSeries"> }) {
  const series = useQuery(api.scrimSeries.queries.getSeries, { seriesId });
  const players = useQuery(api.scrimSeries.queries.getPlayers, { seriesId });
  const scores = useQuery(api.scrimSeries.queries.getScores, { seriesId });
  const submitScoreWithTeam = useMutation(api.scrimSeries.mutations.submitScoreWithTeamFill);

  const [activeSession, setActiveSession] = useState(0);
  // Local buffer for in-progress edits: key = "playerId|gameIdx"
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({});

  if (!series || !players || !scores) return <Skeleton className="h-60 w-full" />;

  const totalSessions = series.gamesPerSession.length;
  const gamesInActiveSession = series.gamesPerSession[activeSession];

  // Only show players who have at least one score in this session
  const playersInSession = players.filter((player) =>
    scores.some((s) => s.playerId === player._id && s.sessionIndex === activeSession)
  );

  const getScore = (playerId: Id<"scrimSeriesPlayers">, gameIdx: number): string => {
    const key = `${playerId}|${gameIdx}`;
    if (key in localEdits) return localEdits[key];
    const found = scores.find(
      (s) => s.playerId === playerId && s.sessionIndex === activeSession && s.gameIndex === gameIdx
    );
    return found ? String(found.score) : "";
  };

  const handleScoreInput = (playerId: Id<"scrimSeriesPlayers">, gameIdx: number, value: string) => {
    const key = `${playerId}|${gameIdx}`;
    setLocalEdits((prev) => ({ ...prev, [key]: value }));
  };

  const handleScoreCommit = async (playerId: Id<"scrimSeriesPlayers">, gameIdx: number) => {
    const key = `${playerId}|${gameIdx}`;
    const value = localEdits[key];
    if (value === undefined) return;

    // Clear local edit so it falls back to server value
    setLocalEdits((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    if (value === "") return; // Don't submit empty
    const numVal = parseInt(value, 10);
    if (isNaN(numVal)) return;

    try {
      // Submit for this player + auto-fill teammates on the backend
      await submitScoreWithTeam({
        seriesId,
        playerId,
        sessionIndex: activeSession,
        gameIndex: gameIdx,
        score: numVal,
      });
    } catch {
      toast.error("Failed to save score");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Score Entry
          </CardTitle>
          <Select value={String(activeSession)} onValueChange={(v) => setActiveSession(parseInt(v, 10))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: totalSessions }, (_, i) => (
                <SelectItem key={i} value={String(i)}>
                  Link {i + 1} ({series.gamesPerSession[i]} games)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CardDescription className="text-xs">
          Enter scores for each player per game. Tab between cells or click to edit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Player</th>
                {Array.from({ length: gamesInActiveSession }, (_, i) => (
                  <th key={i} className="text-center py-2 px-1 font-medium text-muted-foreground min-w-[60px]">
                    G{i + 1}
                  </th>
                ))}
                <th className="text-center py-2 px-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {playersInSession.map((player) => {
                const sessionTotal = Array.from({ length: gamesInActiveSession }, (_, i) => {
                  const val = getScore(player._id, i);
                  return val ? parseInt(val, 10) : 0;
                }).reduce((sum, v) => sum + v, 0);

                return (
                  <tr key={player._id} className="border-b border-muted/30 hover:bg-muted/20">
                    <td className="py-1.5 pr-4 font-medium truncate max-w-[120px]">{player.playerName}</td>
                    {Array.from({ length: gamesInActiveSession }, (_, gameIdx) => (
                      <td key={gameIdx} className="py-1 px-0.5">
                        <Input
                          type="text"
                          inputMode="numeric"
                          className="h-7 w-14 text-center px-1 text-sm [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={getScore(player._id, gameIdx)}
                          onChange={(e) => handleScoreInput(player._id, gameIdx, e.target.value)}
                          onBlur={() => handleScoreCommit(player._id, gameIdx)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          placeholder="-"
                        />
                      </td>
                    ))}
                    <td className="py-1.5 px-2 text-center font-semibold">{sessionTotal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Penalty Management ──────────────────────────────────────────────────────

function PenaltyManagement({ seriesId }: { seriesId: Id<"scrimSeries"> }) {
  const players = useQuery(api.scrimSeries.queries.getPlayers, { seriesId });
  const penalties = useQuery(api.scrimSeries.queries.getPenalties, { seriesId });
  const series = useQuery(api.scrimSeries.queries.getSeries, { seriesId });
  const updatePenalty = useMutation(api.scrimSeries.mutations.updatePenalty);
  const removePenalty = useMutation(api.scrimSeries.mutations.removePenalty);

  const [sortBy, setSortBy] = useState<"player" | "reason">("player");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterReason, setFilterReason] = useState<string>("all");

  if (!players || !penalties || !series) return <Skeleton className="h-40 w-full" />;

  // Auto-detect unique reasons from existing penalties
  const existingReasons = [...new Set(penalties.map((p) => p.reason).filter(Boolean))].sort();

  const toggleExclude = async (penaltyId: Id<"scrimSeriesPenalties">, current: boolean) => {
    await updatePenalty({ penaltyId, excluded: !current });
    toast.success(current ? "Penalty included" : "Penalty excluded");
  };

  const handleRemove = async (penaltyId: Id<"scrimSeriesPenalties">) => {
    if (!confirm("Remove this penalty?")) return;
    await removePenalty({ penaltyId });
    toast.success("Penalty removed");
  };

  const getPlayerName = (id: Id<"scrimSeriesPlayers">) =>
    players.find((p) => p._id === id)?.playerName ?? "Unknown";

  const handleSort = (col: "player" | "reason") => {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const sortedPenalties = [...penalties]
    .filter((p) => filterReason === "all" || p.reason === filterReason)
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "player") {
        cmp = getPlayerName(a.playerId).localeCompare(getPlayerName(b.playerId));
      } else {
        cmp = (a.reason || "").localeCompare(b.reason || "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Penalties
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter by reason */}
        {penalties.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filter:</span>
            <Select value={filterReason} onValueChange={(v) => setFilterReason(v)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reasons ({penalties.length})</SelectItem>
                {existingReasons.map((r) => (
                  <SelectItem key={r} value={r}>{r} ({penalties.filter((p) => p.reason === r).length})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Penalty table */}
        {penalties.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No penalties assigned</p>
        ) : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th
                    className="text-left py-2 pr-4 font-medium text-muted-foreground cursor-pointer select-none"
                    onClick={() => handleSort("player")}
                  >
                    Player {sortBy === "player" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th
                    className="text-left py-2 pr-4 font-medium text-muted-foreground cursor-pointer select-none"
                    onClick={() => handleSort("reason")}
                  >
                    Reason {sortBy === "reason" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="text-center py-2 px-2 font-medium text-muted-foreground w-16">Amt</th>
                  <th className="text-right py-2 pl-2 font-medium text-muted-foreground w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPenalties.map((p) => (
                  <tr key={p._id} className={`border-b border-muted/30 hover:bg-muted/20 ${p.excluded ? "opacity-50 line-through" : ""}`}>
                    <td className="py-1.5 pr-4 font-medium truncate max-w-[150px]">{getPlayerName(p.playerId)}</td>
                    <td className="py-1.5 pr-4 text-muted-foreground truncate max-w-[200px]">{p.reason}</td>
                    <td className="py-1.5 px-2 text-center">
                      <Badge variant="secondary" className="text-xs">-{p.amount}</Badge>
                    </td>
                    <td className="py-1.5 pl-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleExclude(p._id, p.excluded)}
                        className="h-6 px-2 text-xs cursor-pointer"
                      >
                        {p.excluded ? "Include" : "Exclude"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemove(p._id)}
                        className="min-h-9 min-w-9 h-9 w-9 p-0 cursor-pointer text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Yunite Import Panel ─────────────────────────────────────────────────────

function YuniteImportPanel({ seriesId }: { seriesId: Id<"scrimSeries"> }) {
  const series = useQuery(api.scrimSeries.queries.getSeries, { seriesId });
  const importLog = useQuery(api.scrimSeries.queries.getImportLog, { seriesId });
  const importYuniteScores = useAction(api.scrimSeries.importFromYunite.importYuniteScores);
  const deleteImportLog = useMutation(api.scrimSeries.mutations.deleteImportLog);

  const [tournamentId, setTournamentId] = useState("");
  const [sessionNumber, setSessionNumber] = useState("1");
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"scrimSeriesImportLog"> | null>(null);

  if (!series) return <Skeleton className="h-40 w-full" />;

  const handleImport = async () => {
    if (!tournamentId.trim()) {
      toast.error("Please enter a Tournament ID");
      return;
    }
    const session = parseInt(sessionNumber, 10);
    if (isNaN(session) || session < 1 || session > 12) {
      toast.error("Session must be between 1 and 12");
      return;
    }
    if (session > series.gamesPerSession.length) {
      toast.error(`This series only has ${series.gamesPerSession.length} sessions`);
      return;
    }

    setImporting(true);
    try {
      const result = await importYuniteScores({
        seriesId,
        tournamentId: tournamentId.trim(),
        sessionNumber: session,
      });
      toast.success(result.message);
      setTournamentId("");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Import failed";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteImport = async (log: {
    _id: Id<"scrimSeriesImportLog">;
    sessionNumber: number;
    tournamentId: string;
  }) => {
    if (
      !confirm(
        `Delete Session ${log.sessionNumber} import (${log.tournamentId})? This removes all scores for that session and any Yunite penalties from this import.`
      )
    ) {
      return;
    }

    setDeletingId(log._id);
    try {
      const result = await deleteImportLog({ importLogId: log._id });
      const scoreMsg = result.scoresKept
        ? "Session scores kept (another import exists for this session)."
        : `Removed ${result.scoresDeleted} scores`;
      toast.success(`Import deleted. ${scoreMsg}, ${result.penaltiesDeleted} penalties removed.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to delete import";
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" /> Import from Yunite
          </CardTitle>
          <CardDescription className="text-xs">
            Enter a Yunite Tournament ID and Session number to pull scores automatically.
            Scores are team-level (all teammates get the same game scores).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-2">
              <label className="text-sm font-medium">Tournament ID</label>
              <Input
                placeholder="e.g. abc123def456"
                value={tournamentId}
                onChange={(e) => setTournamentId(e.target.value)}
                disabled={importing}
              />
              <p className="text-xs text-muted-foreground">
                The Yunite tournament ID (from the leaderboard URL)
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Session (1–{series.gamesPerSession.length})</label>
              <Select value={sessionNumber} onValueChange={setSessionNumber} disabled={importing}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: series.gamesPerSession.length }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      Session {i + 1} ({series.gamesPerSession[i]} games)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={handleImport}
            disabled={importing || !tournamentId.trim()}
            className="cursor-pointer"
          >
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Submit Scores
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Import History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Import History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {importLog === undefined ? (
            <Skeleton className="h-20 w-full" />
          ) : importLog.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No imports yet. Submit a tournament above to get started.
            </p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {importLog.map((log) => (
                <div key={log._id} className="flex items-center gap-3 py-2 px-2 rounded hover:bg-muted/30 text-sm border-b last:border-b-0">
                  <Badge variant="secondary" className="text-xs shrink-0">S{log.sessionNumber}</Badge>
                  <span className="font-mono text-xs text-muted-foreground truncate">{log.tournamentId}</span>
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">
                    {log.playersUpdated} players, {log.penaltiesLogged} penalties
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(log.importedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteImport(log)}
                    disabled={deletingId === log._id}
                    className="min-h-9 min-w-9 h-9 w-9 p-0 shrink-0 cursor-pointer text-destructive hover:text-destructive"
                    title="Delete import"
                  >
                    {deletingId === log._id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Admin Content ──────────────────────────────────────────────────────

function ScrimSeriesAdminContent() {
  const [selectedSeriesId, setSelectedSeriesId] = useState<Id<"scrimSeries"> | null>(null);

  return (
    <div className="space-y-4">
      <SeriesSelector selectedId={selectedSeriesId} onSelect={setSelectedSeriesId} />

      {selectedSeriesId && (
        <Tabs defaultValue="leaderboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="leaderboard" className="cursor-pointer">Leaderboard</TabsTrigger>
            <TabsTrigger value="scores" className="cursor-pointer">Scores</TabsTrigger>
            <TabsTrigger value="yunite" className="cursor-pointer">Yunite Import</TabsTrigger>
            <TabsTrigger value="players" className="cursor-pointer">Players</TabsTrigger>
            <TabsTrigger value="penalties" className="cursor-pointer">Penalties</TabsTrigger>
            <TabsTrigger value="settings" className="cursor-pointer">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="leaderboard">
            <LeaderboardPanel seriesId={selectedSeriesId} />
          </TabsContent>

          <TabsContent value="scores">
            <ScoreEntryGrid seriesId={selectedSeriesId} />
          </TabsContent>

          <TabsContent value="yunite">
            <YuniteImportPanel seriesId={selectedSeriesId} />
          </TabsContent>

          <TabsContent value="players">
            <PlayerManagement seriesId={selectedSeriesId} />
          </TabsContent>

          <TabsContent value="penalties">
            <PenaltyManagement seriesId={selectedSeriesId} />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsPanel seriesId={selectedSeriesId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ─── Page Shell ──────────────────────────────────────────────────────────────

export default function ScrimSeriesAdminPage() {
  return (
    <AdminPageLayout requireModerator title="Scrim Series Manager">
      <ScrimSeriesAdminContent />
    </AdminPageLayout>
  );
}
