import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";

// Public mutation to create a support ticket
export const createTicket = mutation({
  args: {
    discordUsername: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate inputs
    if (!args.discordUsername.trim()) {
      throw new ConvexError({
        message: "Discord username is required",
        code: "BAD_REQUEST",
      });
    }
    
    if (!args.message.trim()) {
      throw new ConvexError({
        message: "Message is required",
        code: "BAD_REQUEST",
      });
    }
    
    // Create the ticket
    const ticketId = await ctx.db.insert("supportTickets", {
      discordUsername: args.discordUsername.trim(),
      message: args.message.trim(),
      status: "active",
    });
    
    return ticketId;
  },
});

// Admin/Moderator query to get all active tickets
export const getActiveTickets = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      return [];
    }
    
    const tickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .collect();
    
    return tickets;
  },
});

// Admin/Moderator query to get all archived tickets
export const getArchivedTickets = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      return [];
    }
    
    const tickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_status", (q) => q.eq("status", "archived"))
      .order("desc")
      .collect();
    
    return tickets;
  },
});

// Paginated archived tickets (newest first)
export const getArchivedTicketsPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    return await ctx.db
      .query("supportTickets")
      .withIndex("by_status", (q) => q.eq("status", "archived"))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

// Admin/Moderator mutation to archive a ticket
export const archiveTicket = mutation({
  args: {
    ticketId: v.id("supportTickets"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || (user.role !== "admin" && user.role !== "event_mod")) {
      throw new ConvexError({
        message: "Only admins and moderators can archive tickets",
        code: "FORBIDDEN",
      });
    }
    
    await ctx.db.patch(args.ticketId, {
      status: "archived",
      archivedBy: user._id,
      archivedAt: Date.now(),
    });
    
    return { success: true };
  },
});

// Admin-only mutation to delete a ticket
export const deleteTicket = mutation({
  args: {
    ticketId: v.id("supportTickets"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    
    if (!user || user.role !== "admin") {
      throw new ConvexError({
        message: "Only admins can delete tickets",
        code: "FORBIDDEN",
      });
    }
    
    await ctx.db.delete(args.ticketId);
    
    return { success: true };
  },
});
