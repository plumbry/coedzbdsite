import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { UserPlus, Search, Upload, CheckCircle, Archive, XCircle, ExternalLink, ArrowUpDown, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";
import SiteHeader from "@/components/site-header.tsx";
import AddPlayerDialog from "./add-player-dialog.tsx";
import ScorePlayerDialog from "./score-player-dialog.tsx";
import EditPlayerDialog from "./edit-player-dialog.tsx";
import ImportPlayersDialog from "./import-players-dialog.tsx";
import TeamComboCalculator from "./team-combo-calculator.tsx";

export default function PlayerList() {
  const { isAdmin, isModeratorOrAdmin } = useUserRole();
  const activePlayers = useQuery(api.players.getPlayers, {});
  const archivedPlayers = useQuery(api.players.getArchivedPlayers, {});
  const rejectedPlayers = useQuery(api.players.getRejectedPlayers, isAdmin ? {} : "skip");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("discord-asc");
  const [tierFilters, setTierFilters] = useState<Set<string>>(new Set());
  const [femaleVerifiedOnly, setFemaleVerifiedOnly] = useState(false);
  const [notFemaleVerified, setNotFemaleVerified] = useState(false);
  const [activeTab, setActiveTab] = useState("active");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Id<"players"> | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 75;
  
  if (activePlayers === undefined || archivedPlayers === undefined) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }
  
  const toggleTierFilter = (tier: string) => {
    const newFilters = new Set(tierFilters);
    if (newFilters.has(tier)) {
      newFilters.delete(tier);
    } else {
      newFilters.add(tier);
    }
    setTierFilters(newFilters);
  };
  
  const clearAllFilters = () => {
    setTierFilters(new Set());
    setFemaleVerifiedOnly(false);
    setNotFemaleVerified(false);
  };
  
  const filterAndSortPlayers = (playersList: typeof activePlayers) => {
    // First filter by search query
    let filtered = playersList.filter((player) => {
      const query = searchQuery.toLowerCase();
      return (
        player.discordUsername.toLowerCase().includes(query) ||
        player.epicUsername.toLowerCase().includes(query) ||
        player.nickname?.toLowerCase().includes(query)
      );
    });
    
    // Then filter by tier (if any tier filters are selected)
    if (tierFilters.size > 0) {
      filtered = filtered.filter((player) => player.tier && tierFilters.has(player.tier));
    }
    
    // Then filter by female verified status
    if (femaleVerifiedOnly) {
      filtered = filtered.filter((player) => player.femaleVerified === true);
    } else if (notFemaleVerified) {
      filtered = filtered.filter((player) => player.gender === 50 && player.femaleVerified === false);
    }
    
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
        case "tier-high": {
          const tierOrder = { S: 4, A: 3, B: 2, C: 1 };
          return (tierOrder[b.tier as keyof typeof tierOrder] || 0) - (tierOrder[a.tier as keyof typeof tierOrder] || 0);
        }
        case "tier-low": {
          const tierOrderLow = { S: 4, A: 3, B: 2, C: 1 };
          return (tierOrderLow[a.tier as keyof typeof tierOrderLow] || 0) - (tierOrderLow[b.tier as keyof typeof tierOrderLow] || 0);
        }
        case "score-high":
          return (b.totalScore || 0) - (a.totalScore || 0);
        case "score-low":
          return (a.totalScore || 0) - (b.totalScore || 0);
        case "joined-newest":
          return new Date(b.serverJoinDate).getTime() - new Date(a.serverJoinDate).getTime();
        case "joined-oldest":
          return new Date(a.serverJoinDate).getTime() - new Date(b.serverJoinDate).getTime();
        default:
          return 0;
      }
    });
    
    return sorted;
  };
  
  const filteredActivePlayers = filterAndSortPlayers(activePlayers);
  const filteredArchivedPlayers = filterAndSortPlayers(archivedPlayers);
  const filteredRejectedPlayers = rejectedPlayers ? filterAndSortPlayers(rejectedPlayers) : [];
  
  // Reset to page 1 when filters/sort/tab changes
  const resetPage = () => setCurrentPage(1);
  
  const paginatePlayers = (players: typeof filteredActivePlayers) => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return players.slice(startIndex, endIndex);
  };
  
  const getTotalPages = (totalItems: number) => Math.ceil(totalItems / ITEMS_PER_PAGE);
  
  const renderPagination = (totalItems: number) => {
    const totalPages = getTotalPages(totalItems);
    if (totalPages <= 1) return null;
    
    return (
      <div className="flex items-center justify-between px-4 py-3 border-t">
        <div className="text-sm text-muted-foreground">
          Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of {totalItems} players
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
  
  const renderPlayerTable = (players: typeof filteredActivePlayers, EmptyIcon: React.ComponentType<React.SVGProps<SVGSVGElement>>, emptyTitle: string, emptyDescription: string) => {
    const paginatedPlayers = paginatePlayers(players);
    return (
    <>
      {players.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><EmptyIcon /></EmptyMedia>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
          {activePlayers.length === 0 && activeTab === "active" && (
            <EmptyContent>
              <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Player
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Discord Username</TableHead>
                  <TableHead>Epic Username</TableHead>
                  <TableHead>Nickname</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Links</TableHead>
                  {activeTab === "archived" && isModeratorOrAdmin && <TableHead>Archive Reason</TableHead>}
                  {activeTab === "rejected" && isModeratorOrAdmin && <TableHead>Reject Reason</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPlayers.map((player) => (
                  <TableRow key={player._id}>
                    <TableCell className="font-medium pl-6">{player.discordUsername}</TableCell>
                    <TableCell>{player.epicUsername}</TableCell>
                    <TableCell>
                      {player.nickname ? (
                        <span className="text-muted-foreground">"{player.nickname}"</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {player.tier ? (
                        <Badge
                          variant={
                            player.tier === "S" ? "default" :
                            player.tier === "A" ? "secondary" :
                            player.tier === "B" ? "secondary" :
                            "secondary"
                          }
                          className="font-bold"
                        >
                          {player.tier}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{new Date(player.serverJoinDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {player.twitterUsername && (
                          <a
                            href={`https://twitter.com/${player.twitterUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        {player.twitchUsername && (
                          <a
                            href={`https://twitch.tv/${player.twitchUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        {player.youtubeUsername && (
                          <a
                            href={`https://youtube.com/${player.youtubeUsername.startsWith('@') ? player.youtubeUsername : '@' + player.youtubeUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        {!player.twitterUsername && !player.twitchUsername && !player.youtubeUsername && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    {activeTab === "archived" && isModeratorOrAdmin && (
                      <TableCell>
                        <span className="text-sm text-muted-foreground capitalize">
                          {player.archiveReason || "—"}
                        </span>
                      </TableCell>
                    )}
                    {activeTab === "rejected" && isModeratorOrAdmin && (
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {player.rejectionReason || "—"}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.location.href = `/player/${player.discordUsername}`}
                        >
                          View
                        </Button>
                        {isAdmin && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedPlayer(player._id);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedPlayer(player._id);
                                setIsScoreDialogOpen(true);
                              }}
                            >
                              {player.totalScore !== undefined ? "Update" : "Evaluate"}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {renderPagination(players.length)}
          </CardContent>
        </Card>
      )}
    </>
    );
  };

  return (
    <>
      <SiteHeader 
        onOpenCalculator={() => setIsCalculatorOpen(true)}
        onOpenAddPlayer={() => setIsAddDialogOpen(true)}
      />
      
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Co-Ed ZBD Hub</h1>
          <p className="text-muted-foreground mt-1">
            Track and evaluate player performance
          </p>
        </div>
      
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by Discord username, Epic username, or nickname..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              resetPage();
            }}
            className="pl-10"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full sm:w-[200px] justify-start">
              <Filter className="mr-2 h-4 w-4" />
              Filters
              {(tierFilters.size > 0 || femaleVerifiedOnly || notFemaleVerified) && (
                <Badge variant="secondary" className="ml-2">
                  {tierFilters.size + (femaleVerifiedOnly ? 1 : 0) + (notFemaleVerified ? 1 : 0)}
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
                        id={`tier-${tier}`}
                        checked={tierFilters.has(tier)}
                        onCheckedChange={() => toggleTierFilter(tier)}
                      />
                      <label
                        htmlFor={`tier-${tier}`}
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
                      id="female-verified"
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
                      htmlFor="female-verified"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Female Verified Only
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="not-female-verified"
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
                      htmlFor="not-female-verified"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Not Female Verified
                    </label>
                  </div>
                </div>
              </div>
              
              {(tierFilters.size > 0 || femaleVerifiedOnly || notFemaleVerified) && (
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
        <Select value={sortBy} onValueChange={(value) => { setSortBy(value); resetPage(); }}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <ArrowUpDown className="mr-2 h-4 w-4" />
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
            <SelectItem value="joined-newest">Joined (Newest)</SelectItem>
            <SelectItem value="joined-oldest">Joined (Oldest)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); resetPage(); }} className="w-full">
        <TabsList className={`grid w-full ${isAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
          <TabsTrigger value="active">
            <CheckCircle className="mr-2 h-4 w-4" />
            Active ({filteredActivePlayers.length})
          </TabsTrigger>
          <TabsTrigger value="archived">
            <Archive className="mr-2 h-4 w-4" />
            Archived ({filteredArchivedPlayers.length})
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="rejected">
              <XCircle className="mr-2 h-4 w-4" />
              Rejected ({filteredRejectedPlayers.length})
            </TabsTrigger>
          )}
        </TabsList>
        
        <TabsContent value="active" className="mt-6">
          {renderPlayerTable(
            filteredActivePlayers,
            UserPlus,
            activePlayers.length === 0 ? "No players yet" : "No players found",
            activePlayers.length === 0 ? "Get started by adding your first player" : "Try adjusting your search query"
          )}
        </TabsContent>
        
        <TabsContent value="archived" className="mt-6">
          {renderPlayerTable(
            filteredArchivedPlayers,
            Archive,
            archivedPlayers.length === 0 ? "No archived players" : "No players found",
            archivedPlayers.length === 0 ? "There are no archived players at the moment" : "Try adjusting your search query"
          )}
        </TabsContent>
        
        {isAdmin && (
          <TabsContent value="rejected" className="mt-6">
            {renderPlayerTable(
              filteredRejectedPlayers,
              XCircle,
              rejectedPlayers?.length === 0 ? "No rejected players" : "No players found",
              rejectedPlayers?.length === 0 ? "There are no rejected players at the moment" : "Try adjusting your search query"
            )}
          </TabsContent>
        )}
      </Tabs>
      
      {isAdmin && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
        </div>
      )}
      
      <TeamComboCalculator 
        open={isCalculatorOpen} 
        onOpenChange={setIsCalculatorOpen}
        players={activePlayers}
      />
      
      <AddPlayerDialog 
        open={isAddDialogOpen} 
        onOpenChange={setIsAddDialogOpen}
      />
      
      <ImportPlayersDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
      />
      
      {isAdmin && selectedPlayer && (
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
      </div>
    </>
  );
}
