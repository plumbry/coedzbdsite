import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api.js";

export function useUserRole() {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.getCurrentUser, !isAuthenticated ? "skip" : undefined);

  return {
    user,
    isAuthenticated,
    isAdmin: user?.role === "admin",
    isEventMod: user?.role === "event_mod",
    isModeratorOrAdmin: user?.role === "admin" || user?.role === "event_mod",
    hasEventBanAccess: user?.role === "admin" || user?.role === "event_mod",
    isViewer: !user?.role || user.role === "viewer",
    isLoading: isAuthenticated && user === undefined,
  };
}
