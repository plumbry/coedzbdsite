import { query } from "../_generated/server";
import { requireOpsHubReadAccess, viewerTokenArg } from "./access";

export const listSponsorLogs = query({
  args: { viewerToken: viewerTokenArg },
  handler: async (ctx, args) => {
    await requireOpsHubReadAccess(ctx, args.viewerToken);
    return await ctx.db.query("opsHubSponsorLogs").order("desc").collect();
  },
});

export const listEventRules = query({
  args: { viewerToken: viewerTokenArg },
  handler: async (ctx, args) => {
    await requireOpsHubReadAccess(ctx, args.viewerToken);
    return await ctx.db.query("opsHubEventRules").order("desc").collect();
  },
});

export const listKillCaps = query({
  args: { viewerToken: viewerTokenArg },
  handler: async (ctx, args) => {
    await requireOpsHubReadAccess(ctx, args.viewerToken);
    return await ctx.db.query("opsHubKillCaps").order("desc").collect();
  },
});

export const listModDetails = query({
  args: { viewerToken: viewerTokenArg },
  handler: async (ctx, args) => {
    await requireOpsHubReadAccess(ctx, args.viewerToken);
    return await ctx.db.query("opsHubModDetails").order("desc").collect();
  },
});

export const listTicketReplyTemplates = query({
  args: { viewerToken: viewerTokenArg },
  handler: async (ctx, args) => {
    await requireOpsHubReadAccess(ctx, args.viewerToken);
    return await ctx.db.query("opsHubTicketReplyTemplates").order("desc").collect();
  },
});

export const listStaffProfiles = query({
  args: { viewerToken: viewerTokenArg },
  handler: async (ctx, args) => {
    await requireOpsHubReadAccess(ctx, args.viewerToken);
    return await ctx.db.query("opsHubStaffProfiles").order("desc").collect();
  },
});

export const listResponsibilityCatalog = query({
  args: { viewerToken: viewerTokenArg },
  handler: async (ctx, args) => {
    await requireOpsHubReadAccess(ctx, args.viewerToken);
    const entries = await ctx.db.query("opsHubResponsibilityCatalog").collect();
    return entries.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
  },
});

export const listTodos = query({
  args: { viewerToken: viewerTokenArg },
  handler: async (ctx, args) => {
    await requireOpsHubReadAccess(ctx, args.viewerToken);
    return await ctx.db.query("opsHubTodos").order("desc").collect();
  },
});

export const getVodEvidencePolicy = query({
  args: { viewerToken: viewerTokenArg },
  handler: async (ctx, args) => {
    await requireOpsHubReadAccess(ctx, args.viewerToken);
    return await ctx.db.query("opsHubVodEvidencePolicy").first();
  },
});
