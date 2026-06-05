import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Public API endpoint to get member info by Discord ID
http.route({
  path: "/api/member",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const discordId = url.searchParams.get("discordId");
    
    if (!discordId) {
      return new Response(
        JSON.stringify({ error: "Missing required query parameter: discordId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Look up member by Discord ID
    const member = await ctx.runQuery(internal.memberManagement.getMemberByDiscordId, {
      discordId,
    });
    
    if (!member) {
      return new Response(
        JSON.stringify({ error: "Member not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({
        tier: member.tier,
        evaluation: {
          Gender: member.evaluationGender,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }),
});

// Webhook endpoint for Discord bot to sync member data.
// Uses upsertDiscordMember (indexed lookups only — safe for high-volume per-member calls).
http.route({
  path: "/api/discord/sync-member",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Verify API key (try both possible env var names)
    const apiKey = process.env.DISCORD_SYNC_API_KEY || process.env.API_KEY;
    const authHeader = request.headers.get("Authorization");
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error: API key not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    
    if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid API key" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    
    try {
      const body = await request.json();
      
      // Validate required fields
      if (!body.id || !body.username) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: id and username" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      
      // Debug: log what date we're receiving
      console.log(`Syncing ${body.username}: joined_at = ${body.joined_at}`);
      
      // Call internal mutation to upsert the Discord member
      await ctx.runMutation(internal.discord.upsertDiscordMember, {
        discordUserId: body.id,
        discordUsername: body.username,
        nickname: body.nickname || null,
        joinedAt: body.joined_at || new Date().toISOString(),
        roles: body.roles || null,
      });
      
      return new Response(
        JSON.stringify({ success: true, message: "Member synced successfully" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error syncing Discord member:", error);
      return new Response(
        JSON.stringify({ 
          error: "Internal server error", 
          message: error instanceof Error ? error.message : "Unknown error" 
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// Retired: archive-missing ran a full players scan per webhook call.
// Missing members are archived during the daily Discord member sync cron instead.
http.route({
  path: "/api/discord/archive-missing",
  method: "POST",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        error: "Endpoint retired",
        message:
          "Archive missing members is handled by the daily Discord member sync (05:00 UTC). Remove calls to this endpoint from the bot.",
      }),
      { status: 410, headers: { "Content-Type": "application/json" } },
    );
  }),
});

// POST endpoint for Discord bot to create scrim events
http.route({
  path: "/api/scrim-events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Verify API key
    const apiKey = process.env.DISCORD_SYNC_API_KEY || process.env.API_KEY;
    const authHeader = request.headers.get("Authorization");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error: API key not set" }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid API key" }),
        { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    try {
      const body = await request.json();

      // Validate required fields
      if (!body.eventName || !body.eventType || !body.teams || !Array.isArray(body.teams)) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: eventName, eventType, teams" }),
          { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        );
      }

      if (body.teams.length < 2) {
        return new Response(
          JSON.stringify({ error: "At least 2 teams are required" }),
          { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        );
      }

      // Validate games count (1-10, default 5)
      const games = Math.min(Math.max(body.games || 5, 1), 10);

      // Generate a secure admin token (32 hex chars)
      const tokenBytes = new Uint8Array(16);
      crypto.getRandomValues(tokenBytes);
      const adminToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");

      // Create the event
      const eventId = await ctx.runMutation(internal.scrims.mutations.createEvent, {
        eventName: body.eventName,
        eventType: body.eventType,
        games,
        teams: body.teams.map((t: { teamName: string; players: string[]; playerTiers?: string[] }) => ({
          teamName: t.teamName || "Unknown Team",
          players: Array.isArray(t.players) ? t.players : [],
          playerTiers: Array.isArray(t.playerTiers) ? t.playerTiers : undefined,
        })),
        solos: Array.isArray(body.solos)
          ? body.solos.map((s: { playerName: string }) => ({
              playerName: s.playerName || "Unknown Player",
            }))
          : undefined,
        leaderboardUrl: typeof body.leaderboardUrl === "string" ? body.leaderboardUrl : undefined,
        discordGuildId: body.discordGuildId || "",
        discordChannelId: body.discordChannelId || "",
        createdByDiscordId: body.createdByDiscordId || "",
        adminToken,
      });

      // Build admin URL (uses the Convex deployment's site URL as base)
      const siteUrl = process.env.SITE_URL || request.url.split("/api/")[0];
      const adminUrl = `${siteUrl}/scrims/events/${eventId}?token=${adminToken}`;

      return new Response(
        JSON.stringify({
          eventId,
          adminToken,
          adminUrl,
        }),
        { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    } catch (error) {
      console.error("Error creating scrim event:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }
  }),
});

// POST endpoint for Discord bot to link teams to an existing shell event via link code
http.route({
  path: "/api/scrim-events/link",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const apiKey = process.env.DISCORD_SYNC_API_KEY || process.env.API_KEY;
    const authHeader = request.headers.get("Authorization");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error: API key not set" }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid API key" }),
        { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    try {
      const body = await request.json();

      if (!body.linkCode || !body.teams || !Array.isArray(body.teams)) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: linkCode, teams" }),
          { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        );
      }

      if (body.teams.length < 2) {
        return new Response(
          JSON.stringify({ error: "At least 2 teams are required" }),
          { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        );
      }

      const eventId = await ctx.runMutation(internal.scrims.mutations.linkTeamsToEvent, {
        linkCode: body.linkCode.toUpperCase(),
        teams: body.teams.map((t: { teamName: string; players: string[]; playerTiers?: string[] }) => ({
          teamName: t.teamName || "Unknown Team",
          players: Array.isArray(t.players) ? t.players : [],
          playerTiers: Array.isArray(t.playerTiers) ? t.playerTiers : undefined,
        })),
        solos: Array.isArray(body.solos)
          ? body.solos.map((s: { playerName: string }) => ({
              playerName: s.playerName || "Unknown Player",
            }))
          : undefined,
        discordGuildId: body.discordGuildId || undefined,
        discordChannelId: body.discordChannelId || undefined,
        createdByDiscordId: body.createdByDiscordId || undefined,
      });

      return new Response(
        JSON.stringify({ success: true, eventId }),
        { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = message.includes("No event found") ? 404 : 500;
      return new Response(
        JSON.stringify({ error: message }),
        { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }
  }),
});

// CORS preflight for scrim events link endpoint
http.route({
  path: "/api/scrim-events/link",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }),
});

// CORS preflight for scrim events endpoint
http.route({
  path: "/api/scrim-events",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }),
});

// GET endpoint for Discord bot to poll for pending role syncs (event bans and probations only)
http.route({
  path: "/api/discord/pending-role-syncs",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // Verify API key
    const apiKey = process.env.DISCORD_SYNC_API_KEY || process.env.API_KEY;
    const authHeader = request.headers.get("Authorization");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error: API key not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid API key" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const pendingSyncs = await ctx.runQuery(
        internal.eventBans.queries.getPendingRoleSyncs,
        {}
      );

      return new Response(
        JSON.stringify({ pending: pendingSyncs }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error fetching pending role syncs:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// POST endpoint for Discord bot to acknowledge that role syncs have been processed
http.route({
  path: "/api/discord/acknowledge-role-syncs",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Verify API key
    const apiKey = process.env.DISCORD_SYNC_API_KEY || process.env.API_KEY;
    const authHeader = request.headers.get("Authorization");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error: API key not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid API key" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const body = await request.json();

      if (!body.banIds || !Array.isArray(body.banIds)) {
        return new Response(
          JSON.stringify({ error: "Missing required field: banIds (array of ban IDs)" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await ctx.runMutation(
        internal.eventBans.mutations.acknowledgeRoleSyncs,
        { banIds: body.banIds }
      );

      return new Response(
        JSON.stringify({ success: true, acknowledged: result.acknowledged }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error acknowledging role syncs:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// GET endpoint for Discord bot to poll for roles that should be removed
// Returns bans where: event ban has ENDED, or probation is older than 28 days
http.route({
  path: "/api/discord/pending-role-removals",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    // Verify API key
    const apiKey = process.env.DISCORD_SYNC_API_KEY || process.env.API_KEY;
    const authHeader = request.headers.get("Authorization");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error: API key not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid API key" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const pendingRemovals = await ctx.runQuery(
        internal.eventBans.queries.getPendingRoleRemovals,
        {}
      );

      return new Response(
        JSON.stringify({ pending: pendingRemovals }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error fetching pending role removals:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// GET endpoint for Discord bot — website-evaluated female members (gender = 50)
http.route({
  path: "/api/discord/female-evaluated-members",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const apiKey = process.env.DISCORD_SYNC_API_KEY || process.env.API_KEY;
    const authHeader = request.headers.get("Authorization");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error: API key not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid API key" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const result = await ctx.runQuery(
        internal.discord.femaleEvaluatedMembers.getFemaleEvaluatedDiscordMembers,
        {}
      );

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error fetching female-evaluated members:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// POST endpoint for Discord bot to acknowledge that roles have been removed
http.route({
  path: "/api/discord/acknowledge-role-removals",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Verify API key
    const apiKey = process.env.DISCORD_SYNC_API_KEY || process.env.API_KEY;
    const authHeader = request.headers.get("Authorization");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error: API key not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid API key" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const body = await request.json();

      if (!body.banIds || !Array.isArray(body.banIds)) {
        return new Response(
          JSON.stringify({ error: "Missing required field: banIds (array of ban IDs)" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const result = await ctx.runMutation(
        internal.eventBans.mutations.acknowledgeRoleRemovals,
        { banIds: body.banIds }
      );

      // Also acknowledge any queued pending role removals (from deleted bans)
      let queueAcknowledged = 0;
      if (body.pendingRoleRemovalIds && Array.isArray(body.pendingRoleRemovalIds) && body.pendingRoleRemovalIds.length > 0) {
        const queueResult = await ctx.runMutation(
          internal.eventBans.mutations.acknowledgePendingRoleRemovals,
          { ids: body.pendingRoleRemovalIds }
        );
        queueAcknowledged = queueResult.acknowledged;
      }

      return new Response(
        JSON.stringify({ success: true, acknowledged: result.acknowledged + queueAcknowledged }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error acknowledging role removals:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// Clerk webhook: provision Convex user rows when Clerk accounts are created or sign in
http.route({
  path: "/api/clerk/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      return new Response(
        JSON.stringify({ error: "CLERK_WEBHOOK_SECRET not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const payload = await request.text();
    const msgId = request.headers.get("svix-id");
    const msgTimestamp = request.headers.get("svix-timestamp");
    const msgSignature = request.headers.get("svix-signature");

    if (!msgId || !msgTimestamp || !msgSignature) {
      return new Response(
        JSON.stringify({ error: "Missing Svix headers" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const verified = await verifyClerkWebhook(payload, secret, msgId, msgTimestamp, msgSignature);
    if (!verified) {
      return new Response(
        JSON.stringify({ error: "Invalid webhook signature" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const event = JSON.parse(payload) as {
        type: string;
        data: {
          id?: string;
          user_id?: string;
          username?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          email_addresses?: Array<{ email_address?: string }>;
          external_accounts?: Array<{
            provider?: string;
            provider_user_id?: string;
            username?: string;
          }>;
        };
      };

      if (event.type !== "user.created" && event.type !== "session.created") {
        return new Response(JSON.stringify({ ok: true, ignored: event.type }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const clerkUserId =
        event.type === "session.created" ? event.data.user_id : event.data.id;

      if (!clerkUserId) {
        return new Response(
          JSON.stringify({ error: "Missing Clerk user id in webhook payload" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      const primaryEmail = event.data.email_addresses?.[0]?.email_address;
      const fullName = [event.data.first_name, event.data.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      const discordAccount = event.data.external_accounts?.find(
        (account) =>
          account.provider === "oauth_discord" || account.provider === "discord",
      );

      await ctx.runMutation(internal.userProvisioning.provisionFromClerkData, {
        clerkUserId,
        name: fullName || event.data.username || undefined,
        email: primaryEmail || undefined,
        username: event.data.username || undefined,
        discordUserId:
          discordAccount?.provider_user_id &&
          /^\d{17,20}$/.test(discordAccount.provider_user_id)
            ? discordAccount.provider_user_id
            : undefined,
        discordUsername: discordAccount?.username || undefined,
      });

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Clerk webhook error:", error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Webhook handler failed",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }),
});

async function verifyClerkWebhook(
  payload: string,
  secret: string,
  msgId: string,
  msgTimestamp: string,
  msgSignature: string,
): Promise<boolean> {
  const timestampSeconds = Number(msgTimestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (ageSeconds > 300) {
    return false;
  }

  const secretBytes = decodeSvixSecret(secret);
  if (!secretBytes) {
    return false;
  }

  const signedContent = `${msgId}.${msgTimestamp}.${payload}`;
  const keyMaterial = Uint8Array.from(secretBytes);
  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent),
  );
  const expected = new Uint8Array(signature);
  const expectedB64 = btoa(String.fromCharCode(...expected));

  for (const versionedSignature of msgSignature.split(" ")) {
    const [version, value] = versionedSignature.split(",");
    if (version !== "v1" || !value) {
      continue;
    }
    if (timingSafeEqual(value, expectedB64)) {
      return true;
    }
  }

  return false;
}

function decodeSvixSecret(secret: string): Uint8Array | null {
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// REQUIRED: Export HttpRouter as default from convex/http.ts
export default http;
