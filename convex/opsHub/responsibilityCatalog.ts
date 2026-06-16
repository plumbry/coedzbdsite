import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const RESPONSIBILITY_COLORS = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#db2777",
  "#0d9488",
  "#ea580c",
  "#4f46e5",
  "#0891b2",
] as const;

export async function getOrCreateCatalogEntry(
  ctx: MutationCtx,
  label: string,
): Promise<{ label: string; color: string }> {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new ConvexError({
      message: "Responsibility label is required",
      code: "INVALID_ARGUMENT",
    });
  }

  const existing = await ctx.db
    .query("opsHubResponsibilityCatalog")
    .withIndex("by_label", (q) => q.eq("label", trimmed))
    .unique();

  if (existing) {
    return { label: existing.label, color: existing.color };
  }

  const catalogSize = (
    await ctx.db.query("opsHubResponsibilityCatalog").collect()
  ).length;
  const color = RESPONSIBILITY_COLORS[catalogSize % RESPONSIBILITY_COLORS.length];

  await ctx.db.insert("opsHubResponsibilityCatalog", {
    label: trimmed,
    color,
    createdAt: Date.now(),
  });

  return { label: trimmed, color };
}

export async function resolveResponsibilityLabels(
  ctx: MutationCtx,
  labels: string[],
): Promise<Array<{ label: string; color: string }>> {
  const seen = new Set<string>();
  const resolved: Array<{ label: string; color: string }> = [];

  for (const raw of labels) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(await getOrCreateCatalogEntry(ctx, trimmed));
  }

  return resolved;
}

export async function listCatalogLabels(ctx: QueryCtx): Promise<string[]> {
  const entries = await ctx.db.query("opsHubResponsibilityCatalog").collect();
  return entries
    .map((e) => e.label)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
