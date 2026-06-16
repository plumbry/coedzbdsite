import { mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { resolveResponsibilityLabels } from "./responsibilityCatalog";
import {
  auditFields,
  requireOpsHubWriteAccess,
  updateAuditFields,
  viewerTokenArg,
} from "./access";

const sponsorStatusValidator = v.union(
  v.literal("unused"),
  v.literal("assigned"),
  v.literal("paid_out"),
);

const ruleTypeValidator = v.union(
  v.literal("rule_set"),
  v.literal("event_override"),
  v.literal("prize"),
  v.literal("lobby"),
  v.literal("drop_spot"),
);

const todoPriorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

const todoStatusValidator = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("done"),
);

// ─── Sponsor Log ────────────────────────────────────────────────────────────

export const createSponsorLog = mutation({
  args: {
    viewerToken: viewerTokenArg,
    sponsorName: v.string(),
    amount: v.number(),
    dateReceived: v.optional(v.string()),
    intendedEvent: v.optional(v.string()),
    paymentSource: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: sponsorStatusValidator,
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const now = Date.now();
    const { viewerToken: _, ...fields } = args;
    return await ctx.db.insert("opsHubSponsorLogs", {
      ...fields,
      ...auditFields(access, now),
    });
  },
});

export const updateSponsorLog = mutation({
  args: {
    viewerToken: viewerTokenArg,
    id: v.id("opsHubSponsorLogs"),
    sponsorName: v.string(),
    amount: v.number(),
    dateReceived: v.optional(v.string()),
    intendedEvent: v.optional(v.string()),
    paymentSource: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: sponsorStatusValidator,
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const { id, viewerToken: _, ...fields } = args;
    await ctx.db.patch(id, {
      ...fields,
      ...updateAuditFields(access, Date.now()),
    });
  },
});

export const deleteSponsorLog = mutation({
  args: { viewerToken: viewerTokenArg, id: v.id("opsHubSponsorLogs") },
  handler: async (ctx, args) => {
    await requireOpsHubWriteAccess(ctx);
    await ctx.db.delete(args.id);
  },
});

// ─── Event Rules ────────────────────────────────────────────────────────────

export const createEventRule = mutation({
  args: {
    viewerToken: viewerTokenArg,
    name: v.string(),
    ruleType: ruleTypeValidator,
    eventName: v.optional(v.string()),
    content: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const now = Date.now();
    const { viewerToken: _, ...fields } = args;
    return await ctx.db.insert("opsHubEventRules", {
      ...fields,
      ...auditFields(access, now),
    });
  },
});

export const updateEventRule = mutation({
  args: {
    viewerToken: viewerTokenArg,
    id: v.id("opsHubEventRules"),
    name: v.string(),
    ruleType: ruleTypeValidator,
    eventName: v.optional(v.string()),
    content: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const { id, viewerToken: _, ...fields } = args;
    await ctx.db.patch(id, {
      ...fields,
      ...updateAuditFields(access, Date.now()),
    });
  },
});

export const deleteEventRule = mutation({
  args: { viewerToken: viewerTokenArg, id: v.id("opsHubEventRules") },
  handler: async (ctx, args) => {
    await requireOpsHubWriteAccess(ctx);
    await ctx.db.delete(args.id);
  },
});

// ─── Kill Caps ──────────────────────────────────────────────────────────────

export const createKillCap = mutation({
  args: {
    viewerToken: viewerTokenArg,
    mode: v.string(),
    lobbyType: v.string(),
    teamSizeTier: v.string(),
    killCap: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const now = Date.now();
    const { viewerToken: _, ...fields } = args;
    return await ctx.db.insert("opsHubKillCaps", {
      ...fields,
      ...auditFields(access, now),
    });
  },
});

export const updateKillCap = mutation({
  args: {
    viewerToken: viewerTokenArg,
    id: v.id("opsHubKillCaps"),
    mode: v.string(),
    lobbyType: v.string(),
    teamSizeTier: v.string(),
    killCap: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const { id, viewerToken: _, ...fields } = args;
    await ctx.db.patch(id, {
      ...fields,
      ...updateAuditFields(access, Date.now()),
    });
  },
});

export const deleteKillCap = mutation({
  args: { viewerToken: viewerTokenArg, id: v.id("opsHubKillCaps") },
  handler: async (ctx, args) => {
    await requireOpsHubWriteAccess(ctx);
    await ctx.db.delete(args.id);
  },
});

// ─── Mod Details ────────────────────────────────────────────────────────────

export const createModDetail = mutation({
  args: {
    viewerToken: viewerTokenArg,
    modName: v.string(),
    discordId: v.optional(v.string()),
    payPalDetails: v.optional(v.string()),
    responsibilities: v.optional(v.string()),
    availabilityNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const now = Date.now();
    const { viewerToken: _, ...fields } = args;
    return await ctx.db.insert("opsHubModDetails", {
      ...fields,
      ...auditFields(access, now),
    });
  },
});

export const updateModDetail = mutation({
  args: {
    viewerToken: viewerTokenArg,
    id: v.id("opsHubModDetails"),
    modName: v.string(),
    discordId: v.optional(v.string()),
    payPalDetails: v.optional(v.string()),
    responsibilities: v.optional(v.string()),
    availabilityNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const { id, viewerToken: _, ...fields } = args;
    await ctx.db.patch(id, {
      ...fields,
      ...updateAuditFields(access, Date.now()),
    });
  },
});

export const deleteModDetail = mutation({
  args: { viewerToken: viewerTokenArg, id: v.id("opsHubModDetails") },
  handler: async (ctx, args) => {
    await requireOpsHubWriteAccess(ctx);
    await ctx.db.delete(args.id);
  },
});

// ─── Ticket Reply Templates ─────────────────────────────────────────────────

export const createTicketReplyTemplate = mutation({
  args: {
    viewerToken: viewerTokenArg,
    category: v.string(),
    situation: v.string(),
    responseText: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const now = Date.now();
    const { viewerToken: _, ...fields } = args;
    return await ctx.db.insert("opsHubTicketReplyTemplates", {
      ...fields,
      ...auditFields(access, now),
    });
  },
});

export const updateTicketReplyTemplate = mutation({
  args: {
    viewerToken: viewerTokenArg,
    id: v.id("opsHubTicketReplyTemplates"),
    category: v.string(),
    situation: v.string(),
    responseText: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const { id, viewerToken: _, ...fields } = args;
    await ctx.db.patch(id, {
      ...fields,
      ...updateAuditFields(access, Date.now()),
    });
  },
});

export const deleteTicketReplyTemplate = mutation({
  args: { viewerToken: viewerTokenArg, id: v.id("opsHubTicketReplyTemplates") },
  handler: async (ctx, args) => {
    await requireOpsHubWriteAccess(ctx);
    await ctx.db.delete(args.id);
  },
});

// ─── Staff profiles & responsibilities ──────────────────────────────────────

export const createStaffProfile = mutation({
  args: {
    viewerToken: viewerTokenArg,
    person: v.string(),
    responsibilityLabels: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const now = Date.now();
    const person = args.person.trim();
    if (!person) {
      throw new ConvexError({
        message: "Person name is required",
        code: "INVALID_ARGUMENT",
      });
    }

    const responsibilities = await resolveResponsibilityLabels(
      ctx,
      args.responsibilityLabels,
    );

    return await ctx.db.insert("opsHubStaffProfiles", {
      person,
      responsibilities,
      ...auditFields(access, now),
    });
  },
});

export const updateStaffProfile = mutation({
  args: {
    viewerToken: viewerTokenArg,
    id: v.id("opsHubStaffProfiles"),
    person: v.string(),
    responsibilityLabels: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const person = args.person.trim();
    if (!person) {
      throw new ConvexError({
        message: "Person name is required",
        code: "INVALID_ARGUMENT",
      });
    }

    const responsibilities = await resolveResponsibilityLabels(
      ctx,
      args.responsibilityLabels,
    );

    const { id, viewerToken: _, ..._rest } = args;
    await ctx.db.patch(id, {
      person,
      responsibilities,
      ...updateAuditFields(access, Date.now()),
    });
  },
});

export const deleteStaffProfile = mutation({
  args: { viewerToken: viewerTokenArg, id: v.id("opsHubStaffProfiles") },
  handler: async (ctx, args) => {
    await requireOpsHubWriteAccess(ctx);
    await ctx.db.delete(args.id);
  },
});

// ─── To-do List ─────────────────────────────────────────────────────────────

export const createTodo = mutation({
  args: {
    viewerToken: viewerTokenArg,
    task: v.string(),
    owner: v.optional(v.string()),
    priority: todoPriorityValidator,
    dueDate: v.optional(v.string()),
    status: todoStatusValidator,
    linkedEvent: v.optional(v.string()),
    linkedTicket: v.optional(v.string()),
    linkedPlayer: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const now = Date.now();
    const { viewerToken: _, ...fields } = args;
    return await ctx.db.insert("opsHubTodos", {
      ...fields,
      ...auditFields(access, now),
    });
  },
});

export const updateTodo = mutation({
  args: {
    viewerToken: viewerTokenArg,
    id: v.id("opsHubTodos"),
    task: v.string(),
    owner: v.optional(v.string()),
    priority: todoPriorityValidator,
    dueDate: v.optional(v.string()),
    status: todoStatusValidator,
    linkedEvent: v.optional(v.string()),
    linkedTicket: v.optional(v.string()),
    linkedPlayer: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const { id, viewerToken: _, ...fields } = args;
    await ctx.db.patch(id, {
      ...fields,
      ...updateAuditFields(access, Date.now()),
    });
  },
});

export const deleteTodo = mutation({
  args: { viewerToken: viewerTokenArg, id: v.id("opsHubTodos") },
  handler: async (ctx, args) => {
    await requireOpsHubWriteAccess(ctx);
    await ctx.db.delete(args.id);
  },
});

// ─── VOD / Evidence Policy (singleton) ──────────────────────────────────────

export const upsertVodEvidencePolicy = mutation({
  args: {
    viewerToken: viewerTokenArg,
    streamingRequirements: v.optional(v.string()),
    futureUploadRequirements: v.optional(v.string()),
    evidenceRetentionRules: v.optional(v.string()),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireOpsHubWriteAccess(ctx);
    const now = Date.now();
    const { viewerToken: _, ...fields } = args;
    const existing = await ctx.db.query("opsHubVodEvidencePolicy").first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...fields,
        ...updateAuditFields(access, now),
      });
      return existing._id;
    }

    return await ctx.db.insert("opsHubVodEvidencePolicy", {
      ...fields,
      ...auditFields(access, now),
    });
  },
});
