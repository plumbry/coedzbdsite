import { useState, useMemo } from "react";
import { useClientPagination } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible.tsx";
import { ScrollText, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

type LogEntry = {
  _id: string;
  _creationTime: number;
  action: string;
  userName?: string;
  details?: string;
  previousValue?: string;
  newValue?: string;
  createdAt: string;
};

type GroupedLog = {
  id: string;
  action: string;
  category: string;
  userName?: string;
  firstTimestamp: number;
  lastTimestamp: number;
  count: number;
  logs: LogEntry[];
};

// Categorize actions
const getActionCategory = (action: string): string => {
  if (action.startsWith("player_") || action === "players_bulk_imported") return "players";
  if (action.startsWith("score_")) return "scores";
  if (action.startsWith("event_")) return "events";
  if (action.startsWith("third_party_")) return "imports";
  if (action.startsWith("user_")) return "users";
  return "other";
};

const getActionColor = (action: string) => {
  if (action.includes("created") || action.includes("imported")) return "default";
  if (action.includes("updated") || action.includes("changed") || action.includes("rematch")) return "secondary";
  if (action.includes("deleted")) return "destructive";
  return "secondary";
};

const getActionLabel = (action: string) => {
  return action
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getCategoryLabel = (category: string) => {
  switch (category) {
    case "players": return "Players";
    case "scores": return "Scores";
    case "events": return "Events";
    case "imports": return "Tournament Imports";
    case "users": return "Users";
    default: return "Other";
  }
};

// Group logs within 15-minute windows
const groupLogs = (logsList: LogEntry[]): GroupedLog[] => {
    if (!logsList || logsList.length === 0) return [];
    
    const FIFTEEN_MINUTES = 15 * 60 * 1000; // 15 minutes in milliseconds
    const grouped: GroupedLog[] = [];
    
    let currentGroup: LogEntry[] = [logsList[0]];
    let currentAction = logsList[0].action;
    let currentCategory = getActionCategory(logsList[0].action);
    let currentUser = logsList[0].userName;
    
    for (let i = 1; i < logsList.length; i++) {
      const log = logsList[i];
      const prevLog = logsList[i - 1];
      const category = getActionCategory(log.action);
      
      // Check if this log should be grouped with the current group
      const timeDiff = prevLog._creationTime - log._creationTime;
      const sameAction = log.action === currentAction;
      const sameCategory = category === currentCategory;
      const sameUser = log.userName === currentUser;
      const withinTimeWindow = timeDiff <= FIFTEEN_MINUTES;
      
      if (sameAction && sameCategory && sameUser && withinTimeWindow) {
        currentGroup.push(log);
      } else {
        // Finalize current group
        if (currentGroup.length > 1) {
          grouped.push({
            id: currentGroup[0]._id,
            action: currentAction,
            category: currentCategory,
            userName: currentUser,
            firstTimestamp: currentGroup[currentGroup.length - 1]._creationTime,
            lastTimestamp: currentGroup[0]._creationTime,
            count: currentGroup.length,
            logs: currentGroup,
          });
        } else {
          // Single log, add as-is
          grouped.push({
            id: currentGroup[0]._id,
            action: currentAction,
            category: currentCategory,
            userName: currentUser,
            firstTimestamp: currentGroup[0]._creationTime,
            lastTimestamp: currentGroup[0]._creationTime,
            count: 1,
            logs: currentGroup,
          });
        }
        
        // Start new group
        currentGroup = [log];
        currentAction = log.action;
        currentCategory = category;
        currentUser = log.userName;
      }
    }
    
    // Add final group
    if (currentGroup.length > 1) {
      grouped.push({
        id: currentGroup[0]._id,
        action: currentAction,
        category: currentCategory,
        userName: currentUser,
        firstTimestamp: currentGroup[currentGroup.length - 1]._creationTime,
        lastTimestamp: currentGroup[0]._creationTime,
        count: currentGroup.length,
        logs: currentGroup,
      });
    } else {
      grouped.push({
        id: currentGroup[0]._id,
        action: currentAction,
        category: currentCategory,
        userName: currentUser,
        firstTimestamp: currentGroup[0]._creationTime,
        lastTimestamp: currentGroup[0]._creationTime,
        count: 1,
        logs: currentGroup,
      });
    }
    
    return grouped;
};

export default function AuditLogView() {
  const {
    results: logs,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.audit.getAuditLogsPaginated,
    {},
    { initialNumItems: 50 },
  );
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Filter and group logs
  const groupedLogs = useMemo(() => {
    if (!logs) return [];
    const filtered = filterCategory === "all" 
      ? logs 
      : logs.filter(log => getActionCategory(log.action) === filterCategory);
    return groupLogs(filtered);
  }, [logs, filterCategory]);

  const logsPagination = useClientPagination(groupedLogs, {
    resetDeps: [filterCategory],
  });

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  if (status === "LoadingFirstPage") {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>
          Track all admin actions and changes in the system
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="category-filter" className="text-sm font-medium">Filter by:</label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger id="category-filter" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="players">Players</SelectItem>
              <SelectItem value="scores">Scores</SelectItem>
              <SelectItem value="events">Events</SelectItem>
              <SelectItem value="imports">Tournament Imports</SelectItem>
              <SelectItem value="users">Users</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            ({groupedLogs.length} {groupedLogs.length === 1 ? 'group' : 'groups'})
          </span>
        </div>

        {groupedLogs.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScrollText />
              </EmptyMedia>
              <EmptyTitle>No audit logs found</EmptyTitle>
              <EmptyDescription>
                {filterCategory === "all" 
                  ? "Actions will appear here as you make changes"
                  : "No logs found for the selected category"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Previous</TableHead>
                  <TableHead>New</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logsPagination.pageItems ?? []).map((group) => {
                  const isExpanded = expandedGroups.has(group.id);
                  const isGrouped = group.count > 1;
                  
                  return (
                    <>
                      <TableRow 
                        key={group.id}
                        className={isGrouped ? "cursor-pointer hover:bg-muted/50" : ""}
                        onClick={() => isGrouped && toggleGroup(group.id)}
                      >
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {isGrouped ? (
                            <div className="flex items-center gap-1">
                              <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                              <span>
                                {new Date(group.firstTimestamp).toLocaleString()} - {new Date(group.lastTimestamp).toLocaleString()}
                              </span>
                            </div>
                          ) : (
                            new Date(group.firstTimestamp).toLocaleString()
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {group.userName || "Unknown"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {getCategoryLabel(group.category)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={getActionColor(group.action)}>
                              {getActionLabel(group.action)}
                            </Badge>
                            {isGrouped && (
                              <Badge variant="secondary" className="text-xs">
                                ×{group.count}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate">
                          {isGrouped ? `${group.count} entries` : (group.logs[0].details || "—")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                          {isGrouped ? "—" : (group.logs[0].previousValue || "—")}
                        </TableCell>
                        <TableCell className="text-xs max-w-xs truncate">
                          {isGrouped ? "—" : (group.logs[0].newValue || "—")}
                        </TableCell>
                      </TableRow>
                      
                      {isGrouped && isExpanded && group.logs.map((log) => (
                        <TableRow key={log._id} className="bg-muted/20">
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap pl-8">
                            {new Date(log.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.userName || "Unknown"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {getCategoryLabel(getActionCategory(log.action))}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getActionColor(log.action)}>
                              {getActionLabel(log.action)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-xs truncate">
                            {log.details || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                            {log.previousValue || "—"}
                          </TableCell>
                          <TableCell className="text-xs max-w-xs truncate">
                            {log.newValue || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <TablePagination
          page={logsPagination.page}
          totalPages={logsPagination.totalPages}
          totalCount={logsPagination.totalCount}
          startIndex={logsPagination.startIndex}
          endIndex={logsPagination.endIndex}
          onPageChange={logsPagination.setPage}
          itemLabel="log groups"
        />
        {status === "CanLoadMore" && (
          <div className="flex justify-center pt-2">
            <Button variant="outline" size="sm" onClick={() => loadMore(50)}>
              Load more from server
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
