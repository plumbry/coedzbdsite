import { useState, useRef } from "react";
import { useMutation, useQuery, useConvex, useAction, usePaginatedQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
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
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Loader2, ExternalLink, FileUp, RefreshCw, Trash2, Edit, Users, Download, Zap, X, Eye, Search, ChevronDown, ChevronRight, CheckSquare, Square, CalendarPlus, Link2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useUserRole } from "@/hooks/use-user-role.ts";

export default function ImportThirdParty() {
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("yunite");
  
  // CSV state
  const [csvEventName, setCsvEventName] = useState("");
  const [csvEventDate, setCsvEventDate] = useState("");
  const [csvSource, setCsvSource] = useState("Yunite");
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
  const backfillLeaderboardLinks = useMutation(api.thirdPartyMutations.backfillLeaderboardLinks);
  const createEvent = useMutation(api.events.management.createEvent);
  const { results: importHistory, status: importHistoryStatus, loadMore: loadMoreImports } = usePaginatedQuery(
    api.thirdPartyQueries.getImportHistory,
    {},
    { initialNumItems: 50 }
  );
  const events = useQuery(api.events.management.getAllEvents);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [isPopulatingTeamMembers, setIsPopulatingTeamMembers] = useState(false);
  const [populateProgress, setPopulateProgress] = useState({ current: 0, total: 0, failed: 0 });
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState({ current: 0, total: 0 });
  const [isBackfilling, setIsBackfilling] = useState(false);
  const populateAbortRef = useRef(false);
  
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
        source: csvSource.trim() || "Yunite",
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
      setRecentTournaments(result.tournaments);
      setSelectedTournamentIds(new Set());
      setHasFetchedRecent(true);
      
      const importable = result.tournaments.filter(t => !t.alreadyImported).length;
      toast.success(`Found ${result.tournaments.length} tournaments (${importable} not yet imported)`);
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

  const handlePopulateTeamMembers = async () => {
    if (!importHistory || importHistory.length === 0) {
      toast.error("No imports found");
      return;
    }
    if (!confirm("This will populate team member data for all Yunite imports. Each request waits 10 seconds to avoid API rate limits. Continue?")) {
      return;
    }
    
    // Filter to only Yunite imports (they have leaderboardIds starting with "yunite-")
    const yuniteImports = importHistory.filter(
      (imp) => imp.source === "Yunite" || imp.leaderboardId.startsWith("yunite-")
    );
    
    if (yuniteImports.length === 0) {
      toast.info("No Yunite imports found to populate");
      return;
    }
    
    populateAbortRef.current = false;
    setIsPopulatingTeamMembers(true);
    setPopulateProgress({ current: 0, total: yuniteImports.length, failed: 0 });
    
    let totalUpdated = 0;
    let failedCount = 0;
    
    for (let i = 0; i < yuniteImports.length; i++) {
      if (populateAbortRef.current) {
        toast.info(`Aborted after ${i} of ${yuniteImports.length} imports`);
        break;
      }

      const imp = yuniteImports[i];
      setPopulateProgress((prev) => ({ ...prev, current: i + 1 }));
      
      try {
        const result = await populateTeamMembersForImport({ importId: imp._id });
        totalUpdated += result.updated;
      } catch {
        failedCount++;
        setPopulateProgress((prev) => ({ ...prev, failed: prev.failed + 1 }));
      }

      // Wait 10 seconds between requests to avoid Yunite 524/429 errors
      if (i < yuniteImports.length - 1 && !populateAbortRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }
    
    setIsPopulatingTeamMembers(false);
    
    if (failedCount > 0) {
      toast.warning(`Updated ${totalUpdated} records. ${failedCount} imports failed.`);
    } else if (!populateAbortRef.current) {
      toast.success(`Updated ${totalUpdated} records across ${yuniteImports.length} imports`);
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

  const handleSyncAllMatchData = async () => {
    if (!importHistory) return;
    
    // Filter for Yunite imports with leaderboardId
    const yuniteImports = importHistory.filter(
      (imp) => imp.source === "Yunite" && imp.leaderboardId
    );
    
    if (yuniteImports.length === 0) {
      toast.error("No Yunite imports found to sync");
      return;
    }
    
    setIsSyncingAll(true);
    setSyncAllProgress({ current: 0, total: yuniteImports.length });
    
    let successCount = 0;
    let failCount = 0;
    
    try {
      for (let i = 0; i < yuniteImports.length; i++) {
        const imp = yuniteImports[i];
        setSyncAllProgress({ current: i + 1, total: yuniteImports.length });
        setSyncingId(imp._id);
        
        try {
          await syncTournamentMatchData({ importId: imp._id });
          successCount++;
          toast.success(`Synced ${imp.eventName} (${i + 1}/${yuniteImports.length})`);
        } catch (error) {
          console.error(`Failed to sync ${imp.eventName}:`, error);
          failCount++;
          toast.error(`Failed to sync ${imp.eventName}`);
        }
        
        // Rate limiting: wait 1 second between each sync
        if (i < yuniteImports.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      toast.success(`Sync complete! ${successCount} succeeded, ${failCount} failed`);
    } catch (error) {
      console.error("Sync all error:", error);
      toast.error("Sync all interrupted");
    } finally {
      setIsSyncingAll(false);
      setSyncingId(null);
      setSyncAllProgress({ current: 0, total: 0 });
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
    if (lower.includes("minicup") || lower.includes("mini cup") || lower.includes("mini-cup")) return "minicup";
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
        type: createEventType as "scrim" | "minicup" | "season" | "mini-season" | "random" | "random-squads" | "random-trios" | "solos-meets-duos" | "scrim-series" | "showdown",
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Import Leaderboard Data</CardTitle>
        <CardDescription className="text-xs">
          Pull leaderboards via Yunite API (primary), CSV for third-party events, or view import history
        </CardDescription>
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
                              <div className="flex-shrink-0">
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
                  {importHistory?.length || 0} import{importHistory?.length !== 1 ? 's' : ''} total
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleSyncAllMatchData}
                  disabled={isSyncingAll || isPopulatingTeamMembers || isRefreshingAll}
                  variant="outline"
                  size="sm"
                >
                  {isSyncingAll ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing {syncAllProgress.current}/{syncAllProgress.total}...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Sync All Match Data
                    </>
                  )}
                </Button>
                <Button
                  onClick={handlePopulateTeamMembers}
                  disabled={isPopulatingTeamMembers || isSyncingAll}
                  variant="secondary"
                  size="sm"
                >
                  {isPopulatingTeamMembers ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Populating {populateProgress.current}/{populateProgress.total}
                      {populateProgress.failed > 0 && ` (${populateProgress.failed} failed)`}
                    </>
                  ) : (
                    <>
                      <Users className="mr-2 h-4 w-4" />
                      Populate Team Members
                    </>
                  )}
                </Button>
                {isPopulatingTeamMembers && (
                  <Button
                    onClick={() => { populateAbortRef.current = true; }}
                    variant="destructive"
                    size="sm"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Abort
                  </Button>
                )}
                <Button
                  onClick={handleRefreshAll}
                  disabled={isRefreshingAll || isSyncingAll}
                  variant="outline"
                  size="sm"
                >
                  {isRefreshingAll ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Re-match All
                    </>
                  )}
                </Button>
                <Button
                  onClick={async () => {
                    setIsBackfilling(true);
                    try {
                      const result = await backfillLeaderboardLinks({});
                      toast.success(`Backfill complete: ${result.linksAdded} links added to ${result.eventsUpdated} events`);
                    } catch (error) {
                      toast.error("Backfill failed");
                    } finally {
                      setIsBackfilling(false);
                    }
                  }}
                  disabled={isBackfilling}
                  variant="outline"
                  size="sm"
                >
                  {isBackfilling ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Backfilling...
                    </>
                  ) : (
                    <>
                      <Link2 className="mr-2 h-4 w-4" />
                      Backfill Leaderboard Links
                    </>
                  )}
                </Button>
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
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Players</TableHead>
                      <TableHead>Imported By</TableHead>
                      <TableHead>Imported At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importHistory.map((imp) => (
                      <TableRow key={imp._id}>
                        <TableCell className="font-medium">{imp.eventName}</TableCell>
                        <TableCell>
                          {imp.eventDate ? format(new Date(imp.eventDate), "MMM d, yyyy") : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{imp.source}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs">
                              {imp.playersMatched} matched
                            </span>
                            {imp.playersUnmatched > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {imp.playersUnmatched} unmatched
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{imp.importedByName}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(imp._creationTime), "MMM d, HH:mm")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {imp.source === "Yunite" && imp.leaderboardId && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleSyncMatchData(imp._id)}
                                      disabled={syncingId === imp._id || isSyncingAll}
                                    >
                                      {syncingId === imp._id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <RefreshCw className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Sync Match Data</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {imp.source === "Yunite" && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => navigate(`/admin/yunite/${imp._id}`)}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>View Details</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {imp.source === "Yunite" && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handlePopulateTeamMembersForImport(imp._id)}
                                      disabled={populatingTeamMembersId === imp._id}
                                    >
                                      {populatingTeamMembersId === imp._id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Users className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Populate Team Members</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {imp.leaderboardUrl && !imp.leaderboardUrl.startsWith('CSV Import:') && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <a
                                      href={imp.leaderboardUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <Button variant="ghost" size="sm">
                                        <ExternalLink className="h-4 w-4" />
                                      </Button>
                                    </a>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Open Leaderboard</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDownloadCSV(imp._id)}
                                    disabled={downloadingId === imp._id}
                                  >
                                    {downloadingId === imp._id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Download className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Download CSV</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {imp.playersUnmatched > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRematch(imp._id)}
                                      disabled={rematchingId === imp._id}
                                    >
                                      {rematchingId === imp._id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Users className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Rematch Players</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openCreateEventDialog(imp)}
                                    disabled={!!imp.eventId}
                                    title={imp.eventId ? "Already linked to an event" : "Create event from this import"}
                                  >
                                    <CalendarPlus className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{imp.eventId ? "Already linked to event" : "Create Event"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(imp)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Edit</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(imp._id)}
                                    disabled={deletingId === imp._id}
                                  >
                                    {deletingId === imp._id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Delete</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {importHistoryStatus === "CanLoadMore" && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => loadMoreImports(50)}
                    className="cursor-pointer"
                  >
                    Load More
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
                    <SelectItem value="minicup">Mini Cup</SelectItem>
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
