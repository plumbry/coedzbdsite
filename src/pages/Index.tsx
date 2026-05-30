import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Search, Users, Trophy, ArrowUpDown } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Link } from "react-router-dom";
import SiteHeader from "@/components/site-header.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";

export default function Index() {
  const { isAdmin, isModeratorOrAdmin } = useUserRole();
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" }>({ 
    field: "discordUsername", 
    direction: "asc" 
  });
  
  const acceptedMembers = useQuery(api.memberManagement.getAcceptedMembers);
  
  // Filter members
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
  
  // Sort members
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
      case "tier":
        aVal = a.tier || "Z";
        bVal = b.tier || "Z";
        break;
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
  
  if (acceptedMembers === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="container mx-auto px-2 py-4 sm:p-4 md:p-6 space-y-6">
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      
      <div className="container mx-auto px-2 py-4 sm:p-4 md:p-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-2">
            <Users className="h-8 w-8" />
            Members
          </h1>
          <p className="text-muted-foreground">
            All ZBD competitive players. Active = played in the last 6 weeks.
          </p>
        </div>
        
        {/* Stats Cards - Admin Only */}
        {isAdmin && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Members</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{acceptedMembers.length}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">S-Tier Players</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {acceptedMembers.filter((m) => m.tier === "S").length}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">A-Tier Players</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {acceptedMembers.filter((m) => m.tier === "A").length}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Member List */}
        <Card className="p-0 sm:p-6">
          <CardHeader className="px-3 py-4 sm:px-6 sm:py-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <CardTitle>Active Members</CardTitle>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Select value={genderFilter} onValueChange={setGenderFilter}>
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue placeholder="Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger className="w-full sm:w-32">
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
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search members..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            {sortedMembers && sortedMembers.length > 0 ? (
              <div className="overflow-x-auto">
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
                      <TableHead>
                        <div className="flex items-center gap-1">
                          Status
                        </div>
                      </TableHead>
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
                    {sortedMembers.map((member) => (
                      <TableRow key={member._id}>
                        <TableCell>
                          {isModeratorOrAdmin ? (
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
                          <TableCell className="text-right font-medium">
                            {member.totalScore?.toFixed(2) || "0.00"}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
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
            )}
          </CardContent>
        </Card>
        
        {/* Admin Link */}
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
      </div>
    </div>
  );
}
