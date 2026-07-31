import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { generateMapId } from "../lib/maps/id";
import { validateMapBoxes } from "../lib/maps/validation";

const mapBoxValidator = v.object({
  id: v.string(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  label: v.string(),
});

async function findMapByPublicId(ctx: MutationCtx, mapId: string) {
  return await ctx.db
    .query("sharedMaps")
    .withIndex("by_map_id", (q) => q.eq("mapId", mapId))
    .first();
}

export const createMap = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let mapId = generateMapId();
    let attempts = 0;

    while (attempts < 10) {
      const existing = await findMapByPublicId(ctx, mapId);
      if (!existing) break;
      mapId = generateMapId();
      attempts++;
    }

    const collision = await findMapByPublicId(ctx, mapId);
    if (collision) {
      throw new ConvexError("Failed to generate a unique map id");
    }

    await ctx.db.insert("sharedMaps", {
      mapId,
      baseMapId: "simpsons-reload",
      boxes: [],
      createdAt: now,
      updatedAt: now,
    });

    return { mapId, updatedAt: now };
  },
});

export const saveMap = mutation({
  args: {
    mapId: v.string(),
    expectedUpdatedAt: v.number(),
    boxes: v.array(mapBoxValidator),
  },
  handler: async (ctx, args) => {
    const map = await findMapByPublicId(ctx, args.mapId);
    if (!map) {
      throw new ConvexError("Map not found");
    }

    if (map.updatedAt !== args.expectedUpdatedAt) {
      return {
        ok: false as const,
        reason: "conflict" as const,
        serverUpdatedAt: map.updatedAt,
      };
    }

    const boxes = validateMapBoxes(args.boxes);
    const updatedAt = Date.now();

    await ctx.db.patch(map._id, {
      boxes,
      updatedAt,
    });

    return {
      ok: true as const,
      updatedAt,
      boxes,
    };
  },
});
