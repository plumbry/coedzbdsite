import { api } from "@/convex/_generated/api.js";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const MAX_SYNC_ATTEMPTS = 6;
const INITIAL_RETRY_DELAY_MS = 1000;
const NULL_USER_RETRY_MS = 5000;
const MAX_NULL_USER_RETRIES = 12;

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Syncs the Convex users row after Clerk + Convex auth is ready.
 * Replaces the old Hercules /auth/callback onSync flow.
 */
export function AuthSync() {
  const { isAuthenticated } = useConvexAuth();
  const currentUser = useQuery(
    api.users.getCurrentUser,
    isAuthenticated ? undefined : "skip",
  );
  const updateCurrentUser = useMutation(api.users.updateCurrentUser);
  const syncedThisSession = useRef(false);
  const nullUserRetryCount = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) {
      syncedThisSession.current = false;
      nullUserRetryCount.current = 0;
      return;
    }

    if (currentUser === undefined) {
      return;
    }

    if (currentUser !== null) {
      nullUserRetryCount.current = 0;
    }

    const needsSync = currentUser === null || !syncedThisSession.current;
    if (!needsSync) {
      return;
    }

    let cancelled = false;

    void (async () => {
      for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
        if (cancelled) {
          return;
        }

        try {
          await updateCurrentUser();
          syncedThisSession.current = true;
          return;
        } catch (err) {
          if (cancelled) {
            return;
          }

          const isLastAttempt = attempt === MAX_SYNC_ATTEMPTS - 1;
          if (isLastAttempt) {
            console.error("Failed to sync current user:", err);
            toast.error("Account not linked", {
              description: describeSyncError(err),
              duration: 10000,
            });
            return;
          }

          await wait(INITIAL_RETRY_DELAY_MS * 2 ** attempt);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentUser, updateCurrentUser]);

  useEffect(() => {
    if (!isAuthenticated || currentUser !== null || currentUser === undefined) {
      return;
    }

    if (nullUserRetryCount.current >= MAX_NULL_USER_RETRIES) {
      return;
    }

    const timer = window.setInterval(() => {
      nullUserRetryCount.current += 1;
      syncedThisSession.current = false;
      void updateCurrentUser().catch((err) => {
        console.error("Background user sync failed:", err);
      });
    }, NULL_USER_RETRY_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [isAuthenticated, currentUser, updateCurrentUser]);

  return null;
}
