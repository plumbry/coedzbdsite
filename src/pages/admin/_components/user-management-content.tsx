import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty.tsx";
import { Users, Shield, Eye, UserCog, Calendar } from "lucide-react";
import { toast } from "sonner";

export default function UserManagement() {
  const users = useQuery(api.users.getAllUsers, {});
  const currentUser = useQuery(api.users.getCurrentUser);
  const updateUserRole = useMutation(api.users.updateUserRole);

  if (users === undefined || currentUser === undefined) {
    return <Skeleton className="h-48 w-full" />;
  }

  const handleRoleChange = async (userId: Id<"users">, role: "admin" | "event_mod" | "viewer") => {
    try {
      await updateUserRole({ userId, role });
      toast.success(`User role updated to ${role === "event_mod" ? "Mod" : role}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("cannot change your own role")) {
        toast.error("You cannot change your own role");
      } else {
        toast.error("Failed to update user role");
      }
    }
  };

  const adminUsers = users.filter((u) => u.role === "admin");
  const eventModUsers = users.filter((u) => u.role === "event_mod");
  const viewerUsers = users.filter((u) => !u.role || u.role === "viewer");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>
          {adminUsers.length} admin{adminUsers.length !== 1 ? "s" : ""}, {eventModUsers.length} mod{eventModUsers.length !== 1 ? "s" : ""}, {viewerUsers.length} viewer{viewerUsers.length !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
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
                      {user.email || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={role === "admin" ? "default" : role === "event_mod" ? "secondary" : "outline"}
                        className="flex items-center gap-1 w-fit"
                      >
                        {role === "admin" ? (
                          <Shield className="h-3 w-3" />
                        ) : role === "event_mod" ? (
                          <Calendar className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                        {role === "admin" ? "Admin" : role === "event_mod" ? "Mod" : "Viewer"}
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
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
