import { useCallback, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";

const STORAGE_KEY = "eventBansViewerToken";

export function useEventBansViewer() {
  const [token, setTokenState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const isValid = useQuery(
    api.eventBans.viewerAuth.isSessionValid,
    token ? { viewerToken: token } : "skip",
  );

  const setToken = useCallback((newToken: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, newToken);
    } catch {
      // ignore quota / private mode
    }
    setTokenState(newToken);
  }, []);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setTokenState(null);
  }, []);

  useEffect(() => {
    if (isValid === false) {
      clear();
    }
  }, [isValid, clear]);

  const isUnlocked = Boolean(token) && isValid === true;

  return {
    token,
    isValid,
    isUnlocked,
    setToken,
    clear,
    isChecking: Boolean(token) && isValid === undefined,
  };
}
