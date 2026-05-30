import { useAuth } from "@clerk/react";
import { ConvexProviderWithAuth } from "convex/react";
import { ConvexReactClient } from "convex/react";
import { useCallback, useMemo } from "react";

const convexUrl = import.meta.env.VITE_CONVEX_URL ?? "http://localhost:3000";
const convex = new ConvexReactClient(convexUrl);

/**
 * Always request the Clerk "convex" JWT template so custom claims (discord_id) are
 * included. ConvexProviderWithClerk skips the template when session aud === "convex",
 * which can omit template-only claims.
 */
function useAuthForConvex() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        return await getToken({
          template: "convex",
          skipCache: forceRefreshToken,
        });
      } catch {
        return null;
      }
    },
    [getToken],
  );

  return useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: isSignedIn === true,
      fetchAccessToken,
    }),
    [isLoaded, isSignedIn, fetchAccessToken],
  );
}

export function ConvexProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}
