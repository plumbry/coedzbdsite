import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";

type TierEvaluationCacheArgs = {
  tier?: string;
  limit?: number;
};

export function useTierEvaluationCache(args?: TierEvaluationCacheArgs | "skip") {
  return useQuery(
    api.tierReEvaluation.getCachedTierReEvaluationData,
    args === "skip" ? "skip" : args ?? {},
  );
}
