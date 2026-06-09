import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";

const CACHE_KEY = "eventManagerTitlesCache";
const CACHE_TTL_MS = 60 * 60 * 1000;

type TitleCache = {
  titles: string[];
  updatedAt: number;
};

function readCache(): TitleCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TitleCache;
    if (!Array.isArray(parsed.titles) || typeof parsed.updatedAt !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(titles: string[]) {
  try {
    const payload: TitleCache = { titles, updatedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

function isCacheFresh(cache: TitleCache | null): boolean {
  if (!cache) return false;
  return Date.now() - cache.updatedAt < CACHE_TTL_MS;
}

export function useCachedEventTitles(enabled: boolean) {
  const freshTitles = useQuery(
    api.events.management.listEventTitles,
    enabled ? {} : "skip",
  );

  const [titles, setTitles] = useState<string[]>(() => readCache()?.titles ?? []);

  useEffect(() => {
    if (!enabled) return;
    const cached = readCache();
    if (cached && isCacheFresh(cached)) {
      setTitles(cached.titles);
    }
  }, [enabled]);

  useEffect(() => {
    if (!freshTitles) return;
    writeCache(freshTitles);
    setTitles(freshTitles);
  }, [freshTitles]);

  return {
    titles,
    isLoading: enabled && freshTitles === undefined && titles.length === 0,
  };
}
