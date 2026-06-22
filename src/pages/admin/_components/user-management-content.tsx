import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Users, Shield, Eye, UserCog, Calendar, RefreshCw, BarChart3, GitMerge, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useClientPagination } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";
import { useState } from "react";
import MergeUsersDialog from "./merge-users-dialog.tsx";
import DeleteUserDialog from "./delete-user-dialog.tsx";

export default function UserManagement() {
  const users = useQuery(api.users.getAllUsers, {});
  const duplicateEmails = useQuery(api.userMerge.getDuplicateUserEmails, {});
  const usersPagination = useClientPagination(users, {});
  const currentUser = useQuery(api.users.getCurrentUser);
  const updateUserRole = useMutation(api.users.updateUserRole);
  const clearViewerUsernames = useMutation(api.users.clearViewerUsernames);
  const syncUsersFromClerk = useAction(api.userProvisioning.syncUsersFromClerk);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClearingViewerUsernames, setIsClearingViewerUsernames] = useState(false);
  const [mergeGroupEmail, setMergeGroupEmail] = useState<string | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<Id<"users"> | null>(null);

  if (users === undefined || currentUser === undefined || duplicateEmails === undefined) {
    return <Skeleton className="h-48 w-full" />;
  }

  const selectedMergeGroup = duplicateEmails.find(
    (group: { email: string }) => group.email === mergeGroupEmail,
  );

  const handleRoleChange = async (
    userId: Id<"users">,
    role: "admin" | "event_mod" | "viewer" | "analytics",
  ) => {
    try {
      await updateUserRole({ userId, role });
      const roleLabel =
        role === "event_mod"
          ? "Mod"
          : role === "analytics"
            ? "Analytics"
            : role;
      toast.success(`User role updated to ${roleLabel}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("cannot change your own role")) {
        toast.error("You cannot change your own role");
      } else {
        toast.error("Failed to update user role");
      }
    }
  };

  const handleSyncFromClerk = async () => {
    setIsSyncing(true);
    try {
      const result = await syncUsersFromClerk({});
      toast.success(
        `Synced ${result.clerkTotal} Clerk users (${result.created} new, ${result.updated} updated)`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to sync users from Clerk",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const adminUsers = users.filter((u) => u.role === "admin");
  const eventModUsers = users.filter((u) => u.role === "event_mod");
  const analyticsUsers = users.filter((u) => u.role === "analytics");
  const viewerUsers = users.filter((u) => !u.role || u.role === "viewer");
  const viewerUsersWithUsernames = viewerUsers.filter((u) => u.username);

  const handleClearViewerUsernames = async () => {
    setIsClearingViewerUsernames(true);
    try {
      const result = await clearViewerUsernames({});
      toast.success(`Cleared ${result.cleared} viewer username${result.cleared === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to clear viewer usernames",
      );
    } finally {
      setIsClearingViewerUsernames(false);
    }
  };

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardDescription>
            {adminUsers.length} admin{adminUsers.length !== 1 ? "s" : ""}, {eventModUsers.length} mod{eventModUsers.length !== 1 ? "s" : ""}, {analyticsUsers.length} analytics, {viewerUsers.length} viewer{viewerUsers.length !== 1 ? "s" : ""}
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleClearViewerUsernames}
              disabled={isClearingViewerUsernames || viewerUsersWithUsernames.length === 0}
            >
              <Eye className="mr-2 h-4 w-4" />
              Clear Viewer Usernames
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncFromClerk}
              disabled={isSyncing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              Sync from Clerk
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {duplicateEmails.length > 0 && (
          <div className="mb-4 space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-sm font-medium">Duplicate accounts detected</p>
            {duplicateEmails.map((group: { email: string; users: Array<{ _id: Id<"users"> }> }) => (
              <div
                key={group.email}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {group.email} ({group.users.length} accounts)
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMergeGroupEmail(group.email)}
                  disabled={group.users.length !== 2}
                >
                  <GitMerge className="mr-2 h-4 w-4" />
                  Merge
                </Button>
              </div>
            ))}
            {duplicateEmails.some(
              (group: { users: unknown[] }) => group.users.length > 2,
            ) && (
              <p className="text-xs text-muted-foreground">
                Groups with more than two accounts need to be merged one pair at a time.
              </p>
            )}
          </div>
        )}
        {users.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>No users yet</EmptyTitle>
              <EmptyDescription>Users will appear here after they sign in</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usersPagination.pageItems ?? []).map((user) => {
                const isCurrentUser = user._id === currentUser?._id;
                const role = user.role || "viewer";
                
                return (
                  <TableRow key={user._id}>
                    <TableCell className="font-medium">
                      {user.name || "Unknown"}
                      {isCurrentUser && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          You
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.username || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          role === "admin"
                            ? "default"
                            : role === "event_mod"
                              ? "secondary"
                              : role === "analytics"
                                ? "secondary"
                                : "outline"
                        }
                        className="flex items-center gap-1 w-fit"
                      >
                        {role === "admin" ? (
                          <Shield className="h-3 w-3" />
                        ) : role === "event_mod" ? (
                          <Calendar className="h-3 w-3" />
                        ) : role === "analytics" ? (
                          <BarChart3 className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                        {role === "admin"
                          ? "Admin"
                          : role === "event_mod"
                            ? "Mod"
                            : role === "analytics"
                              ? "Analytics"
                              : "Viewer"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {role !== "admin" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRoleChange(user._id, "admin")}
                            disabled={isCurrentUser}
                          >
                            <Shield className="mr-1 h-3 w-3" />
                            Admin
                          </Button>
                        )}
                        {role !== "event_mod" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRoleChange(user._id, "event_mod")}
                            disabled={isCurrentUser}
                          >
                            <UserCog className="mr-1 h-3 w-3" />
                            Mod
                          </Button>
                        )}
                        {role !== "analytics" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRoleChange(user._id, "analytics")}
                            disabled={isCurrentUser}
                          >
                            <BarChart3 className="mr-1 h-3 w-3" />
                            Analytics
                          </Button>
                        )}
                        {role !== "viewer" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRoleChange(user._id, "viewer")}
                            disabled={isCurrentUser}
                          >
                            <Eye className="mr-1 h-3 w-3" />
                            Viewer
                          </Button>
                        )}
                        {role !== "admin" && !isCurrentUser && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteUserId(user._id)}
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination
            page={usersPagination.page}
            totalPages={usersPagination.totalPages}
            totalCount={usersPagination.totalCount}
            startIndex={usersPagination.startIndex}
            endIndex={usersPagination.endIndex}
            onPageChange={usersPagination.setPage}
            itemLabel="users"
          />
          </>
        )}
      </CardContent>
    </Card>
    {selectedMergeGroup && selectedMergeGroup.users.length === 2 && (
      <MergeUsersDialog
        open={mergeGroupEmail !== null}
        onOpenChange={(open) => {
          if (!open) setMergeGroupEmail(null);
        }}
        users={selectedMergeGroup.users as [
          (typeof selectedMergeGroup.users)[0],
          (typeof selectedMergeGroup.users)[1],
        ]}
        onMerged={() => setMergeGroupEmail(null)}
      />
    )}
    <DeleteUserDialog
      userId={deleteUserId}
      onOpenChange={(open) => {
        if (!open) setDeleteUserId(null);
      }}
    />
    </>
  );
}
