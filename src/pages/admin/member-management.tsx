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
import { UserCheck, UserX, UserMinus, Loader2, ExternalLink, AlertTriangle, Edit, Award, ArrowUpDown, Search, Trash2, ShieldAlert, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Link, useSearchParams, useParams, useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/use-user-role.ts";
import ScorePlayerDialog from "../_components/score-player-dialog.tsx";
import EditPlayerDialog from "./_components/edit-player-dialog.tsx";
import EditMemberStatusDialog from "../_components/edit-member-status-dialog.tsx";
import NewApplicationDialog from "./_components/new-application-dialog.tsx";
import EditApplicationDialog from "./_components/edit-application-dialog.tsx";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";

export default function MemberManagement() {
  const { user, isAdmin, isModeratorOrAdmin, isLoading: isRoleLoading } = useUserRole();
  const isAuthenticated = !!user;
  const [searchParams] = useSearchParams();
  const { tab: tabFromPath } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("accepted");
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
      const adminTabs = ["applications", "accepted", "rejected", "former", "discord"];
      const publicTabs = ["accepted", "former"];
      if (tab === "discord" && isAdmin) {
        setActiveTab("discord");
      } else if (tab && (isAdmin ? adminTabs : publicTabs).includes(tab)) {
        setActiveTab(tab);
      } else if (isAdmin) {
        setActiveTab("applications");
      }
    }
  }, [isRoleLoading, isAdmin, roleResolved, searchParams, tabFromPath]);
  
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
  const [isSyncingDiscordMembers, setIsSyncingDiscordMembers] = useState(false);
  
  // Search state
  const [acceptedSearch, setAcceptedSearch] = useState("");
  const [discordSearch, setDiscordSearch] = useState("");
  const [rejectedSearch, setRejectedSearch] = useState("");
  const [formerSearch, setFormerSearch] = useState("");
  
  // Sorting state
  const [acceptedSort, setAcceptedSort] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "discordUsername", direction: "asc" });
  const [discordSort, setDiscordSort] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "discordUsername", direction: "asc" });
  const [rejectedSort, setRejectedSort] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "_creationTime", direction: "desc" });
  const [formerSort, setFormerSort] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "discordUsername", direction: "asc" });
  
  // Queries — only fire when authenticated
  const pendingApplications = useQuery(
    api.memberManagement.getPendingApplications,
    isAdmin && activeTab === "applications" ? {} : "skip",
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
  const syncDiscordMembers = useAction(api.discord.sync.syncDiscordMembers);
  const [convertingPlayerId, setConvertingPlayerId] = useState<Id<"players"> | null>(null);
  
  // Redirect non-admins to "Accepted" tab
  if (!isAdmin && activeTab !== "accepted" && activeTab !== "former") {
    setActiveTab("accepted");
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

  const handleSyncDiscordMembers = async () => {
    setIsSyncingDiscordMembers(true);
    try {
      const result = await syncDiscordMembers();
      toast.success(
        `Discord sync complete: ${result.totalMembers} members processed, ${result.added} added, ${result.updated} updated, ${result.archived} archived`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync Discord members");
    } finally {
      setIsSyncingDiscordMembers(false);
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
  
  // Filter helper
  const filterData = <T extends Record<string, unknown>>(data: T[], searchTerm: string): T[] => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((item) => {
      return Object.values(item).some((value) => {
        if (typeof value === "string") {
          return value.toLowerCase().includes(term);
        }
        return false;
      });
    });
  };
  
  // Apply sorting and filtering to data
  const sortedAcceptedMembers = acceptedMembers 
    ? filterData(sortData(acceptedMembers, acceptedSort.field, acceptedSort.direction), acceptedSearch)
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
  
  if (isRoleLoading) {
    return (
      <AdminPageLayout skipHeader authTitle="Sign in to access member management">
        <Skeleton className="h-9 w-64 mb-2" />
        <Skeleton className="h-5 w-80 mb-4" />
        <Skeleton className="h-10 w-full mb-4" />
        <Skeleton className="h-96 w-full" />
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Member Management"
      description="Manage member applications and status"
      authTitle="Sign in to access member management"
      showSidebar={!!isModeratorOrAdmin}
      header={{
        actions: isAdmin ? (
          <Button size="sm" variant="secondary" onClick={handleSyncDiscordMembers} disabled={isSyncingDiscordMembers}>
            {isSyncingDiscordMembers ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Sync Discord
          </Button>
        ) : undefined,
      }}
    >
      <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className={`inline-flex w-auto min-w-full md:grid md:w-full h-10 ${isAdmin ? "md:grid-cols-5" : "md:grid-cols-2"}`}>
              {isAdmin && <TabsTrigger value="applications" className="text-xs md:text-sm py-1.5 whitespace-nowrap">Applications</TabsTrigger>}
              <TabsTrigger value="accepted" className="text-xs md:text-sm py-1.5 whitespace-nowrap">Accepted</TabsTrigger>
              {isAdmin && <TabsTrigger value="rejected" className="text-xs md:text-sm py-1.5 whitespace-nowrap">Rejected</TabsTrigger>}
              <TabsTrigger value="former" className="text-xs md:text-sm py-1.5 whitespace-nowrap">Former</TabsTrigger>
              {isAdmin && <TabsTrigger value="discord" className="text-xs md:text-sm py-1.5 whitespace-nowrap">Discord</TabsTrigger>}
            </TabsList>
          </div>
          
          {/* Applications Tab - Admin Only */}
          {isAdmin && (
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
                  <Button onClick={() => setNewAppDialogOpen(true)} className="cursor-pointer w-full sm:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    New Application
                  </Button>
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
                                    Tier {app.evaluation.tier} - {app.evaluation.totalScore} pts
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
                            <div className="flex flex-wrap gap-1">
                              <Button
                                onClick={() => setEditingApplicationId(app._id)}
                                variant="secondary"
                                size="sm"
                                className="cursor-pointer px-2 h-7 text-xs"
                              >
                                <Edit className="mr-1 h-3 w-3" />
                                Edit
                              </Button>
                              <Button
                                onClick={() => handleAccept(app._id)}
                                size="sm"
                                className="cursor-pointer px-2 h-7 text-xs"
                              >
                                <UserCheck className="mr-1 h-3 w-3" />
                                Accept
                              </Button>
                              <Button
                                onClick={() => {
                                  setSelectedApplication(app._id);
                                  setRejectDialogOpen(true);
                                }}
                                variant="destructive"
                                size="sm"
                                className="cursor-pointer px-2 h-7 text-xs"
                              >
                                <UserX className="mr-1 h-3 w-3" />
                                Reject
                              </Button>
                              <Button
                                onClick={() => {
                                  setApplicationToDelete(app._id);
                                  setDeleteConfirmOpen(true);
                                }}
                                variant="destructive"
                                size="sm"
                                className="cursor-pointer px-2 h-7 text-xs"
                              >
                                <Trash2 className="mr-1 h-3 w-3" />
                                Delete
                              </Button>
                            </div>
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
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search members..."
                        value={acceptedSearch}
                        onChange={(e) => setAcceptedSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <div className="overflow-x-auto">
                    {/* Desktop table */}
                    <Table className="hidden md:table [&_td]:py-1.5 [&_td]:px-2 [&_th]:py-1.5 [&_th]:px-2">
                      <TableHeader>
                        <TableRow>
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
                          {isModeratorOrAdmin && <TableHead>Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(acceptedPagination.pageItems ?? []).map((member) => (
                          <TableRow key={member._id} className="h-10">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Link 
                                  to={`/player/${member.discordUsername}`}
                                  className="hover:underline text-primary"
                                >
                                  {member.discordUsername}
                                </Link>
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
                            {isModeratorOrAdmin && (
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
                        <div key={member._id} className="py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Link 
                                to={`/player/${member.discordUsername}`}
                                className="hover:underline text-primary text-sm font-medium truncate block"
                              >
                                {member.discordUsername}
                              </Link>
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
                          {isModeratorOrAdmin && (
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
                          {isModeratorOrAdmin && <TableHead>Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(discordPagination.pageItems ?? []).map((member) => (
                          <TableRow key={member._id} className="h-10">
                            <TableCell className="font-medium">
                              <Link 
                                to={`/player/${member.discordUsername}`}
                                className="hover:underline text-primary"
                              >
                                {member.discordUsername}
                              </Link>
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
                            {isModeratorOrAdmin && (
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
                            <Link 
                              to={`/player/${member.discordUsername}`}
                              className="hover:underline text-primary text-sm font-medium truncate block"
                            >
                              {member.discordUsername}
                            </Link>
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
                          {isModeratorOrAdmin && (
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
                <CardTitle>Rejected Applications</CardTitle>
                <CardDescription>
                  {rejectedMembers?.length || 0} rejected application(s)
                </CardDescription>
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
                          {isModeratorOrAdmin && <TableHead>Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(rejectedPagination.pageItems ?? []).map((member) => (
                          <TableRow key={member._id} className="h-10">
                            <TableCell className="font-medium">
                              <Link 
                                to={`/player/${member.discordUsername}`}
                                className="hover:underline text-primary"
                              >
                                {member.discordUsername}
                              </Link>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{member.discordUserId}</TableCell>
                            <TableCell className="max-w-md truncate">
                              {member.rejectionReason || "No reason provided"}
                            </TableCell>
                            <TableCell>
                              {format(new Date(member._creationTime), "MMM d, yyyy")}
                            </TableCell>
                            {isModeratorOrAdmin && (
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
                            <Link 
                              to={`/player/${member.discordUsername}`}
                              className="hover:underline text-primary text-sm font-medium truncate block"
                            >
                              {member.discordUsername}
                            </Link>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {member.rejectionReason || "No reason provided"}
                            </p>
                          </div>
                          {isModeratorOrAdmin && (
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
                          {isModeratorOrAdmin && <TableHead>Actions</TableHead>}
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
                                <Link 
                                  to={`/player/${member.discordUsername}`}
                                  className="hover:underline text-primary"
                                >
                                  {member.discordUsername}
                                </Link>
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
                            {isModeratorOrAdmin && (
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
                              <Link 
                                to={`/player/${member.discordUsername}`}
                                className="hover:underline text-primary text-sm font-medium truncate"
                              >
                                {member.discordUsername}
                              </Link>
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
                          {isModeratorOrAdmin && (
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
                  <li>All cached calculations and rankings</li>
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
        
        {/* Edit Application Dialog */}
        <EditApplicationDialog
          application={editingApplicationId ? (pendingApplications?.find(a => a._id === editingApplicationId) ?? null) : null}
          onClose={() => setEditingApplicationId(null)}
        />
        
        {/* New Application Dialog */}
        <NewApplicationDialog
          open={newAppDialogOpen}
          onOpenChange={setNewAppDialogOpen}
        />
    </AdminPageLayout>
  );
}
