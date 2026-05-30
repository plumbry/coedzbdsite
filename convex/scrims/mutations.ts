import { internalMutation, mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

/** Convert an event name to a URL-friendly slug */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Generate a unique slug, appending a short suffix if needed */
async function generateUniqueSlug(
  ctx: MutationCtx,
  baseName: string,
): Promise<string> {
  const baseSlug = toSlug(baseName);
  if (!baseSlug) return `event-${Date.now().toString(36)}`;
  const existing = await ctx.db
    .query("scrimEvents")
    .withIndex("by_slug", (q) => q.eq("slug", baseSlug))
    .first();
  if (!existing) return baseSlug;
  // Append a short random suffix to make it unique
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${baseSlug}-${suffix}`;
}

// Internal mutation to create a scrim event (called from HTTP action)
export const createEvent = internalMutation({
  args: {
    eventName: v.string(),
    eventType: v.string(),
    games: v.number(),
    teams: v.array(v.object({
      teamName: v.string(),
      players: v.array(v.string()),
      playerTiers: v.optional(v.array(v.string())),
      isFill: v.optional(v.boolean()),
    })),
    solos: v.optional(v.array(v.object({
      playerName: v.string(),
    }))),
    leaderboardUrl: v.optional(v.string()),
    discordGuildId: v.optional(v.string()),
    discordChannelId: v.optional(v.string()),
    createdByDiscordId: v.optional(v.string()),
    linkCode: v.optional(v.string()),
    adminToken: v.string(),
  },
  handler: async (ctx, args) => {
    const slug = await generateUniqueSlug(ctx, args.eventName);
    const eventId = await ctx.db.insert("scrimEvents", {
      eventName: args.eventName,
      eventType: args.eventType,
      games: args.games,
      teams: args.teams,
      solos: args.solos,
      leaderboardUrl: args.leaderboardUrl,
      discordGuildId: args.discordGuildId,
      discordChannelId: args.discordChannelId,
      createdByDiscordId: args.createdByDiscordId,
      linkCode: args.linkCode,
      adminToken: args.adminToken,
      slug,
    });
    return eventId;
  },
});

// Generate a short 6-char alphanumeric code
function generateLinkCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Create a shell event from the web UI (no teams yet, just name + settings + link code)
export const createShellEvent = mutation({
  args: {
    eventName: v.string(),
    eventType: v.string(),
    games: v.number(),
  },
  handler: async (ctx, args) => {
    // Generate a unique link code
    let linkCode = generateLinkCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await ctx.db
        .query("scrimEvents")
        .withIndex("by_link_code", (q) => q.eq("linkCode", linkCode))
        .first();
      if (!existing) break;
      linkCode = generateLinkCode();
      attempts++;
    }

    // Generate admin token
    const tokenChars = "abcdef0123456789";
    let adminToken = "";
    for (let i = 0; i < 32; i++) {
      adminToken += tokenChars[Math.floor(Math.random() * tokenChars.length)];
    }

    // Generate URL-friendly slug from event name
    const slug = await generateUniqueSlug(ctx, args.eventName);

    const eventId = await ctx.db.insert("scrimEvents", {
      eventName: args.eventName,
      eventType: args.eventType,
      games: Math.min(Math.max(args.games, 1), 10),
      teams: [],
      linkCode,
      adminToken,
      slug,
    });

    return { eventId, linkCode, slug };
  },
});

// Internal mutation: link Discord teams to an existing shell event by link code
export const linkTeamsToEvent = internalMutation({
  args: {
    linkCode: v.string(),
    teams: v.array(v.object({
      teamName: v.string(),
      players: v.array(v.string()),
      playerTiers: v.optional(v.array(v.string())),
      isFill: v.optional(v.boolean()),
    })),
    solos: v.optional(v.array(v.object({
      playerName: v.string(),
    }))),
    discordGuildId: v.optional(v.string()),
    discordChannelId: v.optional(v.string()),
    createdByDiscordId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("scrimEvents")
      .withIndex("by_link_code", (q) => q.eq("linkCode", args.linkCode))
      .first();
    if (!event) {
      throw new ConvexError({ message: "No event found with that link code", code: "NOT_FOUND" });
    }
    await ctx.db.patch(event._id, {
      teams: args.teams,
      solos: args.solos,
      discordGuildId: args.discordGuildId,
      discordChannelId: args.discordChannelId,
      createdByDiscordId: args.createdByDiscordId,
    });
    return event._id;
  },
});

// Save generated pairings (requires admin token or open access)
export const savePairings = mutation({
  args: {
    eventId: v.id("scrimEvents"),
    token: v.optional(v.string()),
    pairings: v.array(v.object({
      game: v.number(),
      squads: v.array(v.object({
        duo1Index: v.number(),
        duo2Index: v.number(),
      })),
      byeTeamIndex: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.eventId, { pairings: args.pairings });
  },
});

// Clear pairings (reset)
export const clearPairings = mutation({
  args: {
    eventId: v.id("scrimEvents"),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.eventId, { pairings: undefined, lockedGames: undefined });
  },
});

// Toggle lock on a specific game
export const toggleGameLock = mutation({
  args: {
    eventId: v.id("scrimEvents"),
    token: v.optional(v.string()),
    gameNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    const currentLocked = event.lockedGames ?? [];
    const isLocked = currentLocked.includes(args.gameNumber);
    const newLocked = isLocked
      ? currentLocked.filter((g) => g !== args.gameNumber)
      : [...currentLocked, args.gameNumber];
    await ctx.db.patch(args.eventId, { lockedGames: newLocked });
  },
});

// Update the leaderboard URL for a scrim event
export const setLeaderboardUrl = mutation({
  args: {
    eventId: v.id("scrimEvents"),
    token: v.optional(v.string()),
    leaderboardUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.eventId, {
      leaderboardUrl: args.leaderboardUrl || undefined,
    });
  },
});

// Set or update the admin code for an event
export const setAdminCode = mutation({
  args: {
    eventId: v.id("scrimEvents"),
    adminCode: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    const code = args.adminCode.trim();
    if (!code) {
      throw new ConvexError({ message: "Code cannot be empty", code: "BAD_REQUEST" });
    }
    await ctx.db.patch(args.eventId, {
      adminToken: code,
    });
  },
});

// Swap a fill team in for a dropped team
export const swapFillTeam = mutation({
  args: {
    eventId: v.id("scrimEvents"),
    token: v.optional(v.string()),
    fillTeamIndex: v.number(),
    droppedTeamIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    const teams = [...event.teams];
    const fillTeam = teams[args.fillTeamIndex];
    const droppedTeam = teams[args.droppedTeamIndex];
    if (!fillTeam || !droppedTeam) {
      throw new ConvexError({ message: "Invalid team index", code: "BAD_REQUEST" });
    }
    if (!fillTeam.isFill) {
      throw new ConvexError({ message: "Selected team is not a fill team", code: "BAD_REQUEST" });
    }
    if (droppedTeam.isFill) {
      throw new ConvexError({ message: "Cannot swap out a fill team", code: "BAD_REQUEST" });
    }
    // The fill team takes the dropped team's slot (becomes active)
    // The dropped team becomes a fill (benched/dropped)
    teams[args.fillTeamIndex] = { ...fillTeam, isFill: undefined };
    teams[args.droppedTeamIndex] = { ...droppedTeam, isFill: true };
    await ctx.db.patch(args.eventId, { teams });
  },
});

// Update event details (name, type, games)
export const updateEvent = mutation({
  args: {
    eventId: v.id("scrimEvents"),
    token: v.optional(v.string()),
    eventName: v.optional(v.string()),
    eventType: v.optional(v.string()),
    games: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    const updates: Record<string, string | number> = {};
    if (args.eventName !== undefined) updates.eventName = args.eventName;
    if (args.eventType !== undefined) updates.eventType = args.eventType;
    if (args.games !== undefined) updates.games = Math.min(Math.max(args.games, 1), 10);
    await ctx.db.patch(args.eventId, updates);
  },
});

// Delete event entirely
export const deleteEvent = mutation({
  args: {
    eventId: v.id("scrimEvents"),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    await ctx.db.delete(args.eventId);
  },
});

// Clear all teams (and solos) from an event, resetting it to shell state
export const clearTeams = mutation({
  args: {
    eventId: v.id("scrimEvents"),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.eventId, {
      teams: [],
      solos: undefined,
      pairings: undefined,
      numberAssignments: undefined,
      lockedGames: undefined,
    });
  },
});

// Save number assignments for "number_only" events (ordered team indices from wheel spin)
export const saveNumberAssignments = mutation({
  args: {
    eventId: v.id("scrimEvents"),
    token: v.optional(v.string()),
    assignments: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.eventId, { numberAssignments: args.assignments });
  },
});

// Clear number assignments (reset)
export const clearNumberAssignments = mutation({
  args: {
    eventId: v.id("scrimEvents"),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.eventId, { numberAssignments: undefined });
  },
});

// Save pairings for a single game
export const saveSingleGamePairing = mutation({
  args: {
    eventId: v.id("scrimEvents"),
    token: v.optional(v.string()),
    gameNumber: v.number(),
    pairing: v.object({
      game: v.number(),
      squads: v.array(v.object({
        duo1Index: v.number(),
        duo2Index: v.number(),
      })),
      byeTeamIndex: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      throw new ConvexError({ message: "Event not found", code: "NOT_FOUND" });
    }
    const lockedGames = event.lockedGames ?? [];
    if (lockedGames.includes(args.gameNumber)) {
      throw new ConvexError({ message: "Cannot regenerate a locked game", code: "FORBIDDEN" });
    }
    const currentPairings = event.pairings ?? [];
    const updatedPairings = currentPairings.map((p) =>
      p.game === args.gameNumber ? args.pairing : p
    );
    await ctx.db.patch(args.eventId, { pairings: updatedPairings });
  },
});
