import { useState } from "react";
import { useClientPagination } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Users, Trophy, ArrowUpDown, Filter, ChevronDown } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Link } from "react-router-dom";
import PageShell from "@/components/page-shell.tsx";
import PageHeader from "@/components/page-header.tsx";
import PageToolbar from "@/components/page-toolbar.tsx";
import FemaleVerifiedBadge from "@/components/female-verified-badge.tsx";
import SearchInput from "@/components/search-input.tsx";
import StatCard from "@/components/stat-card.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible.tsx";
import { compareTierField, DEFAULT_PLAYER_LIST_SORT } from "@/lib/tier-sort.ts";

export default function Index() {
  const { isAdmin, isModeratorOrAdmin } = useUserRole();
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" }>(
    DEFAULT_PLAYER_LIST_SORT,
  );
  
  const directory = useQuery(api.memberManagement.getPublicMemberDirectory);
  const acceptedMembers = directory?.available ? directory.members : undefined;

  const filteredMembers = acceptedMembers?.filter((member) => {
    const searchLower = search.toLowerCase();
    const matchesSearch = (
      member.discordUsername?.toLowerCase().includes(searchLower) ||
      member.epicUsername?.toLowerCase().includes(searchLower) ||
      member.nickname?.toLowerCase().includes(searchLower)
    );
    
    const matchesGender = genderFilter === "all" 
      || (genderFilter === "male" && member.gender === 100)
      || (genderFilter === "female" && member.gender === 50);
    
    const matchesTier = tierFilter === "all" || member.tier === tierFilter;
    
    const matchesStatus = statusFilter === "all"
      || (statusFilter === "active" && member.isActive)
      || (statusFilter === "inactive" && !member.isActive);
    
    return matchesSearch && matchesGender && matchesTier && matchesStatus;
  });
  
  const sortedMembers = filteredMembers?.sort((a, b) => {
    let aVal: string | number = "";
    let bVal: string | number = "";
    
    switch (sort.field) {
      case "discordUsername":
        aVal = a.discordUsername || "";
        bVal = b.discordUsername || "";
        break;
      case "epicUsername":
        aVal = a.epicUsername || "";
        bVal = b.epicUsername || "";
        break;
      case "tier": {
        const tierCmp = compareTierField(a.tier, b.tier, sort.direction);
        if (tierCmp !== 0) return tierCmp;
        return (a.discordUsername || "").localeCompare(b.discordUsername || "");
      }
      case "totalScore":
        aVal = a.totalScore || 0;
        bVal = b.totalScore || 0;
        break;
    }
    
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sort.direction === "asc" 
        ? aVal.localeCompare(bVal) 
        : bVal.localeCompare(aVal);
    }
    
    const numA = typeof aVal === "number" ? aVal : 0;
    const numB = typeof bVal === "number" ? bVal : 0;
    return sort.direction === "asc" ? numA - numB : numB - numA;
  });
  
  const handleSort = (field: string) => {
    setSort((prev) => ({
      field,
      direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const membersPagination = useClientPagination(sortedMembers, {
    resetDeps: [search, genderFilter, tierFilter, statusFilter, sort],
  });
  const displayedMembers = membersPagination.pageItems ?? [];

  const activeFilterCount = [
    genderFilter !== "all",
    tierFilter !== "all",
    statusFilter !== "all",
    search.length > 0,
  ].filter(Boolean).length;

  const memberFilters = (
    <>
      <Select value={genderFilter} onValueChange={setGenderFilter}>
        <SelectTrigger size="sm" className="w-full px-2 text-xs md:w-28 md:text-sm">
          <SelectValue placeholder="Gender" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="male">Male</SelectItem>
          <SelectItem value="female">Female</SelectItem>
        </SelectContent>
      </Select>
      <Select value={tierFilter} onValueChange={setTierFilter}>
        <SelectTrigger size="sm" className="w-full px-2 text-xs md:w-28 md:text-sm">
          <SelectValue placeholder="Tier" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Tiers</SelectItem>
          <SelectItem value="S">S</SelectItem>
          <SelectItem value="A">A</SelectItem>
          <SelectItem value="B">B</SelectItem>
          <SelectItem value="C">C</SelectItem>
        </SelectContent>
      </Select>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger size="sm" className="w-full px-2 text-xs md:w-28 md:text-sm">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
      <SearchInput
        placeholder="Search members..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 pl-8 text-sm"
        containerClassName="col-span-2 w-full md:col-span-1 md:w-52"
      />
    </>
  );
  
  if (directory === undefined) {
    return (
      <PageShell>
        <Skeleton className="h-64 w-full" />
      </PageShell>
    );
  }

  if (!directory.available) {
    return (
      <PageShell>
        <PageHeader
          title="Members"
          icon={Users}
          description="Member directory is temporarily unavailable."
        />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>Directory cache not built</EmptyTitle>
            <EmptyDescription>
              {isModeratorOrAdmin
                ? directory.message
                : "Please check back later."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </PageShell>
    );
  }
  
  return (
    <PageShell>
      <PageHeader
        title="Members"
        icon={Users}
        description="All ZBD competitive players. Active = played in the last 6 weeks."
      />

      {isAdmin && directory.available && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Total Members" value={directory.members.length} icon={Users} />
          <StatCard
            label="S-Tier Players"
            value={directory.members.filter((m) => m.tier === "S").length}
            icon={Trophy}
            variant="primary"
          />
          <StatCard
            label="A-Tier Players"
            value={directory.members.filter((m) => m.tier === "A").length}
            icon={Trophy}
          />
        </div>
      )}

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-3 py-2 sm:px-4 md:px-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <CardTitle>Active Members</CardTitle>
            <div className="md:hidden">
              <Collapsible defaultOpen={activeFilterCount > 0}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 w-full justify-between px-2 text-sm touch-manipulation"
                  >
                    <span className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      Filters
                      {activeFilterCount > 0 && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                          {activeFilterCount}
                        </Badge>
                      )}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-60" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <PageToolbar className="mt-1.5 grid w-full grid-cols-2 gap-1.5">
                    {memberFilters}
                  </PageToolbar>
                </CollapsibleContent>
              </Collapsible>
            </div>
            <PageToolbar className="hidden w-full gap-1.5 md:flex md:w-auto md:gap-1.5">
              {memberFilters}
            </PageToolbar>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {sortedMembers && sortedMembers.length > 0 ? (
            <>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("discordUsername")}
                    >
                      <div className="flex items-center gap-1">
                        Discord
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("epicUsername")}
                    >
                      <div className="flex items-center gap-1">
                        Epic
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort("tier")}
                    >
                      <div className="flex items-center gap-1">
                        Tier
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && (
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 text-right"
                        onClick={() => handleSort("totalScore")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Score
                          <ArrowUpDown className="h-3 w-3" />
                        </div>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedMembers.map((member) => (
                    <TableRow key={member._id}>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          {isAdmin ? (
                            <Link 
                              to={`/player/${member.discordUsername}`}
                              className="hover:underline font-medium cursor-pointer"
                            >
                              {member.nickname || member.discordUsername}
                            </Link>
                          ) : (
                            <span className="font-medium">
                              {member.nickname || member.discordUsername}
                            </span>
                          )}
                          {member.femaleVerified && (
                            <FemaleVerifiedBadge compact />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {member.epicUsername || "—"}
                      </TableCell>
                      <TableCell>
                        {member.tier ? (
                          <Badge 
                            variant={
                              member.tier === "S" ? "default" : 
                              member.tier === "A" ? "secondary" : 
                              "outline"
                            }
                          >
                            {member.tier}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.isActive ? "default" : "destructive"}>
                          {member.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right font-medium tabular-nums">
                          {member.totalScore?.toFixed(2) || "0.00"}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-y md:hidden">
              {displayedMembers.map((member) => (
                <div key={member._id} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isAdmin ? (
                        <Link
                          to={`/player/${member.discordUsername}`}
                          className="truncate text-sm font-medium text-primary hover:underline"
                        >
                          {member.nickname || member.discordUsername}
                        </Link>
                      ) : (
                        <span className="truncate text-sm font-medium">
                          {member.nickname || member.discordUsername}
                        </span>
                      )}
                      {member.femaleVerified && <FemaleVerifiedBadge compact />}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {member.epicUsername && member.epicUsername !== member.discordUsername && (
                        <span className="truncate">{member.epicUsername}</span>
                      )}
                      {member.tier && (
                        <Badge
                          variant={
                            member.tier === "S"
                              ? "default"
                              : member.tier === "A"
                                ? "secondary"
                                : "outline"
                          }
                          className="px-1.5 py-0 text-xs"
                        >
                          {member.tier}
                        </Badge>
                      )}
                      <Badge
                        variant={member.isActive ? "default" : "destructive"}
                        className="px-1.5 py-0 text-xs"
                      >
                        {member.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {isAdmin && (
                        <span className="tabular-nums">
                          {member.totalScore?.toFixed(2) || "0.00"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 pb-4 sm:px-4">
              <TablePagination
                page={membersPagination.page}
                totalPages={membersPagination.totalPages}
                totalCount={membersPagination.totalCount}
                startIndex={membersPagination.startIndex}
                endIndex={membersPagination.endIndex}
                onPageChange={membersPagination.setPage}
                itemLabel="members"
              />
            </div>
            </>
          ) : (
            <div className="p-4">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Users />
                  </EmptyMedia>
                  <EmptyTitle>No members found</EmptyTitle>
                  <EmptyDescription>
                    {search || genderFilter !== "all" || tierFilter !== "all" || statusFilter !== "all"
                      ? "Try adjusting your filters" 
                      : "No active members yet"}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </CardContent>
      </Card>

      {isModeratorOrAdmin && (
        <div className="text-center">
          <Link 
            to="/admin/member-management"
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Go to Admin Member Management →
          </Link>
        </div>
      )}
    </PageShell>
  );
}
