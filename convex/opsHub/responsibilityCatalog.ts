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
  "#ca8a04",
  "#9333ea",
  "#e11d48",
  "#059669",
  "#c026d3",
  "#0284c7",
] as const;

function hashLabel(label: string): number {
  const normalized = label.trim().toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function pickUniqueResponsibilityColor(
  usedColors: Iterable<string>,
  label: string,
): string {
  const used = new Set([...usedColors].map((c) => c.toLowerCase()));
  const start = hashLabel(label) % RESPONSIBILITY_COLORS.length;
  for (let i = 0; i < RESPONSIBILITY_COLORS.length; i++) {
    const color = RESPONSIBILITY_COLORS[(start + i) % RESPONSIBILITY_COLORS.length];
    if (!used.has(color.toLowerCase())) return color;
  }
  let hueOffset = hashLabel(label) % 360;
  for (let attempt = 0; attempt < 360; attempt++) {
    const color = hslToHex((hueOffset + attempt * 37) % 360, 68, 45);
    if (!used.has(color.toLowerCase())) return color;
  }
  return hslToHex(hashLabel(label) % 360, 68, 45);
}

export async function ensureUniqueCatalogColors(ctx: MutationCtx): Promise<boolean> {
  const entries = await ctx.db
    .query("opsHubResponsibilityCatalog")
    .collect();
  entries.sort((a, b) => a.createdAt - b.createdAt);

  const used = new Set<string>();
  let changed = false;
  for (const entry of entries) {
    if (!used.has(entry.color.toLowerCase())) {
      used.add(entry.color.toLowerCase());
      continue;
    }
    const color = pickUniqueResponsibilityColor(used, entry.label);
    await ctx.db.patch(entry._id, { color });
    used.add(color.toLowerCase());
    changed = true;
  }
  return changed;
}

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

  const catalog = await ctx.db.query("opsHubResponsibilityCatalog").collect();
  const color = pickUniqueResponsibilityColor(
    catalog.map((e) => e.color),
    trimmed,
  );

  await ctx.db.insert("opsHubResponsibilityCatalog", {
    label: trimmed,
    color,
    createdAt: Date.now(),
  });

  return { label: trimmed, color };
}

export type ResponsibilityRole = "main" | "backup";

export type ProfileResponsibility = {
  label: string;
  color: string;
  role: ResponsibilityRole;
};

export type ProfileResponsibilityInput = {
  label: string;
  role: ResponsibilityRole;
};

export function normalizeResponsibilityRole(
  role: ResponsibilityRole | undefined,
): ResponsibilityRole {
  return role ?? "main";
}

export async function resolveProfileResponsibilities(
  ctx: MutationCtx,
  items: ProfileResponsibilityInput[],
): Promise<ProfileResponsibility[]> {
  await ensureUniqueCatalogColors(ctx);

  const seen = new Set<string>();
  const resolved: ProfileResponsibility[] = [];

  for (const item of items) {
    const trimmed = item.label.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = await getOrCreateCatalogEntry(ctx, trimmed);
    resolved.push({
      label: entry.label,
      color: entry.color,
      role: normalizeResponsibilityRole(item.role),
    });
  }

  return resolved;
}

export async function listCatalogLabels(ctx: QueryCtx): Promise<string[]> {
  const entries = await ctx.db.query("opsHubResponsibilityCatalog").collect();
  return entries
    .map((e) => e.label)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
