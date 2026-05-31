import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireAdmin } from "./auth_helpers";

const MAX_CHAT_MESSAGES = 500;

export const getMessages = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user || user.role !== "admin") {
      return [];
    }

    // Get the 50 most recent messages
    const messages = await ctx.db
      .query("chatMessages")
      .order("desc")
      .take(50);

    return messages.reverse();
  },
});

export const sendMessage = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);

    const trimmedText = args.text.trim();
    if (!trimmedText) {
      return null;
    }

    const messageId = await ctx.db.insert("chatMessages", {
      userId: user._id,
      userName: user.name || user.email || "Admin",
      text: trimmedText,
    });

    return messageId;
  },
});

export const pruneOldChatMessages = internalMutation({
  args: {},
  handler: async (ctx) => {
    const messages = await ctx.db.query("chatMessages").order("desc").collect();
    if (messages.length <= MAX_CHAT_MESSAGES) {
      return { deleted: 0 };
    }
    const toDelete = messages.slice(MAX_CHAT_MESSAGES);
    for (const msg of toDelete) {
      await ctx.db.delete(msg._id);
    }
    return { deleted: toDelete.length };
  },
});
