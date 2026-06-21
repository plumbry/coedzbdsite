import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";

export function useUserRole() {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.getCurrentUser, !isAuthenticated ? "skip" : undefined);

  return {
    user: isAuthenticated ? user : null,
    isAuthenticated,
    isAdmin: isAuthenticated && user?.role === "admin",
    isAnalytics: user?.role === "analytics",
    isEventMod: user?.role === "event_mod",
    isModeratorOrAdmin: user?.role === "admin" || user?.role === "event_mod",
    hasEventBanAccess: user?.role === "admin" || user?.role === "event_mod",
    hasAnalyticsHubAccess: user?.role === "admin" || user?.role === "analytics",
    isViewer: !user?.role || user.role === "viewer",
    isLoading: isAuthenticated && user === undefined,
  };
}
