"use node";

import { v } from "convex/values";
import { createHmac } from "crypto";
import { internalAction } from "../_generated/server";

const EVENT_TYPE = "evaluation_changed";

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Push evaluation changes to the Discord bot (event-driven role sync). */
export const notifyEvaluationChanged = internalAction({
  args: {
    discordId: v.string(),
    evaluationGender: v.number(),
    playerId: v.id("players"),
  },
  handler: async (_ctx, args) => {
    const url = process.env.DISCORD_BOT_ROLE_SYNC_URL;
    const secret =
      process.env.DISCORD_BOT_ROLE_SYNC_SECRET ||
      process.env.DISCORD_SYNC_API_KEY ||
      process.env.API_KEY;

    if (!url) {
      console.warn(
        "DISCORD_BOT_ROLE_SYNC_URL not configured; skipping evaluation role sync notification",
      );
      return;
    }

    if (!secret) {
      console.warn(
        "DISCORD_BOT_ROLE_SYNC_SECRET (or DISCORD_SYNC_API_KEY) not configured; skipping evaluation role sync notification",
      );
      return;
    }

    const body = JSON.stringify({
      eventType: EVENT_TYPE,
      discordId: args.discordId,
      evaluationGender: args.evaluationGender,
      gender: args.evaluationGender,
      playerId: args.playerId,
    });

    const signature = signPayload(body, secret);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": `sha256=${signature}`,
        },
        body,
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(
          `Evaluation role sync webhook failed: ${response.status} - ${text}`,
        );
      }
    } catch (error) {
      console.error(
        "Evaluation role sync webhook error:",
        error instanceof Error ? error.message : error,
      );
    }
  },
});
