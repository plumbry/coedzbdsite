import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ArrowUpDown, ArrowUp, ArrowDown, Settings, RefreshCw } from "lucide-react";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SortField = "eventName" | "eventDate" | "dayOfWeek" | "totalTeams" | "top3Players" | "top4Players" | "top5Players" | "totalPlayers" | "top3Percentage" | "top4Percentage" | "top5Percentage" | "tierSPlayers" | "tierAPlayers" | "tierBPlayers" | "tierCPlayers";
type SortDirection = "asc" | "desc";

function LeaderboardStatsContent() {
  const stats = useQuery(api.leaderboardStats.getLeaderboardStats);
  const cacheMeta = useQuery(api.leaderboardStats.getLeaderboardStatsCacheMeta);
  const rebuildCache = useMutation(api.leaderboardStats.rebuildLeaderboardStatsCache);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [sortField, setSortField] = useState<SortField>("eventDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [hideNoMoney, setHideNoMoney] = useState(false);
  const [hideReload, setHideReload] = useState(false);
  const [showLast90Days, setShowLast90Days] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    eventName: true,
    eventDate: true,
    dayOfWeek: true,
    totalTeams: true,
    totalPlayers: true,
    top3Players: true,
    top4Players: true,
    top5Players: true,
    top3Percentage: true,
    top4Percentage: true,
    top5Percentage: true,
    tierSPlayers: true,
    tierAPlayers: true,
    tierBPlayers: true,
    tierCPlayers: true,
  });

  if (stats === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!stats.available) {
    return (
      <div className="space-y-4 rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">{stats.message}</p>
        <Button
          disabled={isRebuilding}
          onClick={async () => {
            setIsRebuilding(true);
            try {
              await rebuildCache({});
              toast.success("Leaderboard stats cache rebuild started");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Rebuild failed");
            } finally {
              setIsRebuilding(false);
            }
          }}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRebuilding ? "animate-spin" : ""}`} />
          Rebuild leaderboard cache
        </Button>
      </div>
    );
  }

  const statRows = stats.stats;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    );
  };

  // Filter stats based on hideNoMoney, hideReload, and showLast90Days
  let filteredStats = statRows;
  
  if (hideNoMoney) {
    filteredStats = filteredStats.filter((stat) => {
      const isNoMoney = (stat as { isNoMoneyEvent?: boolean }).isNoMoneyEvent;
      return !isNoMoney;
    });
  }
  
  if (hideReload) {
    filteredStats = filteredStats.filter((stat) => {
      const mode = (stat as { mode?: string | null }).mode;
      return mode?.toLowerCase() !== "reload";
    });
  }
  
  if (showLast90Days) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    filteredStats = filteredStats.filter((stat) => {
      if (!stat.eventDate) return false;
      const eventDate = new Date(stat.eventDate);
      return eventDate >= ninetyDaysAgo;
    });
  }

  const sortedStats = [...filteredStats].sort((a, b) => {
    let aValue: string | number = "";
    let bValue: string | number = "";

    switch (sortField) {
      case "eventName":
        aValue = a.eventName.toLowerCase();
        bValue = b.eventName.toLowerCase();
        break;
      case "eventDate":
        aValue = a.eventDate ? new Date(a.eventDate).getTime() : 0;
        bValue = b.eventDate ? new Date(b.eventDate).getTime() : 0;
        break;
      case "dayOfWeek":
        aValue = a.eventDate ? new Date(a.eventDate).getDay() : 0;
        bValue = b.eventDate ? new Date(b.eventDate).getDay() : 0;
        break;
      case "totalTeams":
        aValue = a.totalTeams;
        bValue = b.totalTeams;
        break;
      case "top3Players":
        aValue = (a as { top3Players?: number }).top3Players || 0;
        bValue = (b as { top3Players?: number }).top3Players || 0;
        break;
      case "top4Players":
        aValue = (a as { top4Players?: number }).top4Players || 0;
        bValue = (b as { top4Players?: number }).top4Players || 0;
        break;
      case "top5Players":
        aValue = a.top5Players;
        bValue = b.top5Players;
        break;
      case "totalPlayers":
        aValue = a.totalPlayers;
        bValue = b.totalPlayers;
        break;
      case "top3Percentage":
        aValue = (a as { top3Percentage?: number }).top3Percentage || 0;
        bValue = (b as { top3Percentage?: number }).top3Percentage || 0;
        break;
      case "top4Percentage":
        aValue = (a as { top4Percentage?: number }).top4Percentage || 0;
        bValue = (b as { top4Percentage?: number }).top4Percentage || 0;
        break;
      case "top5Percentage":
        aValue = (a as { top5Percentage?: number }).top5Percentage || 0;
        bValue = (b as { top5Percentage?: number }).top5Percentage || 0;
        break;
      case "tierSPlayers":
        aValue = (a as { tierSPlayers?: number }).tierSPlayers || 0;
        bValue = (b as { tierSPlayers?: number }).tierSPlayers || 0;
        break;
      case "tierAPlayers":
        aValue = (a as { tierAPlayers?: number }).tierAPlayers || 0;
        bValue = (b as { tierAPlayers?: number }).tierAPlayers || 0;
        break;
      case "tierBPlayers":
        aValue = (a as { tierBPlayers?: number }).tierBPlayers || 0;
        bValue = (b as { tierBPlayers?: number }).tierBPlayers || 0;
        break;
      case "tierCPlayers":
        aValue = (a as { tierCPlayers?: number }).tierCPlayers || 0;
        bValue = (b as { tierCPlayers?: number }).tierCPlayers || 0;
        break;
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hideNoMoney"
              checked={hideNoMoney}
              onCheckedChange={(checked) => setHideNoMoney(checked === true)}
            />
            <Label htmlFor="hideNoMoney" className="cursor-pointer">
              Hide No Money Events
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hideReload"
              checked={hideReload}
              onCheckedChange={(checked) => setHideReload(checked === true)}
            />
            <Label htmlFor="hideReload" className="cursor-pointer">
              Hide Reload Map Events
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="showLast90Days"
              checked={showLast90Days}
              onCheckedChange={(checked) => setShowLast90Days(checked === true)}
            />
            <Label htmlFor="showLast90Days" className="cursor-pointer">
              Last 90 Days
            </Label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cacheMeta?.lastUpdated && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Cached {new Date(cacheMeta.lastUpdated).toLocaleString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={isRebuilding}
            onClick={async () => {
              setIsRebuilding(true);
              try {
                await rebuildCache({});
                toast.success("Leaderboard stats cache rebuild started");
              } catch {
                toast.error("Failed to start cache rebuild");
              } finally {
                setIsRebuilding(false);
              }
            }}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRebuilding ? "animate-spin" : ""}`} />
            Rebuild cache
          </Button>
          <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings className="mr-2 h-4 w-4" />
              Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56" align="end">
            <div className="space-y-2">
              <h4 className="font-medium text-sm mb-3">Toggle Columns</h4>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.eventName}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, eventName: checked as boolean }))
                  }
                />
                <span>Event Name</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.eventDate}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, eventDate: checked as boolean }))
                  }
                />
                <span>Date</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.dayOfWeek}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, dayOfWeek: checked as boolean }))
                  }
                />
                <span>Day of Week</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.totalTeams}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, totalTeams: checked as boolean }))
                  }
                />
                <span>Total Teams</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.totalPlayers}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, totalPlayers: checked as boolean }))
                  }
                />
                <span>Total Players</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.top3Players}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, top3Players: checked as boolean }))
                  }
                />
                <span>Players in Top 3</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.top4Players}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, top4Players: checked as boolean }))
                  }
                />
                <span>Players in Top 4</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.top5Players}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, top5Players: checked as boolean }))
                  }
                />
                <span>Players in Top 5</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.top3Percentage}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, top3Percentage: checked as boolean }))
                  }
                />
                <span>Top 3 %</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.top4Percentage}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, top4Percentage: checked as boolean }))
                  }
                />
                <span>Top 4 %</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.top5Percentage}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, top5Percentage: checked as boolean }))
                  }
                />
                <span>Top 5 %</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.tierSPlayers}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, tierSPlayers: checked as boolean }))
                  }
                />
                <span>Tier S Players</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.tierAPlayers}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, tierAPlayers: checked as boolean }))
                  }
                />
                <span>Tier A Players</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.tierBPlayers}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, tierBPlayers: checked as boolean }))
                  }
                />
                <span>Tier B Players</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={visibleColumns.tierCPlayers}
                  onCheckedChange={(checked) => 
                    setVisibleColumns(prev => ({ ...prev, tierCPlayers: checked as boolean }))
                  }
                />
                <span>Tier C Players</span>
              </label>
            </div>
          </PopoverContent>
        </Popover>
        </div>
      </div>
      
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.eventName && (
                <TableHead>
                  <button
                    onClick={() => handleSort("eventName")}
                    className="flex items-center hover:text-foreground transition-colors"
                  >
                    Event Name
                    {getSortIcon("eventName")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.eventDate && (
                <TableHead>
                  <button
                    onClick={() => handleSort("eventDate")}
                    className="flex items-center hover:text-foreground transition-colors"
                  >
                    Date
                    {getSortIcon("eventDate")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.dayOfWeek && (
                <TableHead>
                  <button
                    onClick={() => handleSort("dayOfWeek")}
                    className="flex items-center hover:text-foreground transition-colors"
                  >
                    Day of Week
                    {getSortIcon("dayOfWeek")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.totalTeams && (
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort("totalTeams")}
                    className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                  >
                    Total Teams
                    {getSortIcon("totalTeams")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.totalPlayers && (
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort("totalPlayers")}
                    className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                  >
                    Total Players
                    {getSortIcon("totalPlayers")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.top3Players && (
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort("top3Players")}
                    className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                  >
                    Players in Top 3
                    {getSortIcon("top3Players")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.top4Players && (
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort("top4Players")}
                    className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                  >
                    Players in Top 4
                    {getSortIcon("top4Players")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.top5Players && (
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort("top5Players")}
                    className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                  >
                    Players in Top 5
                    {getSortIcon("top5Players")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.top3Percentage && (
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort("top3Percentage")}
                    className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                  >
                    Top 3 %
                    {getSortIcon("top3Percentage")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.top4Percentage && (
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort("top4Percentage")}
                    className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                  >
                    Top 4 %
                    {getSortIcon("top4Percentage")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.top5Percentage && (
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort("top5Percentage")}
                    className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                  >
                    Top 5 %
                    {getSortIcon("top5Percentage")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.tierSPlayers && (
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort("tierSPlayers")}
                    className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                  >
                    Tier S
                    {getSortIcon("tierSPlayers")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.tierAPlayers && (
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort("tierAPlayers")}
                    className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                  >
                    Tier A
                    {getSortIcon("tierAPlayers")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.tierBPlayers && (
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort("tierBPlayers")}
                    className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                  >
                    Tier B
                    {getSortIcon("tierBPlayers")}
                  </button>
                </TableHead>
              )}
              {visibleColumns.tierCPlayers && (
                <TableHead className="text-right">
                  <button
                    onClick={() => handleSort("tierCPlayers")}
                    className="flex items-center justify-end w-full hover:text-foreground transition-colors"
                  >
                    Tier C
                    {getSortIcon("tierCPlayers")}
                  </button>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={Object.values(visibleColumns).filter(v => v).length} className="text-center text-muted-foreground">
                  No leaderboard data available
                </TableCell>
              </TableRow>
            ) : (
              sortedStats.map((stat) => {
                const top3Players = (stat as { top3Players?: number }).top3Players || 0;
                const top4Players = (stat as { top4Players?: number }).top4Players || 0;
                const top3Percentage = (stat as { top3Percentage?: number }).top3Percentage || 0;
                const top4Percentage = (stat as { top4Percentage?: number }).top4Percentage || 0;
                const top5Percentage = (stat as { top5Percentage?: number }).top5Percentage || 0;
                const tierSPlayers = (stat as { tierSPlayers?: number }).tierSPlayers || 0;
                const tierAPlayers = (stat as { tierAPlayers?: number }).tierAPlayers || 0;
                const tierBPlayers = (stat as { tierBPlayers?: number }).tierBPlayers || 0;
                const tierCPlayers = (stat as { tierCPlayers?: number }).tierCPlayers || 0;
                
                // Get day of week
                const getDayOfWeek = (dateString: string | undefined) => {
                  if (!dateString) return "N/A";
                  const date = new Date(dateString);
                  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                  return days[date.getDay()];
                };
                
                // Calculate tier percentages
                const totalPlayers = stat.totalPlayers;
                const getTierPercentage = (tierCount: number) => {
                  if (totalPlayers === 0) return 0;
                  return Math.round((tierCount / totalPlayers) * 100 * 10) / 10;
                };
                
                const tierSPercentage = getTierPercentage(tierSPlayers);
                const tierAPercentage = getTierPercentage(tierAPlayers);
                const tierBPercentage = getTierPercentage(tierBPlayers);
                const tierCPercentage = getTierPercentage(tierCPlayers);
                
                return (
                  <TableRow key={stat.importId}>
                    {visibleColumns.eventName && (
                      <TableCell className="font-medium">{stat.eventName}</TableCell>
                    )}
                    {visibleColumns.eventDate && (
                      <TableCell>
                        {stat.eventDate
                          ? new Date(stat.eventDate).toLocaleDateString()
                          : "N/A"}
                      </TableCell>
                    )}
                    {visibleColumns.dayOfWeek && (
                      <TableCell>
                        {getDayOfWeek(stat.eventDate)}
                      </TableCell>
                    )}
                    {visibleColumns.totalTeams && (
                      <TableCell className="text-right">{stat.totalTeams}</TableCell>
                    )}
                    {visibleColumns.totalPlayers && (
                      <TableCell className="text-right">{stat.totalPlayers}</TableCell>
                    )}
                    {visibleColumns.top3Players && (
                      <TableCell className="text-right">{top3Players}</TableCell>
                    )}
                    {visibleColumns.top4Players && (
                      <TableCell className="text-right">{top4Players}</TableCell>
                    )}
                    {visibleColumns.top5Players && (
                      <TableCell className="text-right">{stat.top5Players}</TableCell>
                    )}
                    {visibleColumns.top3Percentage && (
                      <TableCell className="text-right">{top3Percentage}%</TableCell>
                    )}
                    {visibleColumns.top4Percentage && (
                      <TableCell className="text-right">{top4Percentage}%</TableCell>
                    )}
                    {visibleColumns.top5Percentage && (
                      <TableCell className="text-right">{top5Percentage}%</TableCell>
                    )}
                    {visibleColumns.tierSPlayers && (
                      <TableCell className="text-right">
                        {tierSPlayers} {tierSPlayers > 0 && `(${tierSPercentage}%)`}
                      </TableCell>
                    )}
                    {visibleColumns.tierAPlayers && (
                      <TableCell className="text-right">
                        {tierAPlayers} {tierAPlayers > 0 && `(${tierAPercentage}%)`}
                      </TableCell>
                    )}
                    {visibleColumns.tierBPlayers && (
                      <TableCell className="text-right">
                        {tierBPlayers} {tierBPlayers > 0 && `(${tierBPercentage}%)`}
                      </TableCell>
                    )}
                    {visibleColumns.tierCPlayers && (
                      <TableCell className="text-right">
                        {tierCPlayers} {tierCPlayers > 0 && `(${tierCPercentage}%)`}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function LeaderboardStats() {
  return (
    <AdminPageLayout requireAdmin
      title="Leaderboard Statistics"
      authTitle="Sign in to view leaderboard statistics"
    >
      <LeaderboardStatsContent />
    </AdminPageLayout>
  );
}
