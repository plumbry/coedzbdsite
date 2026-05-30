import { query } from "../_generated/server";
import { v } from "convex/values";

// List all scrim events (public - no auth required)
export const listEvents = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("scrimEvents").order("desc").collect();
    // Strip admin tokens from public response
    return events.map(({ adminToken: _token, ...event }) => event);
  },
});

// Get a scrim event by slug (public - no auth required)
export const getEventBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("scrimEvents")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!event) return null;
    // Strip admin token from public response
    const { adminToken: _token, ...publicEvent } = event;
    return publicEvent;
  },
});

// Get a scrim event by ID (public - no auth required)
export const getEvent = query({
  args: { eventId: v.id("scrimEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    // Strip admin token from public response
    const { adminToken: _token, ...publicEvent } = event;
    return publicEvent;
  },
});

// Get a scrim event with admin verification (requires token)
export const getEventAdmin = query({
  args: { eventId: v.id("scrimEvents"), token: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    if (event.adminToken !== args.token) return null;
    return event;
  },
});

// Verify admin code for an event (returns true/false, never exposes the token)
export const verifyAdminCode = query({
  args: { eventId: v.id("scrimEvents"), code: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return false;
    return event.adminToken === args.code;
  },
});

// List events with admin tokens and spin codes (requires site admin auth)
export const listEventsAdmin = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    // Check if user is a site admin
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || user.role !== "admin") return [];
    const events = await ctx.db.query("scrimEvents").order("desc").collect();
    return events.map((e) => ({
      _id: e._id,
      eventName: e.eventName,
      adminToken: e.adminToken,
      slug: e.slug,
      _creationTime: e._creationTime,
    }));
  },
});
