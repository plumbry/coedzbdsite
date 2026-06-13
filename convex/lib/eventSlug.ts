import type { Id } from "../_generated/dataModel.d.ts";
import type { MutationCtx } from "../_generated/server";

/** Convert an event name to a URL-friendly slug */
export function eventNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Generate a unique slug for calendar events, appending a short suffix if needed */
export async function generateUniqueEventSlug(
  ctx: MutationCtx,
  baseName: string,
  excludeEventId?: Id<"events">,
): Promise<string> {
  const baseSlug = eventNameToSlug(baseName);
  if (!baseSlug) return `event-${Date.now().toString(36)}`;

  const existing = await ctx.db
    .query("events")
    .withIndex("by_slug", (q) => q.eq("slug", baseSlug))
    .first();

  if (!existing || (excludeEventId && existing._id === excludeEventId)) {
    return baseSlug;
  }

  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  for (let attempt = 0; attempt < 10; attempt++) {
    let suffix = "";
    for (let i = 0; i < 4; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    const candidate = `${baseSlug}-${suffix}`;
    const collision = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .first();
    if (!collision || (excludeEventId && collision._id === excludeEventId)) {
      return candidate;
    }
  }

  return `${baseSlug}-${Date.now().toString(36)}`;
}
