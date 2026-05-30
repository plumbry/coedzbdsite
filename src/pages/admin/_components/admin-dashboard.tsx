import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Slider } from "@/components/ui/slider.tsx";

import { Shield, Users, UserPlus, ArrowLeft, Download, Archive, XCircle, ArrowUpDown, ArrowUp, ArrowDown, Filter, AlertTriangle, CheckCircle, AlertCircle, Search, ScrollText, Upload, Calendar, Trash2, Trophy, FileVideo, MessageSquare, Zap, ListChecks, ChevronDown, ChevronRight, TrendingUp, UserCog, GitCompare, LogOut, Database, HardDrive, Settings } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import ScorePlayerDialog from "../../_components/score-player-dialog.tsx";
import EditPlayerDialog from "./edit-player-dialog.tsx";
import AuditLogView from "./audit-log-view.tsx";

import ImportThirdParty from "./import-third-party.tsx";
import ImportPlayersDialog from "../../_components/import-players-dialog.tsx";
import RejectPlayerDialog from "./reject-player-dialog.tsx";
import ArchivePlayerDialog from "./archive-player-dialog.tsx";
import RoleMismatchDialog from "./role-mismatch-dialog.tsx";
import MergePlayersDialog from "./merge-players-dialog.tsx";
import EventManager from "./event-manager.tsx";
import EventResultsManager from "./event-results-manager.tsx";
import DuoSelector from "./duo-selector.tsx";
import ExportOptionsDialog from "./export-options-dialog.tsx";
import SupportPanel from "./support-panel.tsx";
import YuniteDashboard from "./yunite-dashboard.tsx";
import GoogleSheetsManager from "./google-sheets-manager.tsx";
import RelinkResultsButton from "./relink-results-button.tsx";
import AdminSidebar from "./admin-sidebar.tsx";
import { toast } from "sonner";

function DuoSelectionSection() {
  const events = useQuery(api.events.management.getAllEvents);
  const [selectedEventId, setSelectedEventId] = useState<Id<"events"> | null>(null);
  
  const dynamicEvents = events?.filter(e => e.dynamicPairDetection || e.type === "random-squads" || e.type === "random-trios") || [];
  
  if (dynamicEvents.length === 0) {
    return null;
  }
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Duo Selection Manager</CardTitle>
        <CardDescription className="text-xs">
          Select which players are duos for random-team events
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Select Event</label>
          <Select value={selectedEventId || undefined} onValueChange={(v) => setSelectedEventId(v as Id<"events">)}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an event with duo detection enabled" />
            </SelectTrigger>
            <SelectContent>
              {dynamicEvents.map(event => (
                <SelectItem key={event._id} value={event._id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {selectedEventId && (
          <DuoSelector eventId={selectedEventId} />
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const players = useQuery(api.players.getAllPlayersAdmin, {});
  const evaluations = useQuery(api.scores.getAllPlayerEvaluations);
  const currentUser = useQuery(api.users.getCurrentUser);
  const { isAdmin, isModeratorOrAdmin } = useUserRole();
  const becomeAdmin = useMutation(api.users.becomeAdmin);
  const updatePlayerStatus = useMutation(api.players.status.updatePlayerStatus);
  const cleanupDeprecatedFields = useMutation(api.migration.cleanupDeprecatedUrlFields);
  const checkDiscordRoles = useAction(api.discord.roles.checkDiscordRoles);
  const archivePlayersWithoutTierRole = useAction(api.discord.archiveNoTierRole.archivePlayersWithoutTierRole);
  const deleteAllArchivedPlayers = useMutation(api.players.deleteAllArchivedPlayers);
  const deleteDiscordOnlyMembers = useMutation(api.players.deleteDiscordOnlyMembers);
  const deleteAllPlayers = useMutation(api.players.deleteAllPlayers);
  const deletePlayer = useMutation(api.players.deletePlayer);
  const clearReviewFlag = useMutation(api.players.clearReviewFlag);
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [isCheckingRoles, setIsCheckingRoles] = useState(false);
  const [isArchivingNoTier, setIsArchivingNoTier] = useState(false);
  const [isDeletingDiscordOnly, setIsDeletingDiscordOnly] = useState(false);
  const [isDeletingAllPlayers, setIsDeletingAllPlayers] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isRoleMismatchDialogOpen, setIsRoleMismatchDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Id<"players"> | null>(null);
  const [rejectingPlayer, setRejectingPlayer] = useState<{ id: Id<"players">; name: string } | null>(null);
  const [archivingPlayer, setArchivingPlayer] = useState<{ id: Id<"players">; name: string } | null>(null);
  const [roleMismatches, setRoleMismatches] = useState<Array<{
    discordUsername: string;
    discordUserId: string;
    expectedTier: string;
    currentTierRoles: string[];
    status: "missing_role" | "wrong_role" | "multiple_roles";
  }>>([]);
  const [playersChecked, setPlayersChecked] = useState(0);
  const [isImportPlayersDialogOpen, setIsImportPlayersDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived" | "rejected">("all");
  const [sortBy, setSortBy] = useState("discord-asc");

  // Handle column header click for sorting
  const handleColumnSort = (column: string) => {
    // Determine current sort state for this column
    const isAsc = sortBy === `${column}-asc`;
    const isDesc = sortBy === `${column}-desc`;
    
    // Toggle: asc -> desc -> asc
    if (isAsc) {
      setSortBy(`${column}-desc`);
    } else {
      setSortBy(`${column}-asc`);
    }
  };

  // Get sort icon for a column
  const getSortIcon = (column: string) => {
    if (sortBy === `${column}-asc`) {
      return <ArrowUp className="ml-1 h-3 w-3 inline" />;
    } else if (sortBy === `${column}-desc`) {
      return <ArrowDown className="ml-1 h-3 w-3 inline" />;
    }
    return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-30" />;
  };
  const [tierFilters, setTierFilters] = useState<Set<string>>(new Set());
  const [femaleVerifiedOnly, setFemaleVerifiedOnly] = useState(false);
  const [notFemaleVerified, setNotFemaleVerified] = useState(false);
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [showTierMismatchesOnly, setShowTierMismatchesOnly] = useState(false);
  const [showMissingDiscordIdOnly, setShowMissingDiscordIdOnly] = useState(false);
  const [showNeedsReviewOnly, setShowNeedsReviewOnly] = useState(false);
  const [showLeftServerOnly, setShowLeftServerOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeletingArchived, setIsDeletingArchived] = useState(false);
  const [deletingPlayerId, setDeletingPlayerId] = useState<Id<"players"> | null>(null);
  const [activeTab, setActiveTab] = useState("players");
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<Id<"players">>>(new Set());
  const mergePlayers = useMutation(api.players.mergePlayers);
  const ITEMS_PER_PAGE = 75;
  const [eventsRange, setEventsRange] = useState<[number, number]>([0, 100]);
  const [visibleColumns, setVisibleColumns] = useState({
    merge: true,
    player: true,
    epic: true,
    discordId: true,
    status: true,
    totalScore: true,
    tier: true,
    discordRole: true,
    duplicates: true,
    events: true,
    actions: true,
  });

  if (players === undefined || currentUser === undefined) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const handleBecomeAdmin = async () => {
    try {
      await becomeAdmin({});
      toast.success("You are now an admin!");
    } catch (error) {
      toast.error("Failed to become admin");
    }
  };

  const handleStatusChange = async (playerId: Id<"players">, status: "active" | "archived" | "rejected", playerName: string) => {
    // If rejecting, open dialog for rejection reason
    if (status === "rejected") {
      setRejectingPlayer({ id: playerId, name: playerName });
      setIsRejectDialogOpen(true);
      return;
    }
    
    // If archiving, open dialog for archive reason
    if (status === "archived") {
      setArchivingPlayer({ id: playerId, name: playerName });
      setIsArchiveDialogOpen(true);
      return;
    }
    
    // For active, update directly
    try {
      await updatePlayerStatus({ playerId, status });
      toast.success("Player activated");
    } catch (error) {
      toast.error("Failed to update player status");
    }
  };
  
  const togglePlayerForMerge = (playerId: Id<"players">) => {
    setSelectedForMerge((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(playerId)) {
        newSet.delete(playerId);
      } else {
        newSet.add(playerId);
      }
      return newSet;
    });
  };
  
  const handleManualMerge = async () => {
    if (selectedForMerge.size !== 2) {
      toast.error("Please select exactly 2 players to merge");
      return;
    }
    
    const playerIds = Array.from(selectedForMerge);
    const player1 = players.find(p => p._id === playerIds[0]);
    const player2 = players.find(p => p._id === playerIds[1]);
    
    if (!player1 || !player2) {
      toast.error("Selected players not found");
      return;
    }
    
    // Determine which should be primary
    const isPlaceholder = (id: string) => id.startsWith("placeholder_") || id === "imported";
    const player1HasRealId = player1.discordUserId && !isPlaceholder(player1.discordUserId);
    const player2HasRealId = player2.discordUserId && !isPlaceholder(player2.discordUserId);
    
    let primaryId = playerIds[0];
    let secondaryId = playerIds[1];
    
    // Prioritize player with tier
    if (player1.tier && !player2.tier) {
      primaryId = playerIds[0];
      secondaryId = playerIds[1];
    } else if (player2.tier && !player1.tier) {
      primaryId = playerIds[1];
      secondaryId = playerIds[0];
    }
    // Then prioritize real Discord ID
    else if (player1HasRealId && !player2HasRealId) {
      primaryId = playerIds[0];
      secondaryId = playerIds[1];
    } else if (player2HasRealId && !player1HasRealId) {
      primaryId = playerIds[1];
      secondaryId = playerIds[0];
    }
    
    try {
      await mergePlayers({ primaryPlayerId: primaryId, secondaryPlayerId: secondaryId });
      toast.success("Players merged successfully");
      setSelectedForMerge(new Set());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to merge players";
      toast.error(errorMessage);
    }
  };
  
  const handleRejectConfirm = async (reason: string) => {
    if (!rejectingPlayer) return;
    
    try {
      await updatePlayerStatus({ 
        playerId: rejectingPlayer.id, 
        status: "rejected",
        rejectionReason: reason,
      });
      toast.success("Player rejected");
      setRejectingPlayer(null);
    } catch (error) {
      toast.error("Failed to reject player");
    }
  };
  
  const handleArchiveConfirm = async (reason: "left server" | "application incomplete" | "no tier role" | "other") => {
    if (!archivingPlayer) return;
    
    try {
      await updatePlayerStatus({ 
        playerId: archivingPlayer.id, 
        status: "archived",
        archiveReason: reason,
      });
      toast.success("Player archived");
      setArchivingPlayer(null);
    } catch (error) {
      toast.error("Failed to archive player");
    }
  };

  const handleCleanupDeprecatedFields = async () => {
    try {
      const result = await cleanupDeprecatedFields({});
      toast.success(`Cleaned up ${result.cleanedCount} player records`);
    } catch (error) {
      toast.error("Failed to cleanup deprecated fields");
    }
  };

  const handleCheckDiscordRoles = async () => {
    setIsCheckingRoles(true);
    try {
      const result = await checkDiscordRoles({});
      setRoleMismatches(result.mismatches);
      setPlayersChecked(result.playersChecked);
      setIsRoleMismatchDialogOpen(true);
      
      if (result.mismatches.length === 0) {
        toast.success(`All ${result.playersChecked} players have correct roles`);
      } else {
        toast.warning(`Found ${result.mismatches.length} role mismatches`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to check Discord roles";
      toast.error(errorMessage);
    } finally {
      setIsCheckingRoles(false);
    }
  };
  
  const handleArchivePlayersWithoutTierRole = async () => {
    setIsArchivingNoTier(true);
    try {
      const result = await archivePlayersWithoutTierRole({});
      if (result.playersArchived > 0) {
        toast.success(`Archived ${result.playersArchived} player(s) without tier roles`);
      } else {
        toast.success("All players have tier roles");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to archive players";
      toast.error(errorMessage);
    } finally {
      setIsArchivingNoTier(false);
    }
  };

  const toggleTierFilter = (tier: string) => {
    const newFilters = new Set(tierFilters);
    if (newFilters.has(tier)) {
      newFilters.delete(tier);
    } else {
      newFilters.add(tier);
    }
    setTierFilters(newFilters);
    setCurrentPage(1);
  };
  
  const clearAllFilters = () => {
    setTierFilters(new Set());
    setFemaleVerifiedOnly(false);
    setNotFemaleVerified(false);
    setShowDuplicatesOnly(false);
    setShowTierMismatchesOnly(false);
    setShowMissingDiscordIdOnly(false);
    setShowNeedsReviewOnly(false);
    setShowLeftServerOnly(false);
    setCurrentPage(1);
  };

  const handleExportEvaluations = (filters?: { tiers: string[]; statuses: string[] }) => {
    if (!evaluations || evaluations.length === 0) {
      toast.error("No evaluations to export");
      return;
    }

    // Apply filters if provided, otherwise default to active players only
    let filteredEvaluations = evaluations;
    if (filters) {
      filteredEvaluations = evaluations.filter((evaluation) => {
        const tierMatch = filters.tiers.includes(evaluation.tier);
        const statusMatch = filters.statuses.includes(evaluation.status);
        return tierMatch && statusMatch;
      });
    } else {
      // Default: only export active players (status === "active" or undefined)
      filteredEvaluations = evaluations.filter((evaluation) => 
        !evaluation.status || evaluation.status === "active"
      );
    }

    if (filteredEvaluations.length === 0) {
      toast.error("No evaluations match the selected filters");
      return;
    }

    // CSV headers
    const headers = [
      "Discord Username",
      "Epic Username",
      "Discord ID",
      "Nickname",
      "Status",
      "3rd Party Experience",
      "3rd Party Performance",
      "In Game Tourney Performance",
      "Official Earnings",
      "Ranked Performance",
      "Hours Played",
      "Notoriety/Teammates",
      "Age",
      "Gender",
      "Ability",
      "Region",
      "Game Sense",
      "Season Performance",
      "Modifiers",
      "Total Score",
      "Tier",
    ];

    // Convert data to CSV rows
    const rows = filteredEvaluations.map((evaluation) => [
      evaluation.discordUsername,
      evaluation.epicUsername,
      evaluation.discordUserId,
      evaluation.nickname,
      evaluation.status,
      evaluation.thirdPartyExperience,
      evaluation.thirdPartyPerformance,
      evaluation.inGameTourneyPerformance,
      evaluation.officialEarnings,
      evaluation.rankedPerformance,
      evaluation.hoursPlayed,
      evaluation.notorietyTeammates,
      evaluation.age,
      evaluation.gender,
      evaluation.ability,
      evaluation.region,
      evaluation.gameSense,
      evaluation.seasonPerformance,
      evaluation.modifiers,
      evaluation.totalScore,
      evaluation.tier,
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const filename = filters 
      ? `player-evaluations-filtered-${new Date().toISOString().split("T")[0]}.csv`
      : `player-evaluations-${new Date().toISOString().split("T")[0]}.csv`;
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${filteredEvaluations.length} evaluation${filteredEvaluations.length === 1 ? '' : 's'}`);
  };

  const handleDeleteAllArchived = async () => {
    const archivedCount = players.filter((p) => p.status === "archived").length;
    
    if (archivedCount === 0) {
      toast.info("No archived players to delete");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ALL ${archivedCount} archived player${archivedCount === 1 ? '' : 's'}?\n\nThis will permanently delete:\n- Player profiles\n- All scores\n- All tier history\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setIsDeletingArchived(true);
    try {
      const result = await deleteAllArchivedPlayers({});
      toast.success(`Successfully deleted ${result.deletedCount} archived player${result.deletedCount === 1 ? '' : 's'}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete archived players";
      toast.error(errorMessage);
    } finally {
      setIsDeletingArchived(false);
    }
  };

  const handleDeleteDiscordOnlyMembers = async () => {
    if (!players) return;
    
    // Count Discord-only members (have real Discord ID but no tier)
    const discordOnlyCount = players.filter(p => {
      const hasRealDiscordId = p.discordUserId && !p.discordUserId.startsWith("placeholder_");
      const hasNoTier = !p.tier;
      return hasRealDiscordId && hasNoTier;
    }).length;
    
    if (discordOnlyCount === 0) {
      toast.info("No Discord-only members to delete");
      return;
    }

    const confirmed = window.confirm(
      `⚠️ CLEAR DISCORD SYNC DATA ⚠️\n\nThis will delete ${discordOnlyCount} Discord member${discordOnlyCount === 1 ? '' : 's'} who have NOT been evaluated/assigned a tier.\n\nThis clears everything the bot has synced and reverts to your manually managed players.\n\nYour ${players.length - discordOnlyCount} evaluated player${players.length - discordOnlyCount === 1 ? '' : 's'} with tier assignments will be PRESERVED.\n\nContinue?`
    );

    if (!confirmed) return;

    setIsDeletingDiscordOnly(true);
    try {
      const result = await deleteDiscordOnlyMembers({});
      toast.success(`Deleted ${result.deletedCount} Discord-only members. Preserved ${result.preservedCount} evaluated players.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete Discord members";
      toast.error(errorMessage);
    } finally {
      setIsDeletingDiscordOnly(false);
    }
  };

  const handleDeleteAllPlayers = async () => {
    const totalCount = players.length;
    
    if (totalCount === 0) {
      toast.info("No players to delete");
      return;
    }

    const confirmed = window.confirm(
      `⚠️ DANGER: DELETE ALL PLAYERS ⚠️\n\nAre you sure you want to delete ALL ${totalCount} player${totalCount === 1 ? '' : 's'}?\n\nThis will permanently delete:\n- ALL player profiles (including evaluated players)\n- ALL scores\n- ALL tier history\n- ALL data in the database\n\nThis action CANNOT be undone!\n\nType "DELETE ALL" to confirm.`
    );

    if (!confirmed) return;

    // Extra confirmation
    const doubleConfirm = window.prompt(
      `Type "DELETE ALL" (without quotes) to confirm deletion of all ${totalCount} players:`
    );

    if (doubleConfirm !== "DELETE ALL") {
      toast.info("Deletion cancelled - confirmation text did not match");
      return;
    }

    setIsDeletingAllPlayers(true);
    try {
      const result = await deleteAllPlayers({});
      toast.success(`Successfully deleted all ${result.deletedCount} players from the database`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete all players";
      toast.error(errorMessage);
    } finally {
      setIsDeletingAllPlayers(false);
    }
  };

  const handleDeletePlayer = async (playerId: Id<"players">, playerName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${playerName}?\n\nThis will permanently delete:\n- Player profile\n- All scores\n- All tier history\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setDeletingPlayerId(playerId);
    try {
      await deletePlayer({ playerId });
      toast.success(`Successfully deleted ${playerName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to delete player";
      toast.error(errorMessage);
    } finally {
      setDeletingPlayerId(null);
    }
  };

  const filterAndSortPlayers = () => {
    // First filter by status
    let filtered = statusFilter === "all" 
      ? players 
      : players.filter((p) => (p.status || "active") === statusFilter);
    
    // Then filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((p) =>
        p.discordUsername.toLowerCase().includes(query) ||
        p.epicUsername.toLowerCase().includes(query) ||
        p.nickname?.toLowerCase().includes(query)
      );
    }
    
    // Then filter by tier (if any tier filters are selected)
    if (tierFilters.size > 0) {
      filtered = filtered.filter((p) => p.tier && tierFilters.has(p.tier));
    }
    
    // Then filter by female verified status
    if (femaleVerifiedOnly) {
      filtered = filtered.filter((p) => p.femaleVerified === true);
    } else if (notFemaleVerified) {
      filtered = filtered.filter((p) => p.gender === 50 && p.femaleVerified === false);
    }
    
    // Then filter by duplicates
    if (showDuplicatesOnly) {
      filtered = filtered.filter((p) => 
        p.duplicateEpicCount > 0 || p.duplicateDiscordCount > 0 || p.duplicateDiscordIdCount > 0
      );
    }
    
    // Then filter by tier mismatches
    if (showTierMismatchesOnly) {
      filtered = filtered.filter((p) => {
        const mismatch = getTierMismatchFromRoles(p);
        return mismatch.status !== "correct" && mismatch.status !== "no_tier";
      });
    }
    
    // Then filter by missing Discord ID (likely left server)
    if (showMissingDiscordIdOnly) {
      filtered = filtered.filter((p) => p.discordUserId.startsWith("placeholder_"));
    }
    
    // Then filter by needs review
    if (showNeedsReviewOnly) {
      filtered = filtered.filter((p) => p.needsReview === true);
    }
    
    // Then filter by left server
    if (showLeftServerOnly) {
      filtered = filtered.filter((p) => p.hasLeftServer === true);
    }
    
    // Then filter by events range
    filtered = filtered.filter((p) => {
      const events = p.eventsPlayed || 0;
      return events >= eventsRange[0] && events <= eventsRange[1];
    });
    
    // Then sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "discord-asc":
          return a.discordUsername.localeCompare(b.discordUsername);
        case "discord-desc":
          return b.discordUsername.localeCompare(a.discordUsername);
        case "epic-asc":
          return a.epicUsername.localeCompare(b.epicUsername);
        case "epic-desc":
          return b.epicUsername.localeCompare(a.epicUsername);
        case "tier-asc": {
          const tierOrder = { S: 4, A: 3, B: 2, C: 1 };
          return (tierOrder[a.tier as keyof typeof tierOrder] || 0) - (tierOrder[b.tier as keyof typeof tierOrder] || 0);
        }
        case "tier-desc": {
          const tierOrder = { S: 4, A: 3, B: 2, C: 1 };
          return (tierOrder[b.tier as keyof typeof tierOrder] || 0) - (tierOrder[a.tier as keyof typeof tierOrder] || 0);
        }
        case "tier-high": {
          const tierOrder = { S: 4, A: 3, B: 2, C: 1 };
          return (tierOrder[b.tier as keyof typeof tierOrder] || 0) - (tierOrder[a.tier as keyof typeof tierOrder] || 0);
        }
        case "tier-low": {
          const tierOrderLow = { S: 4, A: 3, B: 2, C: 1 };
          return (tierOrderLow[a.tier as keyof typeof tierOrderLow] || 0) - (tierOrderLow[b.tier as keyof typeof tierOrderLow] || 0);
        }
        case "score-asc":
          return (a.totalScore || 0) - (b.totalScore || 0);
        case "score-desc":
          return (b.totalScore || 0) - (a.totalScore || 0);
        case "score-high":
          return (b.totalScore || 0) - (a.totalScore || 0);
        case "score-low":
          return (a.totalScore || 0) - (b.totalScore || 0);
        case "events-asc":
          return (a.eventsPlayed || 0) - (b.eventsPlayed || 0);
        case "events-desc":
          return (b.eventsPlayed || 0) - (a.eventsPlayed || 0);
        case "events-high":
          return (b.eventsPlayed || 0) - (a.eventsPlayed || 0);
        case "events-low":
          return (a.eventsPlayed || 0) - (b.eventsPlayed || 0);
        default:
          return 0;
      }
    });
    
    return sorted;
  };
  
  const filteredPlayers = filterAndSortPlayers();
  const maxEvents = players && players.length > 0 
    ? Math.max(...players.map(p => p.eventsPlayed || 0), 100) 
    : 100;
  
  const paginatePlayers = () => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredPlayers.slice(startIndex, endIndex);
  };
  
  const paginatedPlayers = paginatePlayers();
  const totalPages = Math.ceil(filteredPlayers.length / ITEMS_PER_PAGE);
  
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    
    return (
      <div className="flex items-center justify-between px-4 py-3 border-t">
        <div className="text-sm text-muted-foreground">
          Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredPlayers.length)} of {filteredPlayers.length} players
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(pageNum)}
                  className="w-10"
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    );
  };

  const activePlayers = players.filter((p) => !p.status || p.status === "active");
  const archivedPlayers = players.filter((p) => p.status === "archived");
  const rejectedPlayers = players.filter((p) => p.status === "rejected");
  const evaluatedPlayers = players.filter((p) => p.totalScore !== undefined);
  const unevaluatedPlayers = players.filter((p) => p.totalScore === undefined);
  
  // Calculate filtered counts for each status based on all filters
  const applyFiltersToList = (list: typeof players) => {
    let filtered = list;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((p) =>
        p.discordUsername.toLowerCase().includes(query) ||
        p.epicUsername.toLowerCase().includes(query) ||
        p.nickname?.toLowerCase().includes(query)
      );
    }
    
    // Tier filter (if any tier filters are selected)
    if (tierFilters.size > 0) {
      filtered = filtered.filter((p) => p.tier && tierFilters.has(p.tier));
    }
    
    // Female verified filter
    if (femaleVerifiedOnly) {
      filtered = filtered.filter((p) => p.femaleVerified === true);
    } else if (notFemaleVerified) {
      filtered = filtered.filter((p) => p.gender === 50 && p.femaleVerified === false);
    }
    
    // Duplicates filter
    if (showDuplicatesOnly) {
      filtered = filtered.filter((p) => 
        p.duplicateEpicCount > 0 || p.duplicateDiscordCount > 0 || p.duplicateDiscordIdCount > 0
      );
    }
    
    // Tier mismatch filter
    if (showTierMismatchesOnly) {
      filtered = filtered.filter((p) => {
        const mismatch = getTierMismatchFromRoles(p);
        return mismatch.status !== "correct" && mismatch.status !== "no_tier";
      });
    }
    
    return filtered;
  };
  
  const filteredAllCount = applyFiltersToList(players).length;
  const filteredActiveCount = applyFiltersToList(activePlayers).length;
  const filteredArchivedCount = applyFiltersToList(archivedPlayers).length;
  const filteredRejectedCount = applyFiltersToList(rejectedPlayers).length;
  
  // Helper to get role mismatch for a player
  const getRoleMismatch = (player: typeof players[0]) => {
    if (!player.discordUserId) return null;
    return roleMismatches.find((m) => m.discordUserId === player.discordUserId);
  };
  
  // Helper to check tier mismatch from synced Discord roles
  const getTierMismatchFromRoles = (player: typeof players[0]): {
    status: "missing_role" | "wrong_role" | "multiple_roles" | "correct" | "no_tier";
    discordTiers: string[];
  } => {
    // If player has no tier assigned on website, can't check for mismatch
    if (!player.tier) {
      return { status: "no_tier", discordTiers: [] };
    }
    
    // If player has no Discord roles data, they're missing the role
    if (!player.discordRoles || player.discordRoles.length === 0) {
      return { status: "missing_role", discordTiers: [] };
    }
    
    // Get tier roles from Discord
    const tierRoleNames = ["Tier S", "Tier A", "Tier B", "Tier C", "Tier D"];
    const discordTierRoles = player.discordRoles
      .filter(role => tierRoleNames.includes(role.name))
      .map(role => role.name.replace("Tier ", ""));
    
    // No tier roles in Discord but player has a tier on website
    if (discordTierRoles.length === 0) {
      return { status: "missing_role", discordTiers: [] };
    }
    
    // Multiple tier roles in Discord
    if (discordTierRoles.length > 1) {
      return { status: "multiple_roles", discordTiers: discordTierRoles };
    }
    
    // Check if Discord tier matches database tier
    const discordTier = discordTierRoles[0];
    if (discordTier !== player.tier) {
      return { status: "wrong_role", discordTiers: [discordTier] };
    }
    
    // Everything matches
    return { status: "correct", discordTiers: [discordTier] };
  };
  
  // Show "Become Admin" button if user is not yet an admin
  const showBecomeAdmin = !isAdmin;

  return (
    <div className="flex min-h-screen bg-background overflow-x-hidden">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
        <div className="p-4">
          <div className="space-y-4 w-full">
          {/* Players Tab Content */}
          {activeTab === "players" && (
          <div>
            {/* Tier Mismatch Legend */}
            <Card className="mb-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tier Mismatch Legend</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="destructive" className="text-xs">MISMATCH</Badge>
                    <span className="text-muted-foreground">Tier mismatch</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="destructive" className="text-xs">MISSING</Badge>
                    <span className="text-muted-foreground">No Discord role</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="destructive" className="text-xs">WRONG</Badge>
                    <span className="text-muted-foreground">Different role</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="destructive" className="text-xs">MULTIPLE</Badge>
                    <span className="text-muted-foreground">Multiple roles</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <CardTitle className="text-sm">All Players</CardTitle>
                      <CardDescription className="text-xs">
                        {isAdmin ? "Manage player evaluations and status" : "View all players and admin comments"}
                      </CardDescription>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <Button
                        size="sm"
                        variant={statusFilter === "all" ? "default" : "outline"}
                        onClick={() => setStatusFilter("all")}
                        className="h-7 text-xs px-2.5"
                      >
                        All ({filteredAllCount})
                      </Button>
                      <Button
                        size="sm"
                        variant={statusFilter === "active" ? "default" : "outline"}
                        onClick={() => setStatusFilter("active")}
                        className="h-7 text-xs px-2.5"
                      >
                        Active ({filteredActiveCount})
                      </Button>
                      <Button
                        size="sm"
                        variant={statusFilter === "archived" ? "default" : "outline"}
                        onClick={() => setStatusFilter("archived")}
                        className="h-7 text-xs px-2.5"
                      >
                        Archived ({filteredArchivedCount})
                      </Button>
                      <Button
                        size="sm"
                        variant={statusFilter === "rejected" ? "default" : "outline"}
                        onClick={() => setStatusFilter("rejected")}
                        className="h-7 text-xs px-2.5"
                      >
                        Rejected ({filteredRejectedCount})
                      </Button>
                    </div>
                    {isAdmin && statusFilter === "archived" && archivedPlayers.length > 0 && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleDeleteAllArchived}
                        disabled={isDeletingArchived}
                        className="h-7 text-xs px-2.5"
                      >
                        {isDeletingArchived ? "Deleting..." : "Delete All Archived"}
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search by Discord username, Epic username, or nickname..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full sm:w-[160px] justify-start h-8 text-xs">
                          <Filter className="mr-1.5 h-3.5 w-3.5" />
                          Filters
                          {(tierFilters.size > 0 || femaleVerifiedOnly || notFemaleVerified || showDuplicatesOnly) && (
                            <Badge variant="secondary" className="ml-1.5 text-xs px-1">
                              {tierFilters.size + (femaleVerifiedOnly ? 1 : 0) + (notFemaleVerified ? 1 : 0) + (showDuplicatesOnly ? 1 : 0)}
                            </Badge>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64" align="start">
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium text-sm mb-3">Tier</h4>
                            <div className="space-y-2">
                              {["S", "A", "B", "C"].map((tier) => (
                                <div key={tier} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`admin-tier-${tier}`}
                                    checked={tierFilters.has(tier)}
                                    onCheckedChange={() => toggleTierFilter(tier)}
                                  />
                                  <label
                                    htmlFor={`admin-tier-${tier}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                  >
                                    Tier {tier}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          <div className="border-t pt-3">
                            <h4 className="font-medium text-sm mb-3">Verification</h4>
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="admin-female-verified"
                                  checked={femaleVerifiedOnly}
                                  onCheckedChange={(checked) => {
                                    if (checked === true) {
                                      setFemaleVerifiedOnly(true);
                                      setNotFemaleVerified(false);
                                    } else {
                                      setFemaleVerifiedOnly(false);
                                    }
                                  }}
                                />
                                <label
                                  htmlFor="admin-female-verified"
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                  Female Verified Only
                                </label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="admin-not-female-verified"
                                  checked={notFemaleVerified}
                                  onCheckedChange={(checked) => {
                                    if (checked === true) {
                                      setNotFemaleVerified(true);
                                      setFemaleVerifiedOnly(false);
                                    } else {
                                      setNotFemaleVerified(false);
                                    }
                                  }}
                                />
                                <label
                                  htmlFor="admin-not-female-verified"
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                  Not Female Verified
                                </label>
                              </div>
                            </div>
                          </div>
                          
                          <div className="border-t pt-3">
                            <h4 className="font-medium text-sm mb-3">Issues</h4>
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="admin-show-duplicates"
                                  checked={showDuplicatesOnly}
                                  onCheckedChange={(checked) => {
                                    setShowDuplicatesOnly(checked === true);
                                    setCurrentPage(1);
                                  }}
                                />
                                <label
                                  htmlFor="admin-show-duplicates"
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                  Show Duplicates Only
                                </label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="admin-show-tier-mismatches"
                                  checked={showTierMismatchesOnly}
                                  onCheckedChange={(checked) => {
                                    setShowTierMismatchesOnly(checked === true);
                                    setCurrentPage(1);
                                  }}
                                />
                                <label
                                  htmlFor="admin-show-tier-mismatches"
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                  Show Tier Mismatches Only
                                </label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="admin-show-missing-discord-id"
                                  checked={showMissingDiscordIdOnly}
                                  onCheckedChange={(checked) => {
                                    setShowMissingDiscordIdOnly(checked === true);
                                    setCurrentPage(1);
                                  }}
                                />
                                <label
                                  htmlFor="admin-show-missing-discord-id"
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                  Show Without Discord ID
                                </label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="admin-show-needs-review"
                                  checked={showNeedsReviewOnly}
                                  onCheckedChange={(checked) => {
                                    setShowNeedsReviewOnly(checked === true);
                                    setCurrentPage(1);
                                  }}
                                />
                                <label
                                  htmlFor="admin-show-needs-review"
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                  Show Needs Review Only
                                </label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="admin-show-left-server"
                                  checked={showLeftServerOnly}
                                  onCheckedChange={(checked) => {
                                    setShowLeftServerOnly(checked === true);
                                    setCurrentPage(1);
                                  }}
                                />
                                <label
                                  htmlFor="admin-show-left-server"
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                  Show Left Server Only
                                </label>
                              </div>
                            </div>
                          </div>
                          
                          {(tierFilters.size > 0 || femaleVerifiedOnly || notFemaleVerified || showDuplicatesOnly || showTierMismatchesOnly || showMissingDiscordIdOnly || showNeedsReviewOnly || showLeftServerOnly) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={clearAllFilters}
                              className="w-full"
                            >
                              Clear All Filters
                            </Button>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Select value={sortBy} onValueChange={(value) => { setSortBy(value); setCurrentPage(1); }}>
                      <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs">
                        <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" />
                        <SelectValue placeholder="Sort by..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="discord-asc">Discord (A-Z)</SelectItem>
                        <SelectItem value="discord-desc">Discord (Z-A)</SelectItem>
                        <SelectItem value="epic-asc">Epic (A-Z)</SelectItem>
                        <SelectItem value="epic-desc">Epic (Z-A)</SelectItem>
                        <SelectItem value="tier-high">Tier (S → C)</SelectItem>
                        <SelectItem value="tier-low">Tier (C → S)</SelectItem>
                        <SelectItem value="score-high">Score (High → Low)</SelectItem>
                        <SelectItem value="score-low">Score (Low → High)</SelectItem>
                        <SelectItem value="events-high">Events (High → Low)</SelectItem>
                        <SelectItem value="events-low">Events (Low → High)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs">
                          <Settings className="mr-1.5 h-3.5 w-3.5" />
                          Columns
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56" align="start">
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm mb-3">Toggle Columns</h4>
                          {isAdmin && (
                            <label className="flex items-center gap-2 cursor-pointer text-sm">
                              <Checkbox
                                checked={visibleColumns.merge}
                                onCheckedChange={(checked) => 
                                  setVisibleColumns(prev => ({ ...prev, merge: checked as boolean }))
                                }
                              />
                              <span>Merge</span>
                            </label>
                          )}
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <Checkbox
                              checked={visibleColumns.player}
                              onCheckedChange={(checked) => 
                                setVisibleColumns(prev => ({ ...prev, player: checked as boolean }))
                              }
                            />
                            <span>Player</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <Checkbox
                              checked={visibleColumns.epic}
                              onCheckedChange={(checked) => 
                                setVisibleColumns(prev => ({ ...prev, epic: checked as boolean }))
                              }
                            />
                            <span>Epic Username</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <Checkbox
                              checked={visibleColumns.discordId}
                              onCheckedChange={(checked) => 
                                setVisibleColumns(prev => ({ ...prev, discordId: checked as boolean }))
                              }
                            />
                            <span>Discord ID</span>
                          </label>
                          {isAdmin && (
                            <>
                              <label className="flex items-center gap-2 cursor-pointer text-sm">
                                <Checkbox
                                  checked={visibleColumns.status}
                                  onCheckedChange={(checked) => 
                                    setVisibleColumns(prev => ({ ...prev, status: checked as boolean }))
                                  }
                                />
                                <span>Status</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer text-sm">
                                <Checkbox
                                  checked={visibleColumns.totalScore}
                                  onCheckedChange={(checked) => 
                                    setVisibleColumns(prev => ({ ...prev, totalScore: checked as boolean }))
                                  }
                                />
                                <span>Total Score</span>
                              </label>
                            </>
                          )}
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <Checkbox
                              checked={visibleColumns.tier}
                              onCheckedChange={(checked) => 
                                setVisibleColumns(prev => ({ ...prev, tier: checked as boolean }))
                              }
                            />
                            <span>Tier</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <Checkbox
                              checked={visibleColumns.discordRole}
                              onCheckedChange={(checked) => 
                                setVisibleColumns(prev => ({ ...prev, discordRole: checked as boolean }))
                              }
                            />
                            <span>Discord Role</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <Checkbox
                              checked={visibleColumns.duplicates}
                              onCheckedChange={(checked) => 
                                setVisibleColumns(prev => ({ ...prev, duplicates: checked as boolean }))
                              }
                            />
                            <span>Duplicates</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <Checkbox
                              checked={visibleColumns.events}
                              onCheckedChange={(checked) => 
                                setVisibleColumns(prev => ({ ...prev, events: checked as boolean }))
                              }
                            />
                            <span>Events</span>
                          </label>
                          {isAdmin && (
                            <label className="flex items-center gap-2 cursor-pointer text-sm">
                              <Checkbox
                                checked={visibleColumns.actions}
                                onCheckedChange={(checked) => 
                                  setVisibleColumns(prev => ({ ...prev, actions: checked as boolean }))
                                }
                              />
                              <span>Actions</span>
                            </label>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border min-w-[180px] max-w-[240px]">
                    <span className="text-xs font-medium whitespace-nowrap">Events: {eventsRange[0]}-{eventsRange[1]}</span>
                    <Slider
                      value={eventsRange}
                      onValueChange={(value) => {
                        setEventsRange(value as [number, number]);
                        setCurrentPage(1);
                      }}
                      min={0}
                      max={maxEvents}
                      step={1}
                      className="flex-1"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredPlayers.length === 0 ? (
                  <div className="p-6">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Users />
                        </EmptyMedia>
                        <EmptyTitle>No players yet</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </div>
                ) : (
                  <>
                    {selectedForMerge.size > 0 && (
                      <div className="mb-4 flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md">
                        <Badge variant="secondary">
                          {selectedForMerge.size} selected
                        </Badge>
                        {selectedForMerge.size === 2 ? (
                          <Button size="sm" onClick={handleManualMerge}>
                            Merge Selected Players
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Select exactly 2 players to merge
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedForMerge(new Set())}
                        >
                          Clear Selection
                        </Button>
                      </div>
                    )}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {isAdmin && visibleColumns.merge && <TableHead className="w-12 pl-6">Merge</TableHead>}
                          {visibleColumns.player && (
                            <TableHead 
                              className="cursor-pointer hover:bg-muted/50 select-none"
                              onClick={() => handleColumnSort("discord")}
                            >
                              Player{getSortIcon("discord")}
                            </TableHead>
                          )}
                          {visibleColumns.epic && (
                            <TableHead 
                              className="cursor-pointer hover:bg-muted/50 select-none"
                              onClick={() => handleColumnSort("epic")}
                            >
                              Epic Username{getSortIcon("epic")}
                            </TableHead>
                          )}
                          {visibleColumns.discordId && <TableHead>Discord ID</TableHead>}
                          {isAdmin && visibleColumns.status && <TableHead>Status</TableHead>}
                          {isAdmin && visibleColumns.totalScore && (
                            <TableHead 
                              className="cursor-pointer hover:bg-muted/50 select-none"
                              onClick={() => handleColumnSort("score")}
                            >
                              Total Score{getSortIcon("score")}
                            </TableHead>
                          )}
                          {visibleColumns.tier && (
                            <TableHead 
                              className="cursor-pointer hover:bg-muted/50 select-none"
                              onClick={() => handleColumnSort("tier")}
                            >
                              Tier{getSortIcon("tier")}
                            </TableHead>
                          )}
                          {visibleColumns.discordRole && <TableHead>Discord Role</TableHead>}
                          {visibleColumns.duplicates && <TableHead>Duplicates</TableHead>}
                          {visibleColumns.events && (
                            <TableHead 
                              className="cursor-pointer hover:bg-muted/50 select-none"
                              onClick={() => handleColumnSort("events")}
                            >
                              Events{getSortIcon("events")}
                            </TableHead>
                          )}
                          {isAdmin && visibleColumns.actions && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedPlayers.map((player) => {
                        const mismatch = getRoleMismatch(player);
                        const tierMismatch = getTierMismatchFromRoles(player);
                        return (
                        <TableRow key={player._id}>
                          {isAdmin && visibleColumns.merge && (
                            <TableCell className="pl-6">
                              <Checkbox
                                checked={selectedForMerge.has(player._id)}
                                onCheckedChange={() => togglePlayerForMerge(player._id)}
                                disabled={selectedForMerge.size >= 2 && !selectedForMerge.has(player._id)}
                              />
                            </TableCell>
                          )}
                          {visibleColumns.player && (
                            <TableCell className="font-medium">
                              {player.discordUsername}
                              {player.nickname && (
                                <div className="text-xs text-muted-foreground">
                                  "{player.nickname}"
                                </div>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.epic && (
                            <TableCell>{player.epicUsername}</TableCell>
                          )}
                          {visibleColumns.discordId && (
                            <TableCell>
                              {player.discordUserId ? (
                                <span className="font-mono text-xs">{player.discordUserId}</span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                          )}
                          {isAdmin && visibleColumns.status && (
                            <TableCell>
                              <select
                                value={player.status || "active"}
                                onChange={(e) =>
                                  handleStatusChange(
                                    player._id,
                                    e.target.value as "active" | "archived" | "rejected",
                                    player.discordUsername
                                  )
                                }
                                className="text-sm border rounded px-2 py-1"
                              >
                                <option value="active">Active</option>
                                <option value="archived">Archived</option>
                                <option value="rejected">Rejected</option>
                              </select>
                            </TableCell>
                          )}
                          {isAdmin && visibleColumns.totalScore && (
                            <TableCell>
                              {player.totalScore !== undefined ? (
                                <span className="font-mono">{player.totalScore} / 1900</span>
                              ) : (
                                <span className="text-muted-foreground">Not evaluated</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.tier && (
                            <TableCell>
                              {player.tier ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant={
                                        player.tier === "S"
                                          ? "default"
                                          : player.tier === "A"
                                            ? "secondary"
                                            : "secondary"
                                      }
                                      className="font-bold"
                                    >
                                      Tier {player.tier}
                                    </Badge>
                                    {tierMismatch.status !== "correct" && tierMismatch.status !== "no_tier" && (
                                      <Badge variant="destructive" className="text-xs">
                                        MISMATCH
                                      </Badge>
                                    )}
                                    {player.needsReview && (
                                      <Badge variant="secondary" className="text-xs bg-orange-500 text-white">
                                        REVIEW
                                      </Badge>
                                    )}
                                    {player.hasLeftServer && (
                                      <div className="flex items-center gap-1">
                                        <LogOut className="h-3 w-3 text-red-500" />
                                      </div>
                                    )}
                                    {player.matchConfidence === "fuzzy" && (
                                      <Badge variant="secondary" className="text-xs bg-orange-500 text-white">
                                        FUZZY MATCH
                                      </Badge>
                                    )}
                                    {player.matchConfidence === "username" && (
                                      <Badge variant="secondary" className="text-xs bg-blue-500 text-white">
                                        USERNAME
                                      </Badge>
                                    )}
                                  </div>
                                  {tierMismatch.status === "missing_role" && (
                                    <div className="flex items-center gap-1 text-destructive">
                                      <XCircle className="h-3 w-3" />
                                      <span className="text-xs">No Discord tier role</span>
                                    </div>
                                  )}
                                  {tierMismatch.status === "wrong_role" && (
                                    <div className="flex items-center gap-1 text-orange-500">
                                      <AlertCircle className="h-3 w-3" />
                                      <span className="text-xs">Discord: Tier {tierMismatch.discordTiers[0]}</span>
                                    </div>
                                  )}
                                  {tierMismatch.status === "multiple_roles" && (
                                    <div className="flex items-center gap-1 text-yellow-600">
                                      <AlertTriangle className="h-3 w-3" />
                                      <span className="text-xs">Multiple: {tierMismatch.discordTiers.map(t => `Tier ${t}`).join(", ")}</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.discordRole && (
                            <TableCell>
                              {playersChecked === 0 ? (
                                <span className="text-xs text-muted-foreground">Not checked</span>
                              ) : !player.tier || !player.discordUserId ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : mismatch ? (
                                <div className="flex items-center gap-1">
                                  {mismatch.status === "missing_role" && (
                                    <>
                                      <XCircle className="h-4 w-4 text-destructive" />
                                      <span className="text-xs text-destructive">Missing</span>
                                    </>
                                  )}
                                  {mismatch.status === "wrong_role" && (
                                    <>
                                      <AlertCircle className="h-4 w-4 text-orange-500" />
                                      <span className="text-xs text-orange-500">Wrong</span>
                                    </>
                                  )}
                                  {mismatch.status === "multiple_roles" && (
                                    <>
                                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                      <span className="text-xs text-yellow-500">Multiple</span>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                  <span className="text-xs text-green-600">Correct</span>
                                </div>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.duplicates && (
                            <TableCell>
                              {player.duplicateEpicCount > 0 || player.duplicateDiscordCount > 0 || player.duplicateDiscordIdCount > 0 ? (
                                <div className="space-y-0.5">
                                  {player.duplicateEpicCount > 0 && (
                                    <div className="flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3 text-orange-500" />
                                      <span className="text-xs text-orange-500">Epic ({player.duplicateEpicCount})</span>
                                    </div>
                                  )}
                                  {player.duplicateDiscordCount > 0 && (
                                    <div className="flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3 text-orange-500" />
                                      <span className="text-xs text-orange-500">Discord ({player.duplicateDiscordCount})</span>
                                    </div>
                                  )}
                                  {player.duplicateDiscordIdCount > 0 && (
                                    <div className="flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3 text-orange-500" />
                                      <span className="text-xs text-orange-500">ID ({player.duplicateDiscordIdCount})</span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          {visibleColumns.events && (
                            <TableCell>
                              <span className="font-mono text-sm">{player.eventsPlayed || 0}</span>
                            </TableCell>
                          )}
                          {isAdmin && visibleColumns.actions && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedPlayer(player._id);
                                    setIsEditDialogOpen(true);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedPlayer(player._id);
                                    setIsScoreDialogOpen(true);
                                  }}
                                >
                                  {player.totalScore !== undefined ? "Update" : "Evaluate"}
                                </Button>
                                {player.needsReview && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={async () => {
                                      try {
                                        await clearReviewFlag({ playerId: player._id });
                                        toast.success("Review flag cleared");
                                      } catch (error) {
                                        toast.error("Failed to clear review flag");
                                      }
                                    }}
                                    className="bg-green-500 hover:bg-green-600 text-white"
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                )}
                                {(player.status === "archived" || player.status === "rejected") && (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleDeletePlayer(player._id, player.discordUsername)}
                                    disabled={deletingPlayerId === player._id}
                                  >
                                    {deletingPlayerId === player._id ? (
                                      "..."
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                        );
                        })}
                      </TableBody>
                    </Table>
                    {renderPagination()}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Yunite Tab Content */}
        {isAdmin && activeTab === "yunite" && (
          <div>
            <YuniteDashboard />
          </div>
        )}





        {/* Support Tab Content */}
        {isModeratorOrAdmin && activeTab === "support" && (
          <div>
            <SupportPanel />
          </div>
        )}

        {/* Audit Log Tab Content */}
        {activeTab === "audit" && (
          <div>
            <AuditLogView />
          </div>
        )}

        {/* Features Tab Content */}
        {isAdmin && activeTab === "features" && (
          <div className="space-y-4">
            {/* Quick Actions - Horizontal Layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Export Player Evaluations */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Export Player Evaluations</CardTitle>
                  <CardDescription className="text-xs">
                    Export all player evaluation data to CSV
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-3">
                  <Button
                    size="sm"
                    onClick={() => setIsExportDialogOpen(true)}
                    disabled={!evaluations || evaluations.length === 0}
                  >
                    <Download className="mr-2 h-3 w-3" />
                    Export Evaluations
                  </Button>
                </CardContent>
              </Card>
              
              {/* Merge Duplicate Players */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Merge Duplicate Players</CardTitle>
                  <CardDescription className="text-xs">
                    Merge duplicate player records into a single record
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-3">
                  <Button
                    size="sm"
                    onClick={() => setIsMergeDialogOpen(true)}
                  >
                    <Users className="mr-2 h-3 w-3" />
                    Merge Players
                  </Button>
                </CardContent>
              </Card>
              
              {/* Relink Third Party Results */}
              <Card className="border-primary">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-primary">
                    <Zap className="h-4 w-4" />
                    Relink Third Party Results
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Re-link tournament results. Use if player stats aren't showing after database changes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-3">
                  <RelinkResultsButton />
                </CardContent>
              </Card>
            </div>
            
            {/* Dangerous Actions - Horizontal Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Clear Discord Members */}
              <Card className="border-orange-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
                    <AlertTriangle className="h-4 w-4" />
                    Clear Discord Member List
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Delete Discord synced members who have NOT been evaluated/assigned a tier.
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleDeleteDiscordOnlyMembers}
                    disabled={isDeletingDiscordOnly || !players || players.length === 0}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeletingDiscordOnly ? "Clearing..." : "Clear Discord Sync Data"}
                  </Button>
                </CardContent>
              </Card>
              
              {/* Nuclear Option - Delete Everything */}
              <Card className="border-destructive">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    ⚠️ NUCLEAR OPTION: Delete Everything
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Delete ALL players from the database including evaluated players with tiers.
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-3">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDeleteAllPlayers}
                    disabled={isDeletingAllPlayers || !players || players.length === 0}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeletingAllPlayers ? "Deleting..." : "Delete EVERYTHING"}
                  </Button>
                </CardContent>
              </Card>
            </div>
            
            <GoogleSheetsManager />
            <YuniteDashboard showMatchData={false} />
          </div>
        )}
          </div>
        </div>
      </main>

      {/* Dialogs */}
      {selectedPlayer && (
        <>
          <ScorePlayerDialog
            open={isScoreDialogOpen}
            onOpenChange={setIsScoreDialogOpen}
            playerId={selectedPlayer}
          />
          <EditPlayerDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            playerId={selectedPlayer}
          />
        </>
      )}
      
      {rejectingPlayer && (
        <RejectPlayerDialog
          open={isRejectDialogOpen}
          onOpenChange={setIsRejectDialogOpen}
          playerName={rejectingPlayer.name}
          onConfirm={handleRejectConfirm}
        />
      )}
      
      {archivingPlayer && (
        <ArchivePlayerDialog
          open={isArchiveDialogOpen}
          onOpenChange={setIsArchiveDialogOpen}
          playerName={archivingPlayer.name}
          onConfirm={handleArchiveConfirm}
        />
      )}
      
      <RoleMismatchDialog
        open={isRoleMismatchDialogOpen}
        onOpenChange={setIsRoleMismatchDialogOpen}
        mismatches={roleMismatches}
        playersChecked={playersChecked}
      />
      
      <ImportPlayersDialog
        open={isImportPlayersDialogOpen}
        onOpenChange={setIsImportPlayersDialogOpen}
      />
      
      <ExportOptionsDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        onExport={handleExportEvaluations}
      />
      
      <MergePlayersDialog
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
      />
    </div>
  );
}
