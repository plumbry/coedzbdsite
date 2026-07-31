import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { generateMapId } from "../lib/maps/id";
import {
  validateMapBoxes,
  validateMapPolygons,
  validateMapTexts,
} from "../lib/maps/validation";

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

const mapPolygonValidator = v.object({
  id: v.string(),
  points: v.array(
    v.object({
      x: v.number(),
      y: v.number(),
    }),
  ),
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
      polygons: [],
      createdAt: now,
      updatedAt: now,
    });

    return { mapId, updatedAt: now };
  },
});

/**
 * Persist the current editor state as a *new* shareable map.
 * Optional sourceMapId only copies baseMapId; the source row is never mutated
 * so existing share links stay frozen. Omit sourceMapId when publishing from
 * the /maps/new scratchpad.
 */
export const saveMap = mutation({
  args: {
    sourceMapId: v.optional(v.string()),
    boxes: v.array(mapBoxValidator),
    texts: v.array(mapTextValidator),
    polygons: v.optional(v.array(mapPolygonValidator)),
  },
  handler: async (ctx, args) => {
    const source = args.sourceMapId
      ? await findMapByPublicId(ctx, args.sourceMapId)
      : null;
    const baseMapId = source?.baseMapId ?? "simpsons-reload";
    const boxes = validateMapBoxes(args.boxes);
    const texts = validateMapTexts(args.texts);
    const polygons = validateMapPolygons(args.polygons ?? []);
    const now = Date.now();
    const mapId = await allocateUniqueMapId(ctx);

    await ctx.db.insert("sharedMaps", {
      mapId,
      baseMapId,
      boxes,
      texts,
      polygons,
      createdAt: now,
      updatedAt: now,
    });

    return {
      ok: true as const,
      mapId,
      updatedAt: now,
      boxes,
      texts,
      polygons,
    };
  },
});
