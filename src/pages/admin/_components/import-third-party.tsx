import { useState, useRef, useEffect } from "react";
import { useClientPagination } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";
import { useMutation, useQuery, useConvex, useAction, usePaginatedQuery } from "convex/react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Loader2, ExternalLink, FileUp, RefreshCw, Trash2, Edit, Users, Download, Zap, X, Eye, Search, ChevronDown, ChevronRight, CheckSquare, Square, CalendarPlus, Link2, AlertTriangle, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { importPipelineStatusVariant } from "@/lib/import-pipeline-display.ts";
import type { ConvexReactClient } from "convex/react";

const PROCESS_IMPORT_POLL_MS = 2000;
const PROCESS_IMPORT_MAX_WAIT_MS = 30 * 60 * 1000;
const PROCESS_IMPORT_GAP_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPipelineError(message: string): string {
  const trimmed = message.trim();
  if (trimmed.toLowerCase().startsWith("<!doctype")) {
    return "Yunite API gateway error (502/524). Wait a few minutes and run Process Import again.";
  }
  if (trimmed.length > 280) {
    return `${trimmed.slice(0, 280)}…`;
  }
  return trimmed;
}

const API_HEAVY_PIPELINE_STEPS = new Set([
  "sync_match_data",
  "populate_team_members",
]);

type ImportJobOutcome = "completed" | "failed" | "waiting" | "aborted" | "timeout";

async function waitForImportProcessingJob(
  convex: ConvexReactClient,
  importId: Id<"thirdPartyImports">,
  shouldAbort: () => boolean,
): Promise<ImportJobOutcome> {
  const started = Date.now();

  while (Date.now() - started < PROCESS_IMPORT_MAX_WAIT_MS) {
    if (shouldAbort()) {
      return "aborted";
    }

    const state = await convex.query(api.importProcessing.getImportProcessingJob, {
      importId,
    });
    const job = state?.job;

    if (job?.status === "completed") {
      return "completed";
    }
    if (job?.status === "failed") {
      return "failed";
    }
    if (job?.status === "waiting") {
      return "waiting";
    }

    await sleep(PROCESS_IMPORT_POLL_MS);
  }

  return "timeout";
}

export default function ImportThirdParty() {
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("yunite");
  
  // CSV state
  const [csvEventName, setCsvEventName] = useState("");
  const [csvEventDate, setCsvEventDate] = useState("");
  const [csvSource, setCsvSource] = useState("External");
  const [csvLeaderboardUrl, setCsvLeaderboardUrl] = useState("");
  const [csvEventId, setCsvEventId] = useState<string>("none");
  const [allowZbdEventAssignment, setAllowZbdEventAssignment] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [googleDriveUrl, setGoogleDriveUrl] = useState("");
  const [csvImportMethod, setCsvImportMethod] = useState<"file" | "url">("file");
  const [isImportingCSV, setIsImportingCSV] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Yunite Tournament ID Import state (manual backup)
  const [tournamentIds, setTournamentIds] = useState(["", "", "", "", ""]);
  const [isImportingTournaments, setIsImportingTournaments] = useState(false);
  const [lastImportTime, setLastImportTime] = useState<number>(0);
  const [showManualIds, setShowManualIds] = useState(false);
  
  // Auto-fetch recent tournaments state
  type RecentTournament = {
    id: string;
    name: string;
    startedAt: string;
    status?: string;
    teamSize?: number;
    region?: string;
    alreadyImported: boolean;
  };
  const [recentTournaments, setRecentTournaments] = useState<RecentTournament[]>([]);
  const [isFetchingRecent, setIsFetchingRecent] = useState(false);
  const [selectedTournamentIds, setSelectedTournamentIds] = useState<Set<string>>(new Set());
  const [isImportingSelected, setIsImportingSelected] = useState(false);
  const [hasFetchedRecent, setHasFetchedRecent] = useState(false);
  
  // Shared state
  const [rematchingId, setRematchingId] = useState<Id<"thirdPartyImports"> | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"thirdPartyImports"> | null>(null);
  const [downloadingId, setDownloadingId] = useState<Id<"thirdPartyImports"> | null>(null);
  const [syncingId, setSyncingId] = useState<Id<"thirdPartyImports"> | null>(null);
  const [processingImportId, setProcessingImportId] = useState<Id<"thirdPartyImports"> | null>(null);
  const [populatingTeamMembersId, setPopulatingTeamMembersId] = useState<Id<"thirdPartyImports"> | null>(null);
  const [editingImport, setEditingImport] = useState<Id<"thirdPartyImports"> | null>(null);
  const [editEventName, setEditEventName] = useState("");
  const [editEventDate, setEditEventDate] = useState("");
  const [editOrganizer, setEditOrganizer] = useState("");
  const [editLeaderboardUrl, setEditLeaderboardUrl] = useState("");
  const [editLinkedEventId, setEditLinkedEventId] = useState<string>("none");
  const [isUpdating, setIsUpdating] = useState(false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [isReplacingCSV, setIsReplacingCSV] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  
  // Create Event from Import state
  const [creatingEventFromImport, setCreatingEventFromImport] = useState<Id<"thirdPartyImports"> | null>(null);
  const [createEventName, setCreateEventName] = useState("");
  const [createEventType, setCreateEventType] = useState<string>("scrim");
  const [createEventMode, setCreateEventMode] = useState<string>("ZB Main Map");
  const [createEventStartDate, setCreateEventStartDate] = useState("");
  const [createEventEndDate, setCreateEventEndDate] = useState("");
  const [createEventDescription, setCreateEventDescription] = useState("");
  const [createEventLeaderboards, setCreateEventLeaderboards] = useState<string[]>([""]);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  
  // Queries and mutations
  const convex = useConvex();
  const importFromCSV = useMutation(api.thirdPartyMutations.importFromCSV);
  const rematchImport = useMutation(api.thirdPartyMutations.rematchImport);
  const deleteImport = useMutation(api.thirdPartyMutations.deleteImport);
  const updateImportDetails = useMutation(api.thirdPartyMutations.updateImportDetails);
  const linkImportToEvent = useMutation(api.thirdPartyMutations.linkImportToEvent);
  const replaceCSVData = useMutation(api.thirdPartyMutations.replaceCSVData);
  const refreshAllImports = useMutation(api.thirdPartyMutations.refreshAllImports);
  const startProcessImport = useMutation(api.importProcessing.startProcessImport);
  const unlockImport = useMutation(api.importProcessing.unlockImport);
  const reprocessImport = useMutation(api.importProcessing.reprocessImport);
  const importProcessingState = useQuery(
    api.importProcessing.getImportProcessingJob,
    processingImportId ? { importId: processingImportId } : "skip",
  );

  useEffect(() => {
    if (processAllActiveRef.current) return;

    const job = importProcessingState?.job;
    if (!processingImportId || !job) return;
    if (job.status === "completed") {
      toast.success(job.progressMessage || "Import processing complete.");
      setProcessingImportId(null);
    } else if (job.status === "failed") {
      toast.error(job.errorMessage || "Import processing failed.");
      setProcessingImportId(null);
    } else if (job.status === "waiting") {
      toast.info(job.errorMessage || "Import needs admin action before continuing.");
      setProcessingImportId(null);
    }
  }, [importProcessingState?.job?.status, processingImportId]);
  const backfillLeaderboardLinks = useMutation(api.thirdPartyMutations.backfillLeaderboardLinks);
  const createEvent = useMutation(api.events.management.createEvent);
  const { results: importHistory, status: importHistoryStatus, loadMore: loadMoreImports } = usePaginatedQuery(
    api.thirdPartyQueries.getImportHistory,
    {},
    { initialNumItems: 50 }
  );
  const importHistoryPagination = useClientPagination(importHistory);
  const events = useQuery(api.events.management.getAllEvents, {});
  const csvDuplicateMatches = useQuery(
    api.thirdPartyQueries.findPotentialDuplicateImports,
    isAdmin && activeTab === "csv" && (
      csvEventName.trim() || csvEventDate.trim() || csvLeaderboardUrl.trim()
    )
      ? {
          eventName: csvEventName,
          eventDate: csvEventDate || undefined,
          leaderboardUrl: csvLeaderboardUrl || undefined,
          source: csvSource,
        }
      : "skip",
  );
  const manualTournamentIds = tournamentIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  const manualDuplicateMatches = useQuery(
    api.thirdPartyQueries.findPotentialDuplicateImports,
    isAdmin && activeTab === "yunite" && showManualIds && manualTournamentIds.length > 0
      ? { tournamentIds: manualTournamentIds, source: "Yunite" }
      : "skip",
  );
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [processAllProgress, setProcessAllProgress] = useState({ current: 0, total: 0 });
  const [isBackfilling, setIsBackfilling] = useState(false);
  const processAllAbortRef = useRef(false);
  const processAllActiveRef = useRef(false);
  
  // Yunite actions
  const fetchLeaderboard = useAction(api.yunite.debug.fetchTournamentLeaderboard);
  const saveImport = useAction(api.yunite.debug.saveTournamentImport);
  const populateTeamMembersForImport = useAction(api.yunite.populateTeamMembers.populateForImport);
  const syncTournamentMatchData = useAction(api.yunite.sync.syncTournamentMatchData);
  const listRecentTournaments = useAction(api.yunite.sync.listRecentTournaments);
  const inspectTournamentRaw = useAction(api.yunite.debug.inspectTournamentRaw);
  const fetchTournamentMatches = useAction(api.yunite.debug.fetchTournamentMatches);
  const [inspectingTournamentId, setInspectingTournamentId] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<Record<string, unknown> | null>(null);
  const [inspectMatchesResult, setInspectMatchesResult] = useState<unknown[] | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isInspectingMatches, setIsInspectingMatches] = useState(false);
  const [inspectTab, setInspectTab] = useState<"tournament" | "matches">("tournament");
  
  // CSV parsing
  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      throw new Error("CSV must have at least a header row and one data row");
    }
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const entries = [];
    
    const epicIdx = headers.findIndex(h => h.includes('epic'));
    const discordIdIdx = headers.findIndex(h => {
      const normalized = h.replace(/[-_\s]/g, '').toLowerCase();
      return normalized === 'discordid' || 
             (h.includes('discord') && h.includes('id') && !h.includes('user') && !h.includes('name'));
    });
    const discordUsernameIdx = headers.findIndex(h => 
      (h.includes('discord') && (h.includes('user') || h.includes('name'))) ||
      h.includes('discordusername')
    );
    const discordIdx = headers.findIndex(h => 
      h.includes('discord') && 
      headers.indexOf(h) !== discordIdIdx && 
      headers.indexOf(h) !== discordUsernameIdx
    );
    const placementIdx = headers.findIndex(h => h.includes('placement') || h.includes('place') || h.includes('rank'));
    const pointsIdx = headers.findIndex(h => h.includes('points') || h.includes('score'));
    const elimsIdx = headers.findIndex(h => h.includes('elim') || h.includes('kills'));
    const winsIdx = headers.findIndex(h => h === 'wins' || h === 'totalwins');
    const teamIdIdx = headers.findIndex(h => h.includes('team') && h.includes('id'));
    const teamNameIdx = headers.findIndex(h => h.includes('team') && h.includes('name'));
    
    if (epicIdx === -1) throw new Error("CSV must have an 'Epic Username' column");
    if (placementIdx === -1) throw new Error("CSV must have a 'Placement' or 'Rank' column");
    if (pointsIdx === -1) throw new Error("CSV must have a 'Points' or 'Score' column");
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const epicUsername = values[epicIdx];
      if (!epicUsername) continue;
      
      const placement = parseInt(values[placementIdx]);
      const points = parseInt(values[pointsIdx]);
      if (isNaN(placement) || isNaN(points)) continue;
      
      let discordUsername: string | undefined;
      let discordId: string | undefined;
      
      if (discordIdIdx !== -1 && values[discordIdIdx]) {
        discordId = values[discordIdIdx].trim();
      }
      if (discordUsernameIdx !== -1 && values[discordUsernameIdx]) {
        discordUsername = values[discordUsernameIdx].trim();
      }
      if (discordIdx !== -1 && values[discordIdx]) {
        const discordValue = values[discordIdx].trim();
        if (discordValue && /^\d{17,19}$/.test(discordValue)) {
          if (!discordId) discordId = discordValue;
        } else {
          if (!discordUsername) discordUsername = discordValue;
        }
      }
      
      entries.push({
        epicUsername,
        discordUsername,
        discordId,
        placement,
        points,
        eliminations: elimsIdx !== -1 ? parseInt(values[elimsIdx]) : undefined,
        wins: winsIdx !== -1 ? parseInt(values[winsIdx]) : undefined,
        teamId: teamIdIdx !== -1 && values[teamIdIdx] ? values[teamIdIdx].trim() : undefined,
        teamName: teamNameIdx !== -1 && values[teamNameIdx] ? values[teamNameIdx].trim() : undefined,
      });
    }
    
    return entries;
  };
  
  const extractGoogleDriveFileId = (url: string): string | null => {
    const patterns = [
      /\/file\/d\/([^/]+)/,
      /id=([^&]+)/,
      /\/d\/([^/]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };
  
  const fetchGoogleDriveFile = async (url: string): Promise<string> => {
    const fileId = extractGoogleDriveFileId(url);
    if (!fileId) {
      throw new Error("Invalid Google Drive URL. Please use a share link.");
    }
    
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error("Failed to fetch file from Google Drive. Make sure the file is publicly accessible.");
    }
    
    return await response.text();
  };
  
  // CSV Import Handler
  const handleCSVImport = async () => {
    if (!csvEventName.trim()) {
      toast.error("Please enter an event name");
      return;
    }
    
    if (csvImportMethod === "file" && !selectedFile) {
      toast.error("Please select a CSV file");
      return;
    }
    
    if (csvImportMethod === "url" && !googleDriveUrl.trim()) {
      toast.error("Please enter a Google Drive URL");
      return;
    }
    
    setIsImportingCSV(true);
    
    try {
      let text: string;
      
      if (csvImportMethod === "file" && selectedFile) {
        text = await selectedFile.text();
      } else if (csvImportMethod === "url") {
        text = await fetchGoogleDriveFile(googleDriveUrl);
      } else {
        throw new Error("No file selected");
      }
      
      const entries = parseCSV(text);
      
      if (entries.length === 0) {
        toast.error("No valid entries found in CSV");
        return;
      }
      
      const result = await importFromCSV({
        eventName: csvEventName.trim(),
        eventDate: csvEventDate.trim() || undefined,
        source: csvSource.trim() || "External",
        leaderboardUrl: csvLeaderboardUrl.trim() || undefined,
        eventId: csvEventId !== "none" ? csvEventId as Id<"events"> : undefined,
        entries,
      });
      
      toast.success(`✅ Imported "${result.eventName}": ${result.playersMatched} matched, ${result.playersUnmatched} unmatched`);
      
      // Reset form
      setCsvEventName("");
      setCsvEventDate("");
      setCsvLeaderboardUrl("");
      setCsvEventId("none");
      setSelectedFile(null);
      setGoogleDriveUrl("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("CSV import error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to import CSV");
    } finally {
      setIsImportingCSV(false);
    }
  };
  
  // Inspect raw tournament data from Yunite API
  const handleInspectTournament = async (tournamentId: string) => {
    setInspectingTournamentId(tournamentId);
    setIsInspecting(true);
    setInspectResult(null);
    setInspectMatchesResult(null);
    setInspectTab("tournament");
    try {
      const result = await inspectTournamentRaw({ tournamentId });
      setInspectResult(result.raw as Record<string, unknown>);
      toast.success("Tournament data loaded");
    } catch (error) {
      console.error("Inspect error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to inspect tournament");
      setInspectingTournamentId(null);
    } finally {
      setIsInspecting(false);
    }
  };

  // Inspect raw match list data from Yunite API
  const handleInspectMatches = async () => {
    if (!inspectingTournamentId) return;
    setIsInspectingMatches(true);
    try {
      const result = await fetchTournamentMatches({ tournamentId: inspectingTournamentId });
      setInspectMatchesResult(result.matches as unknown[]);
      toast.success(`Loaded ${result.totalMatches} matches`);
    } catch (error) {
      console.error("Inspect matches error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to fetch matches");
    } finally {
      setIsInspectingMatches(false);
    }
  };
  
  // Fetch recent tournaments from Yunite API
  const handleFetchRecentTournaments = async () => {
    setIsFetchingRecent(true);
    try {
      const result = await listRecentTournaments({});
      if (!result.success) {
        toast.error(result.error || "Failed to fetch tournaments");
        return;
      }
      setRecentTournaments(result.tournaments);
      setSelectedTournamentIds(new Set());
      setHasFetchedRecent(true);
      
      const importable = result.tournaments.filter(t => !t.alreadyImported).length;
      const skippedNote =
        result.skippedEmpty > 0
          ? `; ${result.skippedEmpty} empty tournament${result.skippedEmpty === 1 ? "" : "s"} hidden`
          : "";
      toast.success(
        `Found ${result.tournaments.length} tournaments (${importable} not yet imported)${skippedNote}`,
      );
    } catch (error) {
      console.error("Fetch recent error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to fetch tournaments");
    } finally {
      setIsFetchingRecent(false);
    }
  };
  
  // Toggle selection for a single tournament
  const toggleTournamentSelection = (id: string) => {
    setSelectedTournamentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  
  // Select/deselect all importable tournaments
  const toggleSelectAll = () => {
    const importable = recentTournaments.filter(t => !t.alreadyImported);
    if (selectedTournamentIds.size === importable.length) {
      setSelectedTournamentIds(new Set());
    } else {
      setSelectedTournamentIds(new Set(importable.map(t => t.id)));
    }
  };
  
  // Import selected tournaments
  const handleImportSelected = async () => {
    if (selectedTournamentIds.size === 0) {
      toast.error("Please select at least one tournament to import");
      return;
    }
    
    setIsImportingSelected(true);
    let successCount = 0;
    let failCount = 0;
    const ids = Array.from(selectedTournamentIds);
    
    try {
      for (let i = 0; i < ids.length; i++) {
        const tournamentId = ids[i];
        const tournament = recentTournaments.find(t => t.id === tournamentId);
        
        try {
          const leaderboardData = await fetchLeaderboard({ tournamentId });
          await saveImport({
            tournamentId: leaderboardData.tournamentId,
            tournamentName: leaderboardData.tournamentName,
            tournamentStartedAt: leaderboardData.tournamentStartedAt || undefined,
            leaderboard: leaderboardData.leaderboard,
            fetchMatchData: false,
          });
          
          successCount++;
          toast.success(`Imported: ${tournament?.name || tournamentId} (${i + 1}/${ids.length})`);
          
          // Mark as imported in the local state
          setRecentTournaments(prev => prev.map(t => 
            t.id === tournamentId ? { ...t, alreadyImported: true } : t
          ));
        } catch (error) {
          failCount++;
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          if (errorMessage.includes("already been imported")) {
            toast.error(`${tournament?.name || tournamentId}: Already imported`);
          } else {
            toast.error(`${tournament?.name || tournamentId}: ${errorMessage}`);
          }
        }
        
        // Always wait between requests (success or failure) to avoid Yunite rate limits
        if (i < ids.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      if (successCount > 0 && failCount === 0) {
        toast.success(`All ${successCount} tournament(s) imported successfully`);
      } else if (successCount > 0) {
        toast.warning(`Imported ${successCount}, failed ${failCount}`);
      }
      
      setSelectedTournamentIds(new Set());
      setLastImportTime(Date.now());
    } catch (error) {
      toast.error("Failed to complete import");
    } finally {
      setIsImportingSelected(false);
    }
  };
  
  // Bulk Tournament ID Import Handler (manual backup)
  const handleBulkTournamentImport = async () => {
    const validIds = tournamentIds.filter(id => id.trim() !== "");
    
    if (validIds.length === 0) {
      toast.error("Please enter at least one tournament ID");
      return;
    }
    
    setIsImportingTournaments(true);
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];
    
    try {
      for (let i = 0; i < validIds.length; i++) {
        const tournamentId = validIds[i].trim();
        
        try {
          // Fetch leaderboard
          const leaderboardData = await fetchLeaderboard({ tournamentId });
          
          // Save import
          await saveImport({
            tournamentId: leaderboardData.tournamentId,
            tournamentName: leaderboardData.tournamentName,
            tournamentStartedAt: leaderboardData.tournamentStartedAt || undefined,
            leaderboard: leaderboardData.leaderboard,
            fetchMatchData: false,
          });
          
          successCount++;
          toast.success(`Imported: ${leaderboardData.tournamentName}`);
        } catch (error) {
          failCount++;
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          errors.push(`${tournamentId}: ${errorMessage}`);
          console.error(`Failed to import tournament ${tournamentId}:`, error);
          
          // Show individual error
          if (errorMessage.includes("already been imported")) {
            toast.error(`${tournamentId}: Already imported`);
          } else if (errorMessage.includes("Failed to fetch")) {
            toast.error(`${tournamentId}: Invalid ID or tournament not found`);
          } else {
            toast.error(`${tournamentId}: ${errorMessage}`);
          }
        }
        
        // Always wait between requests (success or failure) to avoid Yunite rate limits
        if (i < validIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Summary message
      if (successCount > 0 && failCount === 0) {
        toast.success(`🎉 All ${successCount} tournament(s) imported successfully`);
      } else if (successCount > 0 && failCount > 0) {
        toast.warning(`Imported ${successCount}, failed ${failCount}`);
      } else if (failCount > 0) {
        toast.error(`Failed to import all ${failCount} tournament(s)`);
      }
      
      // Reset form
      setTournamentIds(["", "", "", "", ""]);
      setLastImportTime(Date.now());
    } catch (error) {
      console.error("Bulk import error:", error);
      toast.error("Failed to complete bulk import");
    } finally {
      setIsImportingTournaments(false);
    }
  };
  
  const handleProcessImport = async (importId: Id<"thirdPartyImports">) => {
    setProcessingImportId(importId);
    try {
      await startProcessImport({ importId });
      toast.success("Process Import started — progress will continue in the background.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start Process Import");
      setProcessingImportId(null);
    }
  };

  const handleProcessAllImports = async () => {
    const { imports: eligible, alreadyComplete } = await convex.query(
      api.importProcessing.listImportsNeedingProcessing,
      {},
    );

    if (eligible.length === 0) {
      toast.info(
        alreadyComplete > 0
          ? `No imports need processing (${alreadyComplete} already complete).`
          : "No Yunite imports need processing.",
      );
      return;
    }

    const syncCount = eligible.filter((imp) => imp.nextStep === "sync_match_data").length;
    const detailParts = [
      `${eligible.length} import(s) need work`,
      alreadyComplete > 0 ? `${alreadyComplete} already complete` : null,
      syncCount > 0 ? `${syncCount} include match-data sync (slowest)` : null,
    ].filter(Boolean);

    if (
      !confirm(
        `Process ${detailParts.join(" · ")}?\n\nRuns one import at a time and skips steps already done. The queue pauses if an import needs admin action or fails.`,
      )
    ) {
      return;
    }

    processAllActiveRef.current = true;
    processAllAbortRef.current = false;
    setIsProcessingAll(true);
    setProcessAllProgress({ current: 0, total: eligible.length });

    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < eligible.length; i++) {
        if (processAllAbortRef.current) {
          break;
        }

        const imp = eligible[i];
        setProcessAllProgress({ current: i + 1, total: eligible.length });
        setProcessingImportId(imp._id);

        try {
          await startProcessImport({ importId: imp._id });
        } catch (error) {
          failCount += 1;
          toast.error(
            `${imp.eventName}: ${error instanceof Error ? error.message : "Failed to start"}`,
          );
          break;
        }

        const outcome = await waitForImportProcessingJob(
          convex,
          imp._id,
          () => processAllAbortRef.current,
        );

        if (outcome === "aborted") {
          break;
        }

        if (outcome === "completed") {
          successCount += 1;
        } else {
          failCount += 1;
          const state = await convex.query(api.importProcessing.getImportProcessingJob, {
            importId: imp._id,
          });
          const message =
            state?.job?.errorMessage ||
            (outcome === "timeout"
              ? "Timed out waiting for the pipeline to finish."
              : "Import processing did not complete.");

          if (outcome === "waiting") {
            toast.info(`Queue paused at ${imp.eventName}: ${message}`);
          } else {
            toast.error(`Queue stopped at ${imp.eventName}: ${message}`);
          }
          break;
        }

        if (
          i < eligible.length - 1 &&
          !processAllAbortRef.current &&
          API_HEAVY_PIPELINE_STEPS.has(imp.nextStep)
        ) {
          await sleep(PROCESS_IMPORT_GAP_MS);
        }
      }

      if (processAllAbortRef.current) {
        toast.info(
          `Batch aborted after ${successCount} of ${eligible.length} import(s) finalized.`,
        );
      } else if (successCount === eligible.length) {
        toast.success(`Batch complete — ${successCount} import(s) processed.`);
      } else if (successCount > 0) {
        toast.info(
          `Batch stopped — ${successCount} finalized, ${eligible.length - successCount - failCount} remaining.`,
        );
      }
    } catch (error) {
      console.error("Process all imports error:", error);
      toast.error(error instanceof Error ? error.message : "Batch processing interrupted");
    } finally {
      processAllActiveRef.current = false;
      setIsProcessingAll(false);
      setProcessingImportId(null);
      setProcessAllProgress({ current: 0, total: 0 });
      processAllAbortRef.current = false;
    }
  };

  const handleUnlockImport = async (importId: Id<"thirdPartyImports">) => {
    if (!confirm("Unlock this import so it can be processed again? Yunite steps will not re-run unless you choose Reprocess.")) {
      return;
    }
    try {
      await unlockImport({ importId });
      toast.success("Import unlocked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unlock import");
    }
  };

  const handleReprocessImport = async (importId: Id<"thirdPartyImports">) => {
    if (!confirm("Reprocess this import from scratch? This may re-fetch Yunite data and re-run all pipeline steps.")) {
      return;
    }
    setProcessingImportId(importId);
    try {
      await reprocessImport({ importId });
      toast.success("Reprocess Import started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reprocess import");
      setProcessingImportId(null);
    }
  };

  const handleRematch = async (importId: Id<"thirdPartyImports">) => {
    setRematchingId(importId);
    try {
      const result = await rematchImport({ importId });
      if (result.newMatches > 0) {
        toast.success(`✅ Re-matched players: ${result.newMatches} new matches found`);
      } else {
        toast.info("No new matches found");
      }
    } catch (error) {
      toast.error("Failed to re-match players");
    } finally {
      setRematchingId(null);
    }
  };
  
  const handlePopulateTeamMembersForImport = async (importId: Id<"thirdPartyImports">) => {
    setPopulatingTeamMembersId(importId);
    try {
      const result = await populateTeamMembersForImport({ importId });
      if (result.updated > 0) {
        toast.success(`✅ Populated team members for ${result.updated} results`);
      } else {
        toast.info("No team members found to populate");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to populate team members");
    } finally {
      setPopulatingTeamMembersId(null);
    }
  };
  
  const handleDelete = async (importId: Id<"thirdPartyImports">) => {
    if (!confirm("Are you sure you want to delete this import and all its results?")) {
      return;
    }
    
    setDeletingId(importId);
    try {
      await deleteImport({ importId });
      toast.success("Import deleted successfully");
    } catch (error) {
      toast.error("Failed to delete import");
    } finally {
      setDeletingId(null);
    }
  };
  
  const openEditDialog = (importRecord: { _id: Id<"thirdPartyImports">; eventName: string; eventDate?: string; organizer?: string; leaderboardUrl?: string; eventId?: Id<"events"> }) => {
    setEditingImport(importRecord._id);
    setEditEventName(importRecord.eventName);
    setEditEventDate(importRecord.eventDate || "");
    setEditOrganizer(importRecord.organizer || "");
    setEditLeaderboardUrl(importRecord.leaderboardUrl || "");
    setEditLinkedEventId(importRecord.eventId || "none");
    setReplaceFile(null);
  };
  
  const handleUpdate = async () => {
    if (!editingImport) return;
    
    setIsUpdating(true);
    try {
      await updateImportDetails({
        importId: editingImport,
        eventName: editEventName.trim() || undefined,
        eventDate: editEventDate.trim() || undefined,
        organizer: editOrganizer.trim() || undefined,
        leaderboardUrl: editLeaderboardUrl.trim() || undefined,
      });
      
      // Update event link separately
      await linkImportToEvent({
        importId: editingImport,
        eventId: editLinkedEventId !== "none" ? editLinkedEventId as Id<"events"> : null,
      });
      
      toast.success("Import details updated");
      setEditingImport(null);
    } catch (error) {
      toast.error("Failed to update import");
    } finally {
      setIsUpdating(false);
    }
  };
  
  const handleReplaceCSV = async () => {
    if (!editingImport || !replaceFile) return;
    
    setIsReplacingCSV(true);
    try {
      const text = await replaceFile.text();
      const entries = parseCSV(text);
      
      if (entries.length === 0) {
        toast.error("No valid entries found in CSV");
        return;
      }
      
      const result = await replaceCSVData({
        importId: editingImport,
        entries,
      });
      
      toast.success(`CSV replaced: ${result.playersMatched} matched, ${result.playersUnmatched} unmatched`);
      setEditingImport(null);
      setReplaceFile(null);
    } catch (error) {
      console.error("Replace CSV error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to replace CSV");
    } finally {
      setIsReplacingCSV(false);
    }
  };
  
  const handleRefreshAll = async () => {
    if (!confirm("This will re-match all imports with current player database. Continue?")) {
      return;
    }

    setIsRefreshingAll(true);
    try {
      const result = await refreshAllImports({});
      toast.success(`Refreshed ${result.rematchedImports} imports with ${result.totalNewMatches} new matches`);
    } catch (error) {
      toast.error("Failed to refresh imports");
    } finally {
      setIsRefreshingAll(false);
    }
  };

  const handleBackfillLeaderboardLinks = async () => {
    setIsBackfilling(true);
    try {
      const result = await backfillLeaderboardLinks({});
      toast.success(
        `Backfill complete: ${result.linksAdded} links added to ${result.eventsUpdated} events`,
      );
    } catch {
      toast.error("Backfill failed");
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleDownloadCSV = async (importId: Id<"thirdPartyImports">) => {
    setDownloadingId(importId);
    try {
      // Fetch import details
      const importDetails = await convex.query(api.thirdPartyQueries.getImportDetails, { importId });
      
      if (!importDetails) {
        toast.error("Import not found");
        return;
      }
      
      const eventName = importDetails.eventName;
      
      // Convert results to CSV
      const headers = [
        "Epic Username",
        "Discord Username",
        "Discord ID",
        "Placement",
        "Points",
        "Eliminations",
        "Wins",
        "Team ID",
        "Team Name"
      ];
      
      const rows = importDetails.results.map(result => [
        result.epicUsername || "",
        result.discordUsername || "",
        result.discordId || "",
        result.placement.toString(),
        result.points.toString(),
        (result.eliminations || "").toString(),
        (result.wins || "").toString(),
        result.teamId || "",
        result.teamName || ""
      ]);
      
      // Create CSV content
      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
      ].join("\n");
      
      // Trigger download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success("CSV downloaded successfully");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download CSV");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSyncMatchData = async (importId: Id<"thirdPartyImports">) => {
    setSyncingId(importId);
    try {
      await syncTournamentMatchData({ importId });
      toast.success("Match data synced successfully!");
    } catch (error) {
      console.error("Sync error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to sync match data");
    } finally {
      setSyncingId(null);
    }
  };

  // Detect mode from event name (e.g., "Reload" in name → Reload mode)
  const detectModeFromName = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.includes("reload")) return "Reload";
    return "ZB Main Map";
  };

  // Detect event type from event name
  const detectTypeFromName = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.includes("season") && lower.includes("mini")) return "mini-season";
    if (lower.includes("season")) return "season";
    if (lower.includes("minicup") || lower.includes("mini cup") || lower.includes("mini-cup")) return "scrim";
    if (lower.includes("random") && lower.includes("trio")) return "random-trios";
    if (lower.includes("random") && lower.includes("squad")) return "random-squads";
    if (lower.includes("random")) return "random";
    if (lower.includes("solos meets") || lower.includes("smd")) return "solos-meets-duos";
    return "scrim";
  };

  // Open the create-event dialog from an import record
  const openCreateEventDialog = (imp: {
    _id: Id<"thirdPartyImports">;
    eventName: string;
    eventDate?: string;
    leaderboardUrl?: string;
    leaderboardId?: string;
    eventId?: Id<"events">;
  }) => {
    setCreatingEventFromImport(imp._id);
    setCreateEventName(imp.eventName);
    setCreateEventType(detectTypeFromName(imp.eventName));
    setCreateEventMode(detectModeFromName(imp.eventName));
    
    // Parse event date for start/end
    if (imp.eventDate) {
      // If it's already a date string, use it directly
      const dateStr = imp.eventDate.split("T")[0]; // handle ISO strings
      setCreateEventStartDate(dateStr);
      setCreateEventEndDate(dateStr);
    } else {
      setCreateEventStartDate("");
      setCreateEventEndDate("");
    }
    
    setCreateEventDescription("");
    
    // Auto-fetch tournament description and real date from Yunite if it's a Yunite import
    if (imp.leaderboardId && imp.leaderboardId.startsWith("yunite-")) {
      const tournamentId = imp.leaderboardId.replace("yunite-", "");
      inspectTournamentRaw({ tournamentId })
        .then((result) => {
          const raw = result.raw as Record<string, unknown>;
          if (raw.description && typeof raw.description === "string") {
            setCreateEventDescription(raw.description);
          }
          // Use the real tournament startedAt date instead of the import upload date
          if (raw.startedAt && typeof raw.startedAt === "string") {
            try {
              const realDate = new Date(raw.startedAt).toISOString().split("T")[0];
              setCreateEventStartDate(realDate);
              setCreateEventEndDate(realDate);
            } catch {
              // Keep the fallback import date if parsing fails
            }
          }
        })
        .catch((err) => {
          console.warn("Could not fetch tournament details:", err);
        });
    }
    
    // Build leaderboard URL from leaderboardId or leaderboardUrl
    const leaderboardUrl = imp.leaderboardId && !imp.leaderboardId.startsWith("CSV")
      ? `https://yunite.xyz/leaderboard/${imp.leaderboardId.replace("yunite-", "")}`
      : imp.leaderboardUrl && !imp.leaderboardUrl.startsWith("CSV Import:")
        ? imp.leaderboardUrl
        : "";
    setCreateEventLeaderboards(leaderboardUrl ? [leaderboardUrl] : [""]);
  };

  // Handle creating event from import
  const handleCreateEventFromImport = async () => {
    if (!creatingEventFromImport) return;
    if (!createEventName.trim()) {
      toast.error("Event name is required");
      return;
    }
    if (!createEventStartDate || !createEventEndDate) {
      toast.error("Start and end dates are required");
      return;
    }
    
    setIsCreatingEvent(true);
    try {
      const filteredLeaderboards = createEventLeaderboards.filter(u => u.trim() !== "");
      
      const eventId = await createEvent({
        name: createEventName.trim(),
        type: createEventType as "scrim" | "season" | "mini-season" | "random" | "random-squads" | "random-trios" | "solos-meets-duos" | "scrim-series" | "showdown",
        mode: createEventMode as "ZB Main Map" | "Reload",
        startDate: createEventStartDate,
        endDate: createEventEndDate,
        description: createEventDescription.trim() || undefined,
        standardLeaderboards: filteredLeaderboards.length > 0 ? filteredLeaderboards : undefined,
      });
      
      // Also link this import to the newly created event
      await linkImportToEvent({
        importId: creatingEventFromImport,
        eventId,
      });
      
      toast.success(`Event "${createEventName}" created and linked to import`);
      setCreatingEventFromImport(null);
    } catch (error) {
      console.error("Create event error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create event");
    } finally {
      setIsCreatingEvent(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  const isYuniteSource = (source: string) => {
    const normalized = source.trim().toLowerCase();
    return normalized === "yunite" || normalized === "yunite api";
  };

  const renderDuplicateWarning = (
    matches:
      | Array<{
          _id: Id<"thirdPartyImports">;
          eventName: string;
          eventDate?: string;
          source: string;
          totalPlayers: number;
          playersUnmatched: number;
          reasons: string[];
        }>
      | undefined,
  ) => {
    if (!matches || matches.length === 0) return null;

    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">Possible duplicate import</p>
              <p className="text-xs">
                This is warning-only. Imports are still allowed and existing import
                behaviour is unchanged.
              </p>
            </div>
            <div className="space-y-2">
              {matches.map((match) => (
                <div key={match._id} className="text-xs space-y-1">
                  <div>
                    <span className="font-medium">{match.eventName}</span>
                    {match.eventDate ? ` - ${match.eventDate}` : ""}
                    <span className="text-amber-800">
                      {" "}
                      ({match.source}, {match.totalPlayers} players,{" "}
                      {match.reasons.join(", ")})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isYuniteSource(match.source) ? (
                      <Button
                        asChild
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-amber-950 underline-offset-2"
                      >
                        <Link to={`/admin/yunite/${match._id}`}>View existing import</Link>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-amber-950 underline-offset-2"
                        onClick={() => setActiveTab("history")}
                      >
                        View in import history
                      </Button>
                    )}
                    {match.playersUnmatched > 0 && (
                      <Button
                        asChild
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-amber-950 underline-offset-2"
                      >
                        <Link to={`/admin/unmatched/${match._id}`}>
                          {match.playersUnmatched} unmatched
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 border-amber-300 bg-white/70 text-amber-950 hover:bg-white"
              onClick={() => setActiveTab("history")}
            >
              View history
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-sm">Import Leaderboard Data</CardTitle>
            <CardDescription className="text-xs">
              Yunite API for ZBD event records; Third Party CSV for external tournaments; import history below
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Button asChild variant="ghost" size="sm" className="h-7 px-2">
              <Link to="/admin">Admin</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-7 px-2">
              <Link to="/admin/events-manager">Events</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-7 px-2">
              <Link to="/admin/event-results">Results</Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="py-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="yunite">Yunite API</TabsTrigger>
            <TabsTrigger value="csv">Third Party CSV</TabsTrigger>
            <TabsTrigger value="history">Import History</TabsTrigger>
          </TabsList>

          {/* Yunite API Import Tab (Primary) */}
          <TabsContent value="yunite" className="space-y-4">
            <div className="space-y-4">
              {/* Auto-fetch section (primary) */}
              <div className="bg-muted/50 border rounded-lg p-4">
                <h4 className="font-medium mb-2">Fetch Recent Tournaments</h4>
                <p className="text-sm text-muted-foreground">
                  Pull all recent tournaments from your Yunite server. Select which ones to import.
                </p>
              </div>
              
              <Button
                onClick={handleFetchRecentTournaments}
                disabled={isFetchingRecent || isImportingSelected}
                className="w-full"
              >
                {isFetchingRecent ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fetching Tournaments...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    {hasFetchedRecent ? "Refresh Tournament List" : "Fetch Recent Tournaments"}
                  </>
                )}
              </Button>
              
              {/* Tournament list */}
              {hasFetchedRecent && (
                <div className="space-y-2">
                  {recentTournaments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No tournaments found for this guild.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {recentTournaments.length} tournaments found
                          {selectedTournamentIds.size > 0 && ` (${selectedTournamentIds.size} selected)`}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={toggleSelectAll}
                          disabled={recentTournaments.every(t => t.alreadyImported)}
                        >
                          {selectedTournamentIds.size === recentTournaments.filter(t => !t.alreadyImported).length
                            ? "Deselect All"
                            : "Select All New"}
                        </Button>
                      </div>
                      
                      <div className="border rounded-lg max-h-80 overflow-y-auto">
                        {recentTournaments.map((t) => {
                          const dateStr = t.startedAt
                            ? format(new Date(t.startedAt), "MMM d, yyyy 'at' h:mm a")
                            : "Unknown date";
                          const isSelected = selectedTournamentIds.has(t.id);
                          
                          return (
                            <div
                              key={t.id}
                              className={`flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 transition-colors ${
                                t.alreadyImported
                                  ? "opacity-50 cursor-not-allowed bg-muted/30"
                                  : isSelected
                                    ? "bg-primary/5 cursor-pointer"
                                    : "hover:bg-muted/50 cursor-pointer"
                              }`}
                              onClick={() => {
                                if (!t.alreadyImported) {
                                  toggleTournamentSelection(t.id);
                                }
                              }}
                            >
                              <div
                                className="flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {t.alreadyImported ? (
                                  <Badge variant="secondary" className="text-xs">
                                    Imported
                                  </Badge>
                                ) : (
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleTournamentSelection(t.id)}
                                  />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{t.name}</p>
                                <p className="text-xs text-muted-foreground">{dateStr}</p>
                              </div>
                              <div className="flex-shrink-0 text-xs text-muted-foreground font-mono hidden sm:block">
                                {t.id}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="flex-shrink-0 h-7 w-7"
                                title="Inspect raw tournament data"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleInspectTournament(t.id);
                                }}
                                disabled={isInspecting && inspectingTournamentId === t.id}
                              >
                                {isInspecting && inspectingTournamentId === t.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              <a
                                href={`https://yunite.xyz/leaderboard/${t.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                                onClick={(e) => e.stopPropagation()}
                                title="View on Yunite"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </div>
                          );
                        })}
                      </div>
                      
                      <Button
                        onClick={handleImportSelected}
                        disabled={isImportingSelected || selectedTournamentIds.size === 0}
                        className="w-full"
                      >
                        {isImportingSelected ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Importing Selected...
                          </>
                        ) : (
                          <>
                            <Zap className="mr-2 h-4 w-4" />
                            Import {selectedTournamentIds.size} Selected Tournament{selectedTournamentIds.size !== 1 ? "s" : ""}
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>
              )}
              
              {/* Manual ID backup (collapsible) */}
              <div className="border rounded-lg">
                <button
                  type="button"
                  className="flex items-center gap-2 w-full px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowManualIds(!showManualIds)}
                >
                  {showManualIds ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  Manual Tournament ID Import (Backup)
                </button>
                
                {showManualIds && (
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Paste tournament IDs manually if auto-fetch doesn{"'"}t find them.
                    </p>
                    {tournamentIds.map((id, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          placeholder={`Tournament ID ${index + 1}`}
                          value={id}
                          onChange={(e) => {
                            const newIds = [...tournamentIds];
                            newIds[index] = e.target.value;
                            setTournamentIds(newIds);
                          }}
                        />
                        {id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const newIds = [...tournamentIds];
                              newIds[index] = "";
                              setTournamentIds(newIds);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {renderDuplicateWarning(manualDuplicateMatches)}
                    <Button
                      onClick={handleBulkTournamentImport}
                      disabled={isImportingTournaments || tournamentIds.every(id => !id.trim())}
                      className="w-full"
                      variant="secondary"
                    >
                      {isImportingTournaments ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Importing Tournaments...
                        </>
                      ) : (
                        <>
                          <Zap className="mr-2 h-4 w-4" />
                          Import Tournaments by ID
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Third Party CSV Import Tab */}
          <TabsContent value="csv" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="csv-event-name">
                  Event Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="csv-event-name"
                  placeholder="e.g., Winter Cup 2024"
                  value={csvEventName}
                  onChange={(e) => setCsvEventName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="csv-event-date">Event Date (Optional)</Label>
                <Input
                  id="csv-event-date"
                  type="date"
                  value={csvEventDate}
                  onChange={(e) => setCsvEventDate(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="csv-source">Source</Label>
                <Input
                  id="csv-source"
                  placeholder="e.g., Yunite, Custom Event"
                  value={csvSource}
                  onChange={(e) => setCsvSource(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="csv-url">Leaderboard URL (Optional)</Label>
                <Input
                  id="csv-url"
                  placeholder="https://..."
                  value={csvLeaderboardUrl}
                  onChange={(e) => setCsvLeaderboardUrl(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="csv-event">Link to Event (Optional)</Label>
                <div className="flex items-center gap-2 mb-2">
                  <Checkbox
                    id="allow-zbd-event"
                    checked={allowZbdEventAssignment}
                    onCheckedChange={(checked) => {
                      setAllowZbdEventAssignment(checked === true);
                      // Reset event selection when toggling
                      if (!checked) {
                        setCsvEventId("none");
                      }
                    }}
                  />
                  <Label 
                    htmlFor="allow-zbd-event" 
                    className="text-sm font-normal cursor-pointer"
                  >
                    Allow ZBD Event Assignment
                  </Label>
                </div>
                <Select 
                  value={csvEventId} 
                  onValueChange={setCsvEventId}
                  disabled={!allowZbdEventAssignment}
                >
                  <SelectTrigger id="csv-event">
                    <SelectValue placeholder={allowZbdEventAssignment ? "Select an event..." : "Enable ZBD events to select"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Event</SelectItem>
                    {events?.filter(event => allowZbdEventAssignment).map((event) => (
                      <SelectItem key={event._id} value={event._id}>
                        {event.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {allowZbdEventAssignment 
                    ? "Link this import to a ZBD event to display results on the event page" 
                    : "CSV imports are for 3rd-party events only. Check the box above to override and link to a ZBD event."}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Import Method</Label>
                <Tabs value={csvImportMethod} onValueChange={(v) => setCsvImportMethod(v as "file" | "url")} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="file">File Upload</TabsTrigger>
                    <TabsTrigger value="url">Google Drive URL</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="file" className="space-y-2">
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                    {selectedFile && (
                      <p className="text-sm text-muted-foreground">
                        Selected: {selectedFile.name}
                      </p>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="url" className="space-y-2">
                    <Input
                      placeholder="https://drive.google.com/file/d/..."
                      value={googleDriveUrl}
                      onChange={(e) => setGoogleDriveUrl(e.target.value)}
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {renderDuplicateWarning(csvDuplicateMatches)}
              
              <Button
                onClick={handleCSVImport}
                disabled={isImportingCSV || !csvEventName.trim() || 
                  (csvImportMethod === "file" && !selectedFile) || 
                  (csvImportMethod === "url" && !googleDriveUrl.trim())}
                className="w-full"
              >
                {isImportingCSV ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <FileUp className="mr-2 h-4 w-4" />
                    Import CSV
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          {/* Import History Tab */}
          <TabsContent value="history" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold">Import History</h3>
                <p className="text-sm text-muted-foreground">
                  {importHistory?.length || 0} import{importHistory?.length !== 1 ? "s" : ""} · Process All skips steps already done
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleProcessAllImports}
                  disabled={isProcessingAll || isRefreshingAll || isBackfilling}
                  variant="default"
                  size="sm"
                >
                  {isProcessingAll ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {processAllProgress.current}/{processAllProgress.total}...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Process All
                    </>
                  )}
                </Button>
                {isProcessingAll && (
                  <Button
                    onClick={() => {
                      processAllAbortRef.current = true;
                    }}
                    variant="destructive"
                    size="sm"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Abort
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isProcessingAll || isRefreshingAll || isBackfilling}
                    >
                      {isRefreshingAll || isBackfilling ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Maintenance...
                        </>
                      ) : (
                        <>
                          Maintenance
                          <ChevronDown className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={handleRefreshAll} disabled={isRefreshingAll}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Re-match all imports
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleBackfillLeaderboardLinks}
                      disabled={isBackfilling}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      Backfill event leaderboard links
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {importHistoryStatus === "LoadingFirstPage" ? (
              <Skeleton className="h-96 w-full" />
            ) : importHistory.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No imports yet</p>
              </div>
            ) : (
              <>
              <div className="border rounded-lg overflow-hidden [&_[data-slot=table-container]]:overflow-visible">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[32%]">Event</TableHead>
                      <TableHead className="w-[12%]">Players</TableHead>
                      <TableHead className="w-[28%]">Pipeline</TableHead>
                      <TableHead className="w-[20%]">Imported</TableHead>
                      <TableHead className="w-[8%] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(importHistoryPagination.pageItems ?? []).map((imp) => (
                      <TableRow key={imp._id}>
                        <TableCell className="whitespace-normal py-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate" title={imp.eventName}>
                              {imp.eventName}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              <span>
                                {imp.eventDate ? format(new Date(imp.eventDate), "MMM d, yyyy") : "—"}
                              </span>
                              <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
                                {imp.source}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-normal py-2 text-xs">
                          <span>{imp.playersMatched} matched</span>
                          {imp.playersUnmatched > 0 && (
                            <Link
                              to={`/admin/unmatched/${imp._id}`}
                              className="mt-0.5 block text-primary hover:underline"
                            >
                              {imp.playersUnmatched} unmatched
                            </Link>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-normal py-2">
                          <div className="flex min-w-0 flex-col gap-1">
                            <Badge
                              variant={importPipelineStatusVariant(imp.pipelineStatus)}
                              className="w-fit max-w-full truncate text-[11px]"
                            >
                              {imp.pipelineStatus ?? "Not processed"}
                            </Badge>
                            {processingImportId === imp._id &&
                              importProcessingState?.job?.status === "running" && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-2">
                                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                                  {importProcessingState.job.progressMessage}
                                </span>
                              )}
                            {imp.pipelineError && (
                              <span
                                className="text-xs text-destructive line-clamp-2"
                                title={formatPipelineError(imp.pipelineError)}
                              >
                                {formatPipelineError(imp.pipelineError)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-normal py-2 text-xs">
                          <p className="truncate" title={imp.importedByName}>
                            {imp.importedByName}
                          </p>
                          <p className="text-muted-foreground">
                            {format(new Date(imp._creationTime), "MMM d, HH:mm")}
                          </p>
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            {(imp.source === "Yunite" || imp.source === "Yunite API") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => handleProcessImport(imp._id)}
                                disabled={
                                  isProcessingAll ||
                                  processingImportId === imp._id ||
                                  imp.pipelineStatus === "Finalized"
                                }
                                title="Process Import"
                              >
                                {processingImportId === imp._id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Zap className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">More actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                {imp.pipelineStatus === "Finalized" && (
                                  <DropdownMenuItem onClick={() => handleUnlockImport(imp._id)}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Unlock import
                                  </DropdownMenuItem>
                                )}
                                {imp.source === "Yunite" && imp.leaderboardId && (
                                  <DropdownMenuItem
                                    onClick={() => handleSyncMatchData(imp._id)}
                                    disabled={syncingId === imp._id || isProcessingAll}
                                  >
                                    {syncingId === imp._id ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <RefreshCw className="mr-2 h-4 w-4" />
                                    )}
                                    Sync match data
                                  </DropdownMenuItem>
                                )}
                                {imp.source === "Yunite" && (
                                  <DropdownMenuItem onClick={() => navigate(`/admin/yunite/${imp._id}`)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    View details
                                  </DropdownMenuItem>
                                )}
                                {imp.source === "Yunite" && (
                                  <DropdownMenuItem
                                    onClick={() => handlePopulateTeamMembersForImport(imp._id)}
                                    disabled={populatingTeamMembersId === imp._id}
                                  >
                                    {populatingTeamMembersId === imp._id ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <Users className="mr-2 h-4 w-4" />
                                    )}
                                    Populate team members
                                  </DropdownMenuItem>
                                )}
                                {imp.leaderboardUrl && !imp.leaderboardUrl.startsWith("CSV Import:") && (
                                  <DropdownMenuItem asChild>
                                    <a href={imp.leaderboardUrl} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="mr-2 h-4 w-4" />
                                      Open leaderboard
                                    </a>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => handleDownloadCSV(imp._id)}
                                  disabled={downloadingId === imp._id}
                                >
                                  {downloadingId === imp._id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="mr-2 h-4 w-4" />
                                  )}
                                  Download CSV
                                </DropdownMenuItem>
                                {imp.playersUnmatched > 0 && (
                                  <DropdownMenuItem
                                    onClick={() => handleRematch(imp._id)}
                                    disabled={rematchingId === imp._id}
                                  >
                                    {rematchingId === imp._id ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <Users className="mr-2 h-4 w-4" />
                                    )}
                                    Rematch players
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => openCreateEventDialog(imp)}
                                  disabled={!!imp.eventId}
                                >
                                  <CalendarPlus className="mr-2 h-4 w-4" />
                                  {imp.eventId ? "Already linked to event" : "Create event"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEditDialog(imp)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit import
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDelete(imp._id)}
                                  disabled={deletingId === imp._id}
                                  className="text-destructive focus:text-destructive"
                                >
                                  {deletingId === imp._id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="mr-2 h-4 w-4" />
                                  )}
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                page={importHistoryPagination.page}
                totalPages={importHistoryPagination.totalPages}
                totalCount={importHistoryPagination.totalCount}
                startIndex={importHistoryPagination.startIndex}
                endIndex={importHistoryPagination.endIndex}
                onPageChange={importHistoryPagination.setPage}
                itemLabel="imports"
              />
              {importHistoryStatus === "CanLoadMore" && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => loadMoreImports(50)}
                    className="cursor-pointer"
                  >
                    Load more from server
                  </Button>
                </div>
              )}
              {importHistoryStatus === "LoadingMore" && (
                <div className="flex justify-center pt-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={!!editingImport} onOpenChange={(open) => !open && setEditingImport(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit Import Details</DialogTitle>
            <DialogDescription>
              Update event information or replace CSV data
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-event-name">Event Name</Label>
              <Input
                id="edit-event-name"
                value={editEventName}
                onChange={(e) => setEditEventName(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-event-date">Event Date</Label>
              <Input
                id="edit-event-date"
                type="date"
                value={editEventDate}
                onChange={(e) => setEditEventDate(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-organizer">Organizer</Label>
              <Input
                id="edit-organizer"
                value={editOrganizer}
                onChange={(e) => setEditOrganizer(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-url">Leaderboard URL</Label>
              <Input
                id="edit-url"
                value={editLeaderboardUrl}
                onChange={(e) => setEditLeaderboardUrl(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-event-link">Link to Event</Label>
              <Select value={editLinkedEventId} onValueChange={setEditLinkedEventId}>
                <SelectTrigger id="edit-event-link">
                  <SelectValue placeholder="Select an event..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Event</SelectItem>
                  {events?.map((event) => (
                    <SelectItem key={event._id} value={event._id}>
                      {event.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 border-t pt-4">
              <Label>Replace CSV Data</Label>
              <div className="flex gap-2">
                <Input
                  ref={replaceFileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => setReplaceFile(e.target.files?.[0] || null)}
                  className="flex-1"
                />
                {replaceFile && (
                  <Button
                    onClick={handleReplaceCSV}
                    disabled={isReplacingCSV}
                  >
                    {isReplacingCSV ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Replacing...
                      </>
                    ) : (
                      <>
                        <FileUp className="mr-2 h-4 w-4" />
                        Replace
                      </>
                    )}
                  </Button>
                )}
              </div>
              {replaceFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {replaceFile.name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingImport(null)} disabled={isUpdating || isReplacingCSV}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={isUpdating || isReplacingCSV}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Event from Import Dialog */}
      <Dialog open={!!creatingEventFromImport} onOpenChange={(open) => !open && setCreatingEventFromImport(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Create Event from Import</DialogTitle>
            <DialogDescription>
              Review and adjust the detected event details before creating
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-event-name">
                Event Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-event-name"
                value={createEventName}
                onChange={(e) => setCreateEventName(e.target.value)}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-event-type">
                  Event Type <span className="text-destructive">*</span>
                </Label>
                <Select value={createEventType} onValueChange={setCreateEventType}>
                  <SelectTrigger id="create-event-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scrim">Scrim</SelectItem>
                    <SelectItem value="season">Season</SelectItem>
                    <SelectItem value="mini-season">Mini Season</SelectItem>
                    <SelectItem value="random">Random Duos</SelectItem>
                    <SelectItem value="random-squads">Random Squads</SelectItem>
                    <SelectItem value="random-trios">Random Trios</SelectItem>
                    <SelectItem value="solos-meets-duos">Solos Meets Duos</SelectItem>
                    <SelectItem value="scrim-series">Scrim Series</SelectItem>
                    <SelectItem value="showdown">Showdown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="create-event-mode">
                  Mode <span className="text-destructive">*</span>
                </Label>
                <Select value={createEventMode} onValueChange={setCreateEventMode}>
                  <SelectTrigger id="create-event-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ZB Main Map">ZB Main Map</SelectItem>
                    <SelectItem value="Reload">Reload</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-event-start">
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="create-event-start"
                  type="date"
                  value={createEventStartDate}
                  onChange={(e) => setCreateEventStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-event-end">
                  End Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="create-event-end"
                  type="date"
                  value={createEventEndDate}
                  onChange={(e) => setCreateEventEndDate(e.target.value)}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="create-event-desc">Description (optional)</Label>
              <Input
                id="create-event-desc"
                placeholder="Brief description of the event..."
                value={createEventDescription}
                onChange={(e) => setCreateEventDescription(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Leaderboard URLs</Label>
              {createEventLeaderboards.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="https://yunite.xyz/leaderboard/..."
                    value={url}
                    onChange={(e) => {
                      const updated = [...createEventLeaderboards];
                      updated[i] = e.target.value;
                      setCreateEventLeaderboards(updated);
                    }}
                  />
                  {createEventLeaderboards.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setCreateEventLeaderboards(createEventLeaderboards.filter((_, idx) => idx !== i));
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCreateEventLeaderboards([...createEventLeaderboards, ""])}
              >
                + Add Leaderboard URL
              </Button>
            </div>
          </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingEventFromImport(null)} disabled={isCreatingEvent}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateEventFromImport}
              disabled={isCreatingEvent || !createEventName.trim() || !createEventStartDate || !createEventEndDate}
            >
              {isCreatingEvent ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  Create Event
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inspect Tournament Raw Data Dialog */}
      <Dialog open={inspectingTournamentId !== null} onOpenChange={(open) => {
        if (!open) {
          setInspectingTournamentId(null);
          setInspectResult(null);
          setInspectMatchesResult(null);
        }
      }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Raw Yunite API Data</DialogTitle>
            <DialogDescription>
              Inspect data for tournament{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{inspectingTournamentId}</code>
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
          {/* Tabs for Tournament vs Matches */}
          <div className="flex gap-2 border-b pb-2">
            <Button
              variant={inspectTab === "tournament" ? "default" : "ghost"}
              size="sm"
              onClick={() => setInspectTab("tournament")}
            >
              Tournament
            </Button>
            <Button
              variant={inspectTab === "matches" ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setInspectTab("matches");
                // Auto-fetch matches on first click
                if (!inspectMatchesResult && !isInspectingMatches) {
                  handleInspectMatches();
                }
              }}
            >
              Matches
            </Button>
          </div>

          <div>
            {inspectTab === "tournament" && (
              <>
                {isInspecting ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span className="text-muted-foreground">Fetching tournament data...</span>
                  </div>
                ) : inspectResult ? (
                  <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto whitespace-pre-wrap break-all font-mono">
                    {JSON.stringify(inspectResult, null, 2)}
                  </pre>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No data loaded.</p>
                )}
              </>
            )}

            {inspectTab === "matches" && (
              <>
                {isInspectingMatches ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span className="text-muted-foreground">Fetching match list...</span>
                  </div>
                ) : inspectMatchesResult ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {inspectMatchesResult.length} match{inspectMatchesResult.length !== 1 ? "es" : ""} found
                    </p>
                    <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto whitespace-pre-wrap break-all font-mono">
                      {JSON.stringify(inspectMatchesResult, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <p className="text-muted-foreground">Click to fetch match data</p>
                    <Button size="sm" onClick={handleInspectMatches} disabled={isInspectingMatches}>
                      Fetch Matches
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
          </DialogBody>

          <DialogFooter>
            {inspectTab === "tournament" && inspectResult && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(inspectResult, null, 2));
                  toast.success("Copied to clipboard");
                }}
              >
                Copy Tournament JSON
              </Button>
            )}
            {inspectTab === "matches" && inspectMatchesResult && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(inspectMatchesResult, null, 2));
                  toast.success("Copied to clipboard");
                }}
              >
                Copy Matches JSON
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
