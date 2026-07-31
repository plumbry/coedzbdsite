import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { generateMapId } from "../lib/maps/id";
import { validateMapBoxes, validateMapTexts } from "../lib/maps/validation";

const mapBoxValidator = v.object({
  id: v.string(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  label: v.string(),
  color: v.optional(v.string()),
});

const mapTextValidator = v.object({
  id: v.string(),
  x: v.number(),
  y: v.number(),
  text: v.string(),
  color: v.optional(v.string()),
});

async function findMapByPublicId(ctx: MutationCtx, mapId: string) {
  return await ctx.db
    .query("sharedMaps")
    .withIndex("by_map_id", (q) => q.eq("mapId", mapId))
    .first();
}

async function allocateUniqueMapId(ctx: MutationCtx): Promise<string> {
  let mapId = generateMapId();
  let attempts = 0;

  while (attempts < 10) {
    const existing = await findMapByPublicId(ctx, mapId);
    if (!existing) return mapId;
    mapId = generateMapId();
    attempts++;
  }

  const collision = await findMapByPublicId(ctx, mapId);
  if (collision) {
    throw new ConvexError("Failed to generate a unique map id");
  }
  return mapId;
}

export const createMap = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const mapId = await allocateUniqueMapId(ctx);

    await ctx.db.insert("sharedMaps", {
      mapId,
      baseMapId: "simpsons-reload",
      boxes: [],
      texts: [],
      createdAt: now,
      updatedAt: now,
    });

    return { mapId, updatedAt: now };
  },
});

/**
 * Persist the current editor state as a *new* shareable map.
 * The source map is left unchanged so existing links stay frozen.
 */
export const saveMap = mutation({
  args: {
    sourceMapId: v.string(),
    boxes: v.array(mapBoxValidator),
    texts: v.array(mapTextValidator),
  },
  handler: async (ctx, args) => {
    const source = await findMapByPublicId(ctx, args.sourceMapId);
    const baseMapId = source?.baseMapId ?? "simpsons-reload";
    const boxes = validateMapBoxes(args.boxes);
    const texts = validateMapTexts(args.texts);
    const now = Date.now();
    const mapId = await allocateUniqueMapId(ctx);

    await ctx.db.insert("sharedMaps", {
      mapId,
      baseMapId,
      boxes,
      texts,
      createdAt: now,
      updatedAt: now,
    });

    return {
      ok: true as const,
      mapId,
      updatedAt: now,
      boxes,
      texts,
    };
  },
});
