import { useState, useEffect } from "react";
import { useClientPagination } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { UserCheck, UserX, UserMinus, Loader2, ExternalLink, AlertTriangle, Edit, Award, ArrowUpDown, Search, Trash2, ShieldAlert, Plus, RefreshCw, Users, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import MergeMembersDialog from "./_components/merge-members-dialog.tsx";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { format } from "date-fns";
import { Link, useSearchParams, useParams, useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/use-user-role.ts";
import ScorePlayerDialog from "../_components/score-player-dialog.tsx";
import EditPlayerDialog from "./_components/edit-player-dialog.tsx";
import EditMemberStatusDialog from "../_components/edit-member-status-dialog.tsx";
import NewApplicationDialog from "./_components/new-application-dialog.tsx";
import EditApplicationDialog from "./_components/edit-application-dialog.tsx";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import PlayerProfileLink from "@/components/player-profile-link.tsx";
import FemaleVerifiedBadge from "@/components/female-verified-badge.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { compareTierField } from "@/lib/tier-sort.ts";
import { DiscordSyncTools } from "./_components/discord-sync-tools.tsx";
import { mobileActionRowClass } from "@/lib/mobile-buttons.ts";
import BigSummerReEvalDashboard from "./_components/big-summer-reeval-dashboard.tsx";

const ADMIN_TABS = ["applications", "accepted", "rejected", "former", "discord", "big-reeval"];
const MOD_TABS = ["applications", "accepted", "former"];

function resolveMemberManagementTab(
  tabFromPath: string | undefined,
  tabFromQuery: string | null,
  isAdmin: boolean,
): string {
  const tab = tabFromPath || tabFromQuery || undefined;
  const allowed = isAdmin ? ADMIN_TABS : MOD_TABS;
  if (tab === "discord" && isAdmin) return "discord";
  if (tab === "big-reeval" && isAdmin) return "big-reeval";
  if (tab && allowed.includes(tab)) return tab;
  return "applications";
}

function filterAcceptedMembersBySearch<
  T extends { searchText: string; nickname?: string },
>(members: T[], searchTerm: string): T[] {
  if (!searchTerm.trim()) return members;
  const term = searchTerm.toLowerCase();
  return members.filter(
    (member) =>
      member.searchText.includes(term) ||
      (member.nickname?.toLowerCase().includes(term) ?? false),
  );
}

export default function MemberManagement() {
  const { user, isAdmin, isModeratorOrAdmin, isLoading: isRoleLoading } = useUserRole();
  const isAuthenticated = !!user;
  const [searchParams] = useSearchParams();
  const { tab: tabFromPath } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() =>
    resolveMemberManagementTab(
      tabFromPath,
      searchParams.get("tab"),
      false,
    ),
  );
  const [roleResolved, setRoleResolved] = useState(false);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    navigate(`/admin/member-management/${tab}`, { replace: true });
  };

  // Once role loads, set the correct default tab (URL path or ?tab= takes precedence)
  useEffect(() => {
    if (!isRoleLoading && !roleResolved) {
      setRoleResolved(true);
      const tab = tabFromPath || searchParams.get("tab");
      const adminTabs = ["applications", "accepted", "rejected", "former", "discord", "big-reeval"];
      const modTabs = ["applications", "accepted", "former"];
      if (tab === "discord" && isAdmin) {
        setActiveTab("discord");
      } else if (tab === "big-reeval" && isAdmin) {
        setActiveTab("big-reeval");
      } else if (tab && (isAdmin ? adminTabs : modTabs).includes(tab)) {
        setActiveTab(tab);
      } else if (isAdmin || isModeratorOrAdmin) {
        setActiveTab("applications");
      }
    }
  }, [isRoleLoading, isAdmin, isModeratorOrAdmin, roleResolved, searchParams, tabFromPath]);
  
  // New Application Dialog state
  const [newAppDialogOpen, setNewAppDialogOpen] = useState(false);
  
  // Current Applications state
  const [selectedApplication, setSelectedApplication] = useState<Id<"applications"> | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("Incomplete Application");
  const [evaluatingPlayerId, setEvaluatingPlayerId] = useState<Id<"players"> | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<Id<"players"> | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<Id<"players"> | null>(null);
  const [editingApplicationId, setEditingApplicationId] = useState<Id<"applications"> | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [applicationToDelete, setApplicationToDelete] = useState<Id<"applications"> | null>(null);
  const [playerDeleteConfirmOpen, setPlayerDeleteConfirmOpen] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<Id<"players"> | null>(null);
  const [isSyncingGirlRole, setIsSyncingGirlRole] = useState(false);
  const [mergeSelectedIds, setMergeSelectedIds] = useState<Id<"players">[]>([]);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  
  // Search state
  const [acceptedSearch, setAcceptedSearch] = useState("");
  const [discordSearch, setDiscordSearch] = useState("");
  const [rejectedSearch, setRejectedSearch] = useState("");
  const [formerSearch, setFormerSearch] = useState("");
  
  // Sorting state
  const [acceptedSort, setAcceptedSort] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "tier", direction: "asc" });
  const [discordSort, setDiscordSort] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "tier", direction: "asc" });
  const [rejectedSort, setRejectedSort] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "tier", direction: "asc" });
  const [formerSort, setFormerSort] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "tier", direction: "asc" });
  
  // Queries — only fire when authenticated
  const pendingApplications = useQuery(
    api.memberManagement.getPendingApplications,
    isModeratorOrAdmin && activeTab === "applications" ? {} : "skip",
  );
  const acceptedMembers = useQuery(
    api.memberManagement.getAcceptedMembers,
    isAuthenticated && activeTab === "accepted" ? {} : "skip",
  );
  const rejectedMembers = useQuery(
    api.memberManagement.getRejectedMembers,
    isAdmin && activeTab === "rejected" ? {} : "skip",
  );
  const formerMembers = useQuery(
    api.memberManagement.getFormerMembers,
    isAuthenticated && activeTab === "former" ? {} : "skip",
  );
  const discordMembers = useQuery(
    api.memberManagement.getDiscordMembers,
    isAdmin && activeTab === "discord" ? {} : "skip",
  );
  
  // Mutations
  const deleteApplicationMutation = useMutation(api.memberManagement.deleteApplication);
  const deletePlayerMutation = useMutation(api.memberManagement.deletePlayer);
  const acceptApplication = useMutation(api.memberManagement.acceptApplication);
  const rejectApplication = useMutation(api.memberManagement.rejectApplication);
  const convertToPlayer = useMutation(api.discord.convertToPlayer);
  const syncGirlRole = useAction(api.girlRole.sync.syncGirlRole);
  const girlRoleSyncStatus = useQuery(
    api.girlRole.queries.getVerificationCount,
    isAdmin ? {} : "skip",
  );
  const [convertingPlayerId, setConvertingPlayerId] = useState<Id<"players"> | null>(null);
  
  const modTabs = ["applications", "accepted", "former"];
  if (!isAdmin && !modTabs.includes(activeTab)) {
    setActiveTab("applications");
  }
  
  // Accept application
  const handleAccept = async (applicationId: Id<"applications">) => {
    try {
      await acceptApplication({ applicationId });
      toast.success("Application accepted");
      setSelectedApplication(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to accept application");
    }
  };
  
  // Reject application
  const handleReject = async () => {
    if (!selectedApplication || !rejectionReason) {
      toast.error("Rejection reason is required");
      return;
    }
    
    try {
      await rejectApplication({
        applicationId: selectedApplication,
        rejectionReason: rejectionReason,
      });
      toast.success("Application rejected");
      setRejectDialogOpen(false);
      setSelectedApplication(null);
      setRejectionReason("Incomplete Application");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject application");
    }
  };
  
  // Delete application
  const handleDeleteApplication = async () => {
    if (!applicationToDelete) return;
    
    try {
      await deleteApplicationMutation({ applicationId: applicationToDelete });
      toast.success("Application deleted");
      setDeleteConfirmOpen(false);
      setApplicationToDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete application");
    }
  };
  
  // Evaluate (convert) discord member to accepted player
  const handleEvaluateDiscordMember = async (playerId: Id<"players">) => {
    setConvertingPlayerId(playerId);
    try {
      const result = await convertToPlayer({ playerId });
      toast.success(`${result.epicUsername} moved to Accepted Members`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to evaluate member");
    } finally {
      setConvertingPlayerId(null);
    }
  };

  // Delete player
  const handleDeletePlayer = async () => {
    if (!playerToDelete) return;
    
    try {
      await deletePlayerMutation({ playerId: playerToDelete });
      toast.success("Player and all associated data deleted");
      setPlayerDeleteConfirmOpen(false);
      setPlayerToDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete player");
    }
  };

  const handleExportRejectedCsv = () => {
    if (!rejectedMembers || rejectedMembers.length === 0) {
      toast.error("No rejected applications to export");
      return;
    }

    const rowsToExport = sortedRejectedMembers.length > 0 ? sortedRejectedMembers : rejectedMembers;
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const headers = [
      "discordUsername",
      "discordUserId",
      "epicUsername",
      "tier",
      "rejectionReason",
      "createdAt",
    ];
    const csvRows = rowsToExport.map((member) => [
      escapeCsv(member.discordUsername),
      escapeCsv(member.discordUserId ?? ""),
      escapeCsv(member.epicUsername),
      escapeCsv(member.tier ?? ""),
      escapeCsv(member.rejectionReason ?? ""),
      escapeCsv(format(new Date(member._creationTime), "yyyy-MM-dd")),
    ]);

    const csv = [headers.join(","), ...csvRows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rejected-players-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rowsToExport.length} rejected application(s) to CSV`);
  };

  const handleSyncGirlRole = async () => {
    setIsSyncingGirlRole(true);
    try {
      const result = await syncGirlRole();
      toast.success(
        `Girl Role sync complete: ${result.count} verification${result.count === 1 ? "" : "s"} loaded from Mod Log`,
      );
    } catch (error) {
      const message =
        error instanceof ConvexError
          ? (typeof error.data === "object" && error.data !== null && "message" in error.data
              ? String((error.data as { message: string }).message)
              : String(error.data))
          : error instanceof Error
            ? error.message
            : "Failed to sync Girl Role verifications";
      toast.error(message);
    } finally {
      setIsSyncingGirlRole(false);
    }
  };
  
  // Tier mismatch detection from cached Discord roles
  const TIER_ROLE_NAMES = ["Tier S", "Tier A", "Tier B", "Tier C", "Tier D"];
  const getTierMismatch = (member: { tier?: string; discordRoles?: Array<{ id: string; name: string }> }): {
    status: "missing_role" | "wrong_role" | "multiple_roles" | "correct" | "no_tier";
    discordTiers: string[];
  } => {
    if (!member.tier) return { status: "no_tier", discordTiers: [] };
    const discordTierRoles = (member.discordRoles ?? [])
      .filter((role) => TIER_ROLE_NAMES.includes(role.name))
      .map((role) => role.name.replace("Tier ", ""));
    if (discordTierRoles.length === 0) return { status: "missing_role", discordTiers: [] };
    if (discordTierRoles.length > 1) return { status: "multiple_roles", discordTiers: discordTierRoles };
    if (discordTierRoles[0] !== member.tier) return { status: "wrong_role", discordTiers: discordTierRoles };
    return { status: "correct", discordTiers: discordTierRoles };
  };

  // Sorting helper
  const sortData = <T extends Record<string, unknown>>(data: T[], field: string, direction: "asc" | "desc"): T[] => {
    return [...data].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (field === "tier") {
        const tierCmp = compareTierField(
          typeof aVal === "string" ? aVal : undefined,
          typeof bVal === "string" ? bVal : undefined,
          direction,
        );
        if (tierCmp !== 0) return tierCmp;
        const aName = String(a.discordUsername ?? "");
        const bName = String(b.discordUsername ?? "");
        return direction === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName);
      }
      
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      
      if (typeof aVal === "string" && typeof bVal === "string") {
        return direction === "asc" 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      if (typeof aVal === "number" && typeof bVal === "number") {
        return direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      
      return 0;
    });
  };
  
  const toggleSort = (currentSort: { field: string; direction: "asc" | "desc" }, field: string) => {
    if (currentSort.field === field) {
      return { field, direction: currentSort.direction === "asc" ? "desc" as const : "asc" as const };
    }
    return { field, direction: "asc" as const };
  };
  
  // Sortable header component
  const SortableHeader = ({ 
    label, 
    field, 
    currentSort, 
    onSort 
  }: { 
    label: string; 
    field: string; 
    currentSort: { field: string; direction: "asc" | "desc" }; 
    onSort: () => void;
  }) => (
    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={onSort}>
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </div>
    </TableHead>
  );
  
  // Filter helper (includes alternateDiscordUserIds string arrays)
  const filterData = <T extends Record<string, unknown>>(data: T[], searchTerm: string): T[] => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((item) => {
      return Object.values(item).some((value) => {
        if (typeof value === "string") {
          return value.toLowerCase().includes(term);
        }
        if (Array.isArray(value)) {
          return value.some(
            (entry) =>
              typeof entry === "string" && entry.toLowerCase().includes(term),
          );
        }
        return false;
      });
    });
  };

  // Apply sorting and filtering to data
  const sortedAcceptedMembers = acceptedMembers
    ? filterAcceptedMembersBySearch(
        sortData(acceptedMembers, acceptedSort.field, acceptedSort.direction),
        acceptedSearch,
      )
    : [];
  const sortedDiscordMembers = discordMembers 
    ? filterData(sortData(discordMembers, discordSort.field, discordSort.direction), discordSearch)
    : [];
  const sortedRejectedMembers = rejectedMembers 
    ? filterData(sortData(rejectedMembers, rejectedSort.field, rejectedSort.direction), rejectedSearch)
    : [];
  const sortedFormerMembers = formerMembers 
    ? filterData(sortData(formerMembers, formerSort.field, formerSort.direction), formerSearch)
    : [];

  const isDiscordSnowflakeSearch = (term: string) => /^\d{17,20}$/.test(term.trim());
  const activeMemberSearch =
    activeTab === "accepted"
      ? acceptedSearch
      : activeTab === "discord"
        ? discordSearch
        : activeTab === "rejected"
          ? rejectedSearch
          : activeTab === "former"
            ? formerSearch
            : "";
  const activeFilteredCount =
    activeTab === "accepted"
      ? sortedAcceptedMembers.length
      : activeTab === "discord"
        ? sortedDiscordMembers.length
        : activeTab === "rejected"
          ? sortedRejectedMembers.length
          : activeTab === "former"
            ? sortedFormerMembers.length
            : 0;
  const activeTotalCount =
    activeTab === "accepted"
      ? (acceptedMembers?.length ?? 0)
      : activeTab === "discord"
        ? (discordMembers?.length ?? 0)
        : activeTab === "rejected"
          ? (rejectedMembers?.length ?? 0)
          : activeTab === "former"
            ? (formerMembers?.length ?? 0)
            : 0;

  const discordIdLookup = useQuery(
    api.memberManagement.lookupDiscordId,
    isAdmin &&
      isDiscordSnowflakeSearch(activeMemberSearch) &&
      activeFilteredCount === 0 &&
      activeTotalCount > 0
      ? { discordId: activeMemberSearch.trim() }
      : "skip",
  );

  const applicationsPagination = useClientPagination(pendingApplications ?? undefined, {
    resetDeps: [activeTab],
  });
  const acceptedPagination = useClientPagination(sortedAcceptedMembers, {
    resetDeps: [acceptedSearch, acceptedSort, activeTab],
  });
  const discordPagination = useClientPagination(sortedDiscordMembers, {
    resetDeps: [discordSearch, discordSort, activeTab],
  });
  const rejectedPagination = useClientPagination(sortedRejectedMembers, {
    resetDeps: [rejectedSearch, rejectedSort, activeTab],
  });
  const formerPagination = useClientPagination(sortedFormerMembers, {
    resetDeps: [formerSearch, formerSort, activeTab],
  });

  useEffect(() => {
    if (activeTab !== "accepted") {
      setMergeSelectedIds([]);
      setMergeDialogOpen(false);
    }
  }, [activeTab]);

  const toggleMergeSelection = (playerId: Id<"players">) => {
    setMergeSelectedIds((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      if (prev.length >= 2) {
        toast.info("Select at most two members to merge. Uncheck one first.");
        return prev;
      }
      return [...prev, playerId];
    });
  };

  const mergeSelectedMembers = mergeSelectedIds
    .map((id) => acceptedMembers?.find((m) => m._id === id))
    .filter((m) => m != null);

  const mergePair =
    mergeSelectedMembers.length === 2
      ? ([mergeSelectedMembers[0], mergeSelectedMembers[1]] as const)
      : null;

  const canOpenMergeDialog =
    mergePair !== null && mergePair[0]._id !== mergePair[1]._id;

  const memberListTabLabel: Record<string, string> = {
    accepted: "Accepted",
    former: "Former",
    rejected: "Rejected",
    discord: "Discord Members",
    hidden_alt: "Alt accounts (hidden from lists)",
    other: "Other / archived",
  };

  const renderDiscordLookupAlert = () => {
    if (!isAdmin || !isDiscordSnowflakeSearch(activeMemberSearch)) {
      return null;
    }
    if (discordIdLookup === undefined) {
      return null;
    }
    if (!discordIdLookup) {
      return null;
    }

    const { player, staffUser, applications } = discordIdLookup;

    if (player) {
      return (
        <Alert>
          <AlertTitle>Discord ID linked to a member</AlertTitle>
          <AlertDescription className="space-y-1 text-sm">
            <p>
              <span className="font-mono">{activeMemberSearch.trim()}</span> is a{" "}
              <strong>{player.matchType}</strong> ID on{" "}
              <strong>{player.discordUsername}</strong> ({player.epicUsername}).
            </p>
            {player.matchType === "alternate" && (
              <p>
                The Discord ID column shows the primary ID{" "}
                <span className="font-mono">{player.discordUserId}</span>. Search by
                username or that ID to find them in this table.
              </p>
            )}
            {player.memberListTab === "hidden_alt" ? (
              <p>This record is marked as an alt and is excluded from member management lists.</p>
            ) : player.memberListTab && player.memberListTab !== activeTab ? (
              <p>
                Open the{" "}
                <strong>
                  {memberListTabLabel[player.memberListTab] ?? player.memberListTab}
                </strong>{" "}
                tab to view them (current tab:{" "}
                {memberListTabLabel[activeTab] ?? activeTab}).
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      );
    }

    if (staffUser) {
      return (
        <Alert>
          <AlertTitle>Discord ID linked to a staff account</AlertTitle>
          <AlertDescription className="text-sm">
            This ID is on staff user <strong>{staffUser.displayName ?? staffUser.username}</strong>,
            not on a player/member record.
          </AlertDescription>
        </Alert>
      );
    }

    if (applications.length > 0) {
      const latest = applications[0];
      return (
        <Alert>
          <AlertTitle>Discord ID on application only</AlertTitle>
          <AlertDescription className="text-sm">
            Found on application for <strong>{latest.discordUsername}</strong> (status:{" "}
            {latest.status}). Check the Applications tab — it may not match a player row yet.
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Alert variant="destructive">
        <AlertTitle>No member record for this Discord ID</AlertTitle>
        <AlertDescription className="text-sm">
          <span className="font-mono">{activeMemberSearch.trim()}</span> is not on any player,
          staff account, or application in the database.
        </AlertDescription>
      </Alert>
    );
  };

  if (isRoleLoading) {
    return (
      <AdminPageLayout
        skipHeader
        requireModerator
        authTitle="Sign in to access member management"
      >
        <Skeleton className="h-9 w-64 mb-2" />
        <Skeleton className="h-5 w-80 mb-4" />
        <Skeleton className="h-10 w-full mb-4" />
        <Skeleton className="h-96 w-full" />
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      requireModerator
      title="Member Management"
      description={
        isAdmin
          ? "Manage member applications and status"
          : "View pending applications (tier only), accepted, and former members"
      }
      authTitle="Sign in to access member management"
      showSidebar={!!isModeratorOrAdmin}
      header={{
        actions: isAdmin ? (
          <>
            <DiscordSyncTools compact />
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSyncGirlRole}
              disabled={isSyncingGirlRole}
              title={
                girlRoleSyncStatus?.lastSyncedAt
                  ? `${girlRoleSyncStatus.count} verifications · last synced ${format(new Date(girlRoleSyncStatus.lastSyncedAt), "MMM d, yyyy h:mm a")}`
                  : "Sync female verifications from Mod Log Girl Role sheet"
              }
            >
              {isSyncingGirlRole ? (
                <Loader2 className="shrink-0 animate-spin sm:mr-1.5" />
              ) : (
                <RefreshCw className="shrink-0 sm:mr-1.5" />
              )}
              <span className="truncate">Girl Role</span>
              {girlRoleSyncStatus && girlRoleSyncStatus.count > 0 && !isSyncingGirlRole && (
                <Badge variant="outline" className="ml-0.5 shrink-0 px-1 py-0 text-[9px] font-normal sm:ml-1.5 sm:px-1.5 sm:text-[10px]">
                  {girlRoleSyncStatus.count}
                </Badge>
              )}
            </Button>
          </>
        ) : undefined,
      }}
    >
      <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList
              className={`inline-flex h-9 w-max min-w-0 gap-0.5 p-0.5 md:grid md:h-10 md:w-full md:gap-1 md:p-1 ${
                isAdmin ? "md:grid-cols-6" : isModeratorOrAdmin ? "md:grid-cols-3" : "md:grid-cols-2"
              }`}
            >
              {isModeratorOrAdmin && (
                <TabsTrigger value="applications" className="h-8 px-2.5 text-xs whitespace-nowrap md:h-auto md:px-3 md:py-1.5 md:text-sm">
                  Applications
                </TabsTrigger>
              )}
              <TabsTrigger value="accepted" className="h-8 px-2.5 text-xs whitespace-nowrap md:h-auto md:px-3 md:py-1.5 md:text-sm">Accepted</TabsTrigger>
              {isAdmin && <TabsTrigger value="rejected" className="h-8 px-2.5 text-xs whitespace-nowrap md:h-auto md:px-3 md:py-1.5 md:text-sm">Rejected</TabsTrigger>}
              <TabsTrigger value="former" className="h-8 px-2.5 text-xs whitespace-nowrap md:h-auto md:px-3 md:py-1.5 md:text-sm">Former</TabsTrigger>
              {isAdmin && <TabsTrigger value="discord" className="h-8 px-2.5 text-xs whitespace-nowrap md:h-auto md:px-3 md:py-1.5 md:text-sm">Discord</TabsTrigger>}
              {isAdmin && <TabsTrigger value="big-reeval" className="h-8 px-2.5 text-xs whitespace-nowrap md:h-auto md:px-3 md:py-1.5 md:text-sm">Summer Re-Eval</TabsTrigger>}
            </TabsList>
          </div>
          
          {/* Applications Tab - staff view; admin manages */}
          {isModeratorOrAdmin && (
            <TabsContent value="applications">
            <Card className="p-0 sm:p-6">
              <CardHeader className="px-3 py-4 sm:px-6 sm:py-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle>Applications</CardTitle>
                    <CardDescription>
                      {pendingApplications?.length || 0} pending application(s)
                    </CardDescription>
                  </div>
                  {isAdmin && (
                    <Button size="sm" onClick={() => setNewAppDialogOpen(true)} className="w-auto">
                      <Plus className="sm:mr-1.5" />
                      New Application
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                {pendingApplications === undefined ? (
                  <Skeleton className="h-96 w-full" />
                ) : pendingApplications.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No pending applications
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(applicationsPagination.pageItems ?? []).map((app) => (
                      <Card key={app._id} className="border-2">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-base">{app.discordUsername}</CardTitle>
                              {app.discordId && (
                                <CardDescription className="text-xs">
                                  Discord ID: {app.discordId}
                                </CardDescription>
                              )}
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {app.isPreviouslyApplied && (
                                  <Badge variant="outline" className="text-xs">
                                    <AlertTriangle className="mr-1 h-3 w-3" />
                                    Previously Applied
                                  </Badge>
                                )}
                                {app.isPreviouslyAccepted && (
                                  <Badge variant="outline" className="bg-green-50 text-xs">
                                    Previously Accepted
                                  </Badge>
                                )}
                                {app.isFormerMember && (
                                  <Badge variant="outline" className="bg-yellow-50 text-xs">
                                    Former Member
                                  </Badge>
                                )}
                                {app.evaluation && (
                                  <Badge variant={
                                    app.evaluation.tier === "S" ? "default" :
                                    app.evaluation.tier === "A" ? "secondary" :
                                    "outline"
                                  } className="text-xs">
                                    Tier {app.evaluation.tier}
                                    {isAdmin && "totalScore" in app.evaluation && (
                                      <> - {app.evaluation.totalScore} pts</>
                                    )}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(app._creationTime), "MMM d, yyyy")}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="space-y-3">
                            <a
                              href={app.fortniteProfileLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1 break-all"
                            >
                              {app.fortniteProfileLink}
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                            {isAdmin && (
                              <div className={mobileActionRowClass}>
                                <Button
                                  onClick={() => setEditingApplicationId(app._id)}
                                  variant="secondary"
                                  size="sm"
                                >
                                  <Edit className="sm:mr-1" />
                                  <span className="truncate">Edit</span>
                                </Button>
                                <Button onClick={() => handleAccept(app._id)} size="sm">
                                  <UserCheck className="sm:mr-1" />
                                  <span className="truncate">Accept</span>
                                </Button>
                                <Button
                                  onClick={() => {
                                    setSelectedApplication(app._id);
                                    setRejectDialogOpen(true);
                                  }}
                                  variant="destructive"
                                  size="sm"
                                >
                                  <UserX className="sm:mr-1" />
                                  <span className="truncate">Reject</span>
                                </Button>
                                <Button
                                  onClick={() => {
                                    setApplicationToDelete(app._id);
                                    setDeleteConfirmOpen(true);
                                  }}
                                  variant="destructive"
                                  size="sm"
                                >
                                  <Trash2 className="sm:mr-1" />
                                  <span className="truncate">Delete</span>
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    <TablePagination
                      page={applicationsPagination.page}
                      totalPages={applicationsPagination.totalPages}
                      totalCount={applicationsPagination.totalCount}
                      startIndex={applicationsPagination.startIndex}
                      endIndex={applicationsPagination.endIndex}
                      onPageChange={applicationsPagination.setPage}
                      itemLabel="applications"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          )}
          
          {/* Accepted Members Tab */}
          <TabsContent value="accepted">
            <Card className="p-0 sm:p-6">
              <CardHeader className="px-3 py-4 sm:px-6 sm:py-6">
                <CardTitle>Accepted Members</CardTitle>
                <CardDescription>
                  {acceptedMembers?.length || 0} accepted member(s)
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                {acceptedMembers === undefined ? (
                  <Skeleton className="h-96 w-full" />
                ) : acceptedMembers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No accepted members yet
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search members..."
                          value={acceptedSearch}
                          onChange={(e) => setAcceptedSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-2 shrink-0">
                          {mergeSelectedIds.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setMergeSelectedIds([])}
                            >
                              Clear ({mergeSelectedIds.length})
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!canOpenMergeDialog}
                            onClick={() => setMergeDialogOpen(true)}
                          >
                            <Users className="mr-1.5 h-3.5 w-3.5" />
                            Merge Selected
                            {mergeSelectedIds.length > 0 && (
                              <Badge variant="outline" className="ml-1.5 px-1.5 py-0 text-[10px] font-normal">
                                {mergeSelectedIds.length}/2
                              </Badge>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                    {activeTab === "accepted" && renderDiscordLookupAlert()}
                    {isAdmin && mergeSelectedIds.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Select two members to merge duplicate records (e.g. similar Discord names).
                      </p>
                    )}
                    <div className="overflow-x-auto">
                    {/* Desktop table */}
                    <Table className="hidden md:table [&_td]:py-1.5 [&_td]:px-2 [&_th]:py-1.5 [&_th]:px-2">
                      <TableHeader>
                        <TableRow>
                          {isAdmin && <TableHead className="w-10" />}
                          <SortableHeader 
                            label="Discord Username" 
                            field="discordUsername" 
                            currentSort={acceptedSort} 
                            onSort={() => setAcceptedSort(toggleSort(acceptedSort, "discordUsername"))} 
                          />
                          <SortableHeader 
                            label="Discord ID" 
                            field="discordUserId" 
                            currentSort={acceptedSort} 
                            onSort={() => setAcceptedSort(toggleSort(acceptedSort, "discordUserId"))} 
                          />
                          <SortableHeader 
                            label="Epic Username" 
                            field="epicUsername" 
                            currentSort={acceptedSort} 
                            onSort={() => setAcceptedSort(toggleSort(acceptedSort, "epicUsername"))} 
                          />
                          <SortableHeader 
                            label="Tier" 
                            field="tier" 
                            currentSort={acceptedSort} 
                            onSort={() => setAcceptedSort(toggleSort(acceptedSort, "tier"))} 
                          />
                          <SortableHeader 
                            label="Server Joined" 
                            field="serverJoinDate" 
                            currentSort={acceptedSort} 
                            onSort={() => setAcceptedSort(toggleSort(acceptedSort, "serverJoinDate"))} 
                          />
                          {isAdmin && <TableHead>Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(acceptedPagination.pageItems ?? []).map((member) => (
                          <TableRow
                            key={member._id}
                            className={`h-10 ${mergeSelectedIds.includes(member._id) ? "bg-muted/50" : ""}`}
                          >
                            {isAdmin && (
                              <TableCell>
                                <Checkbox
                                  checked={mergeSelectedIds.includes(member._id)}
                                  onCheckedChange={() => toggleMergeSelection(member._id)}
                                  aria-label={`Select ${member.discordUsername} for merge`}
                                />
                              </TableCell>
                            )}
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <PlayerProfileLink
                                  discordUsername={member.discordUsername}
                                  className="hover:underline text-primary"
                                >
                                  {member.discordUsername}
                                </PlayerProfileLink>
                                {member.femaleVerified && (
                                  <FemaleVerifiedBadge compact />
                                )}
                                {member.autoAcceptedByDiscordSync && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    Auto-accepted by Discord sync
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{member.discordUserId}</TableCell>
                            <TableCell>{member.epicUsername}</TableCell>
                            <TableCell>
                              {member.tier ? (
                                <div className="flex items-center gap-1.5">
                                  <Badge variant={
                                    member.tier === "S" ? "default" :
                                    member.tier === "A" ? "secondary" :
                                    "outline"
                                  }>
                                    {member.tier}
                                  </Badge>
                                  {(() => {
                                    const mismatch = getTierMismatch(member);
                                    if (mismatch.status === "correct" || mismatch.status === "no_tier") return null;
                                    return (
                                      <Badge
                                        variant={mismatch.status === "wrong_role" ? "destructive" : "secondary"}
                                        className="gap-0.5 text-xs"
                                      >
                                        <ShieldAlert className="h-3 w-3" />
                                        {mismatch.status === "wrong_role"
                                          ? `DC: ${mismatch.discordTiers.join(",")}`
                                          : mismatch.status === "multiple_roles"
                                            ? `DC: ${mismatch.discordTiers.join(",")}`
                                            : "No DC role"}
                                      </Badge>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {format(new Date(member.serverJoinDate), "MMM d, yyyy")}
                            </TableCell>
                            {isAdmin && (
                            <TableCell>
                              <div className="flex flex-nowrap gap-1">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setEditingPlayerId(member._id)}
                                  className="px-2 h-7 text-xs"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setEvaluatingPlayerId(member._id)}
                                  className="px-2 h-7 text-xs"
                                >
                                  <Award className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setEditingMemberId(member._id)}
                                  className="px-2 h-7 text-xs whitespace-nowrap"
                                >
                                  Status
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setPlayerToDelete(member._id);
                                    setPlayerDeleteConfirmOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                    {/* Mobile list */}
                    <div className="md:hidden divide-y">
                      {(acceptedPagination.pageItems ?? []).map((member) => (
                        <div
                          key={member._id}
                          className={`py-2 flex items-center justify-between gap-2 ${mergeSelectedIds.includes(member._id) ? "bg-muted/50 -mx-3 px-3" : ""}`}
                        >
                          {isAdmin && (
                            <Checkbox
                              checked={mergeSelectedIds.includes(member._id)}
                              onCheckedChange={() => toggleMergeSelection(member._id)}
                              aria-label={`Select ${member.discordUsername} for merge`}
                              className="shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <PlayerProfileLink
                                discordUsername={member.discordUsername}
                                className="hover:underline text-primary text-sm font-medium truncate block"
                              >
                                {member.discordUsername}
                              </PlayerProfileLink>
                              {member.femaleVerified && (
                                <FemaleVerifiedBadge compact />
                              )}
                              {member.autoAcceptedByDiscordSync && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Auto</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span className="truncate">{member.epicUsername}</span>
                              {member.tier && (
                                <Badge variant={
                                  member.tier === "S" ? "default" :
                                  member.tier === "A" ? "secondary" :
                                  "outline"
                                } className="text-xs px-1.5 py-0">
                                  {member.tier}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant="secondary" onClick={() => setEditingPlayerId(member._id)} className="px-2 h-7">
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => setEvaluatingPlayerId(member._id)} className="px-2 h-7">
                                <Award className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => { setPlayerToDelete(member._id); setPlayerDeleteConfirmOpen(true); }} className="px-2 h-7">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <TablePagination
                      page={acceptedPagination.page}
                      totalPages={acceptedPagination.totalPages}
                      totalCount={acceptedPagination.totalCount}
                      startIndex={acceptedPagination.startIndex}
                      endIndex={acceptedPagination.endIndex}
                      onPageChange={acceptedPagination.setPage}
                      itemLabel="members"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Discord Members Tab - Admin Only */}
          {isAdmin && (
            <TabsContent value="discord">
            <Alert className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Evaluation queue only</AlertTitle>
              <AlertDescription>
                For the full Discord member directory, role management, and ID tools, use{" "}
                <Link to="/admin/discord-members" className="font-medium text-primary underline-offset-4 hover:underline">
                  Discord Directory
                </Link>
                .
              </AlertDescription>
            </Alert>
            <Card className="p-0 sm:p-6">
              <CardHeader className="px-3 py-4 sm:px-6 sm:py-6">
                <CardTitle>Discord Evaluation Queue</CardTitle>
                <CardDescription>
                  {discordMembers?.length || 0} Discord member(s) synced but not yet evaluated
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                {discordMembers === undefined ? (
                  <Skeleton className="h-96 w-full" />
                ) : discordMembers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No Discord-only members (all members have been evaluated)
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      These members were synced from Discord but haven't been evaluated yet. 
                      To evaluate them, submit an application through the Application Form tab.
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search Discord members..."
                        value={discordSearch}
                        onChange={(e) => setDiscordSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    {activeTab === "discord" && renderDiscordLookupAlert()}
                    <div className="overflow-x-auto">
                    <Table className="hidden md:table [&_td]:py-1.5 [&_td]:px-2 [&_th]:py-1.5 [&_th]:px-2">
                      <TableHeader>
                        <TableRow>
                          <SortableHeader 
                            label="Discord Username" 
                            field="discordUsername" 
                            currentSort={discordSort} 
                            onSort={() => setDiscordSort(toggleSort(discordSort, "discordUsername"))} 
                          />
                          <SortableHeader 
                            label="Discord ID" 
                            field="discordUserId" 
                            currentSort={discordSort} 
                            onSort={() => setDiscordSort(toggleSort(discordSort, "discordUserId"))} 
                          />
                          <SortableHeader 
                            label="Epic Username" 
                            field="epicUsername" 
                            currentSort={discordSort} 
                            onSort={() => setDiscordSort(toggleSort(discordSort, "epicUsername"))} 
                          />
                          <SortableHeader 
                            label="Server Join Date" 
                            field="serverJoinDate" 
                            currentSort={discordSort} 
                            onSort={() => setDiscordSort(toggleSort(discordSort, "serverJoinDate"))} 
                          />
                          <SortableHeader 
                            label="Tier" 
                            field="tier" 
                            currentSort={discordSort} 
                            onSort={() => setDiscordSort(toggleSort(discordSort, "tier"))} 
                          />
                          <SortableHeader 
                            label="Match Confidence" 
                            field="matchConfidence" 
                            currentSort={discordSort} 
                            onSort={() => setDiscordSort(toggleSort(discordSort, "matchConfidence"))} 
                          />
                          {isAdmin && <TableHead>Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(discordPagination.pageItems ?? []).map((member) => (
                          <TableRow key={member._id} className="h-10">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <PlayerProfileLink
                                  discordUsername={member.discordUsername}
                                  className="hover:underline text-primary"
                                >
                                  {member.discordUsername}
                                </PlayerProfileLink>
                                {member.femaleVerified && (
                                  <FemaleVerifiedBadge compact />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{member.discordUserId}</TableCell>
                            <TableCell>{member.epicUsername}</TableCell>
                            <TableCell>
                              {format(new Date(member.serverJoinDate), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                              {member.tier ? (
                                <Badge variant={
                                  member.tier === "S" ? "default" :
                                  member.tier === "A" ? "secondary" :
                                  "outline"
                                }>
                                  {member.tier}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {member.matchConfidence && (
                                <Badge variant={
                                  member.matchConfidence === "exact" ? "default" :
                                  member.matchConfidence === "username" ? "secondary" :
                                  member.matchConfidence === "fuzzy" ? "outline" :
                                  "outline"
                                }>
                                  {member.matchConfidence}
                                </Badge>
                              )}
                            </TableCell>
                            {isAdmin && (
                            <TableCell>
                              <div className="flex flex-nowrap gap-1">
                                <Button
                                  size="sm"
                                  onClick={() => handleEvaluateDiscordMember(member._id)}
                                  disabled={convertingPlayerId === member._id}
                                  className="cursor-pointer"
                                >
                                  {convertingPlayerId === member._id ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <UserCheck className="h-3 w-3 mr-1" />
                                  )}
                                  Evaluate
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setPlayerToDelete(member._id);
                                    setPlayerDeleteConfirmOpen(true);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                    {/* Mobile list */}
                    <div className="md:hidden divide-y">
                      {(discordPagination.pageItems ?? []).map((member) => (
                        <div key={member._id} className="py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <PlayerProfileLink
                                discordUsername={member.discordUsername}
                                className="hover:underline text-primary text-sm font-medium truncate block"
                              >
                                {member.discordUsername}
                              </PlayerProfileLink>
                              {member.femaleVerified && (
                                <FemaleVerifiedBadge compact />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span className="truncate">{member.epicUsername}</span>
                              {member.tier && (
                                <Badge variant={
                                  member.tier === "S" ? "default" :
                                  member.tier === "A" ? "secondary" :
                                  "outline"
                                } className="text-xs px-1.5 py-0">
                                  {member.tier}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" onClick={() => handleEvaluateDiscordMember(member._id)} disabled={convertingPlayerId === member._id} className="px-2 h-7">
                                {convertingPlayerId === member._id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => { setPlayerToDelete(member._id); setPlayerDeleteConfirmOpen(true); }} className="px-2 h-7">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <TablePagination
                      page={discordPagination.page}
                      totalPages={discordPagination.totalPages}
                      totalCount={discordPagination.totalCount}
                      startIndex={discordPagination.startIndex}
                      endIndex={discordPagination.endIndex}
                      onPageChange={discordPagination.setPage}
                      itemLabel="members"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          )}
          
          {/* Rejected Members Tab - Admin Only */}
          {isAdmin && (
            <TabsContent value="rejected">
            <Card className="p-0 sm:p-6">
              <CardHeader className="px-3 py-4 sm:px-6 sm:py-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>Rejected Applications</CardTitle>
                    <CardDescription>
                      {rejectedMembers?.length || 0} rejected application(s)
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportRejectedCsv}
                    disabled={!rejectedMembers || rejectedMembers.length === 0}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                {rejectedMembers === undefined ? (
                  <Skeleton className="h-96 w-full" />
                ) : rejectedMembers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No rejected applications
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search rejected applications..."
                        value={rejectedSearch}
                        onChange={(e) => setRejectedSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    {activeTab === "rejected" && renderDiscordLookupAlert()}
                    <div className="overflow-x-auto">
                    <Table className="hidden md:table [&_td]:py-1.5 [&_td]:px-2 [&_th]:py-1.5 [&_th]:px-2">
                      <TableHeader>
                        <TableRow>
                          <SortableHeader 
                            label="Discord Username" 
                            field="discordUsername" 
                            currentSort={rejectedSort} 
                            onSort={() => setRejectedSort(toggleSort(rejectedSort, "discordUsername"))} 
                          />
                          <SortableHeader 
                            label="Discord ID" 
                            field="discordUserId" 
                            currentSort={rejectedSort} 
                            onSort={() => setRejectedSort(toggleSort(rejectedSort, "discordUserId"))} 
                          />
                          <TableHead>Rejection Reason</TableHead>
                          <SortableHeader 
                            label="Date Rejected" 
                            field="_creationTime" 
                            currentSort={rejectedSort} 
                            onSort={() => setRejectedSort(toggleSort(rejectedSort, "_creationTime"))} 
                          />
                          {isAdmin && <TableHead>Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(rejectedPagination.pageItems ?? []).map((member) => (
                          <TableRow key={member._id} className="h-10">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <PlayerProfileLink
                                  discordUsername={member.discordUsername}
                                  className="hover:underline text-primary"
                                >
                                  {member.discordUsername}
                                </PlayerProfileLink>
                                {member.femaleVerified && (
                                  <FemaleVerifiedBadge compact />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{member.discordUserId}</TableCell>
                            <TableCell className="max-w-md truncate">
                              {member.rejectionReason || "No reason provided"}
                            </TableCell>
                            <TableCell>
                              {format(new Date(member._creationTime), "MMM d, yyyy")}
                            </TableCell>
                            {isAdmin && (
                            <TableCell>
                              <div className="flex flex-nowrap gap-1">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setEditingMemberId(member._id)}
                                >
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit Status
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setPlayerToDelete(member._id);
                                    setPlayerDeleteConfirmOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                    {/* Mobile list */}
                    <div className="md:hidden divide-y">
                      {(rejectedPagination.pageItems ?? []).map((member) => (
                        <div key={member._id} className="py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <PlayerProfileLink
                                discordUsername={member.discordUsername}
                                className="hover:underline text-primary text-sm font-medium truncate block"
                              >
                                {member.discordUsername}
                              </PlayerProfileLink>
                              {member.femaleVerified && (
                                <FemaleVerifiedBadge compact />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {member.rejectionReason || "No reason provided"}
                            </p>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant="secondary" onClick={() => setEditingMemberId(member._id)} className="px-2 h-7">
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => { setPlayerToDelete(member._id); setPlayerDeleteConfirmOpen(true); }} className="px-2 h-7">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <TablePagination
                      page={rejectedPagination.page}
                      totalPages={rejectedPagination.totalPages}
                      totalCount={rejectedPagination.totalCount}
                      startIndex={rejectedPagination.startIndex}
                      endIndex={rejectedPagination.endIndex}
                      onPageChange={rejectedPagination.setPage}
                      itemLabel="applications"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          )}
          
          {/* Former Members Tab */}
          <TabsContent value="former">
            <Card className="p-0 sm:p-6">
              <CardHeader className="px-3 py-4 sm:px-6 sm:py-6">
                <CardTitle>Former Members</CardTitle>
                <CardDescription>
                  {formerMembers?.length || 0} former member(s). Members highlighted in red were automatically archived when they left the Discord server.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                {formerMembers === undefined ? (
                  <Skeleton className="h-96 w-full" />
                ) : formerMembers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No former members
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search former members..."
                        value={formerSearch}
                        onChange={(e) => setFormerSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    {activeTab === "former" && renderDiscordLookupAlert()}
                    <div className="overflow-x-auto">
                    <Table className="hidden md:table [&_td]:py-1.5 [&_td]:px-2 [&_th]:py-1.5 [&_th]:px-2">
                      <TableHeader>
                        <TableRow>
                          <SortableHeader 
                            label="Discord Username" 
                            field="discordUsername" 
                            currentSort={formerSort} 
                            onSort={() => setFormerSort(toggleSort(formerSort, "discordUsername"))} 
                          />
                          <SortableHeader 
                            label="Discord ID" 
                            field="discordUserId" 
                            currentSort={formerSort} 
                            onSort={() => setFormerSort(toggleSort(formerSort, "discordUserId"))} 
                          />
                          <SortableHeader 
                            label="Epic Username" 
                            field="epicUsername" 
                            currentSort={formerSort} 
                            onSort={() => setFormerSort(toggleSort(formerSort, "epicUsername"))} 
                          />
                          <SortableHeader 
                            label="Archive Reason" 
                            field="archiveReason" 
                            currentSort={formerSort} 
                            onSort={() => setFormerSort(toggleSort(formerSort, "archiveReason"))} 
                          />
                          {isAdmin && <TableHead>Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(formerPagination.pageItems ?? []).map((member) => (
                          <TableRow 
                            key={member._id}
                            className={`h-10 ${member.hasLeftServer ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <PlayerProfileLink
                                  discordUsername={member.discordUsername}
                                  className="hover:underline text-primary"
                                >
                                  {member.discordUsername}
                                </PlayerProfileLink>
                                {member.femaleVerified && (
                                  <FemaleVerifiedBadge compact />
                                )}
                                {member.hasLeftServer && (
                                  <Badge variant="destructive" className="text-xs">
                                    Auto-Archived
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{member.discordUserId}</TableCell>
                            <TableCell>{member.epicUsername}</TableCell>
                            <TableCell>
                              {member.archiveReason && (
                                <Badge variant="outline">
                                  <UserMinus className="mr-1 h-3 w-3" />
                                  {member.archiveReason}
                                </Badge>
                              )}
                            </TableCell>
                            {isAdmin && (
                            <TableCell>
                              <div className="flex flex-nowrap gap-1">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setEditingMemberId(member._id)}
                                >
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit Status
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setPlayerToDelete(member._id);
                                    setPlayerDeleteConfirmOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                    {/* Mobile list */}
                    <div className="md:hidden divide-y">
                      {(formerPagination.pageItems ?? []).map((member) => (
                        <div key={member._id} className={`py-2 flex items-center justify-between gap-2 ${member.hasLeftServer ? "bg-red-50 dark:bg-red-950/20 -mx-3 px-3 rounded" : ""}`}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <PlayerProfileLink
                                discordUsername={member.discordUsername}
                                className="hover:underline text-primary text-sm font-medium truncate"
                              >
                                {member.discordUsername}
                              </PlayerProfileLink>
                              {member.femaleVerified && (
                                <FemaleVerifiedBadge compact />
                              )}
                              {member.hasLeftServer && (
                                <Badge variant="destructive" className="text-xs px-1.5 py-0">Left</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <span className="truncate">{member.epicUsername}</span>
                              {member.archiveReason && (
                                <span className="truncate">{member.archiveReason}</span>
                              )}
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant="secondary" onClick={() => setEditingMemberId(member._id)} className="px-2 h-7">
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => { setPlayerToDelete(member._id); setPlayerDeleteConfirmOpen(true); }} className="px-2 h-7">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <TablePagination
                      page={formerPagination.page}
                      totalPages={formerPagination.totalPages}
                      totalCount={formerPagination.totalCount}
                      startIndex={formerPagination.startIndex}
                      endIndex={formerPagination.endIndex}
                      onPageChange={formerPagination.setPage}
                      itemLabel="members"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="big-reeval">
              <BigSummerReEvalDashboard />
            </TabsContent>
          )}
        </Tabs>
        
        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>Reject Application</DialogTitle>
              <DialogDescription>
                Please select a reason for rejecting this application
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Rejection Reason *</Label>
                <Select value={rejectionReason} onValueChange={setRejectionReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Incomplete Application">Incomplete Application</SelectItem>
                    <SelectItem value="Previously Rejected">Previously Rejected</SelectItem>
                    <SelectItem value="Information mismatch">Information mismatch</SelectItem>
                    <SelectItem value="Sus clips/behaviour elsewhere">Sus clips/behaviour elsewhere</SelectItem>
                    <SelectItem value="Unsure if legitimate account">Unsure if legitimate account</SelectItem>
                    <SelectItem value="Too good">Too good</SelectItem>
                    <SelectItem value="Lied in app">Lied in app</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleReject}>
                Reject Application
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Score Player Dialog */}
        {evaluatingPlayerId && (
          <ScorePlayerDialog
            open={!!evaluatingPlayerId}
            onOpenChange={(open) => !open && setEvaluatingPlayerId(null)}
            playerId={evaluatingPlayerId}
          />
        )}
        
        {/* Edit Player Dialog */}
        {editingPlayerId && (
          <EditPlayerDialog
            open={!!editingPlayerId}
            onOpenChange={(open) => !open && setEditingPlayerId(null)}
            playerId={editingPlayerId}
          />
        )}
        
        {/* Edit Member Status Dialog */}
        {editingMemberId && (
          <EditMemberStatusDialog
            open={!!editingMemberId}
            onOpenChange={(open) => !open && setEditingMemberId(null)}
            playerId={editingMemberId}
          />
        )}
        
        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>Delete Application</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this application? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteApplication}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Player Delete Confirmation Dialog */}
        <Dialog open={playerDeleteConfirmOpen} onOpenChange={setPlayerDeleteConfirmOpen}>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>Delete Player</DialogTitle>
              <DialogDescription className="space-y-2">
                <p className="font-semibold text-destructive">⚠️ Warning: This action cannot be undone!</p>
                <p>
                  This will permanently delete the player and ALL associated data including:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Player profile and personal information</li>
                  <li>All evaluation scores and tier history</li>
                  <li>All match statistics and performance data</li>
                  <li>All earnings records</li>
                  <li>All applications and status history</li>
                  <li>All cached calculations and stats</li>
                </ul>
                <p className="mt-2">Are you absolutely sure you want to proceed?</p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPlayerDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeletePlayer}>
                Yes, Delete Everything
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {isAdmin && (
          <>
            <EditApplicationDialog
              application={editingApplicationId ? (pendingApplications?.find(a => a._id === editingApplicationId) ?? null) : null}
              onClose={() => setEditingApplicationId(null)}
            />
            <NewApplicationDialog
              open={newAppDialogOpen}
              onOpenChange={setNewAppDialogOpen}
            />
          </>
        )}

        {isAdmin && canOpenMergeDialog && mergePair && (
          <MergeMembersDialog
            open={mergeDialogOpen}
            onOpenChange={setMergeDialogOpen}
            playerIds={[mergePair[0]._id, mergePair[1]._id]}
            onMerged={() => setMergeSelectedIds([])}
          />
        )}
    </AdminPageLayout>
  );
}
