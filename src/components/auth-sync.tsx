import { api } from "@/convex/_generated/api.js";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

function describeSyncError(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "data" in err &&
    err.data &&
    typeof err.data === "object" &&
    "message" in err.data &&
    typeof err.data.message === "string"
  ) {
    return err.data.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Could not link your account. Contact an admin.";
}

/**
 * Syncs the Convex users row after Clerk + Convex auth is ready.
 * Replaces the old Hercules /auth/callback onSync flow.
 */
export function AuthSync() {
  const { isAuthenticated } = useConvexAuth();
  const updateCurrentUser = useMutation(api.users.updateCurrentUser);
  const synced = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !synced.current) {
      synced.current = true;
      updateCurrentUser().catch((err) => {
        console.error("Failed to sync current user:", err);
        toast.error("Account not linked", {
          description: describeSyncError(err),
          duration: 10000,
        });
        synced.current = false;
      });
    }
    if (!isAuthenticated) {
      synced.current = false;
    }
  }, [isAuthenticated, updateCurrentUser]);

  return null;
}
