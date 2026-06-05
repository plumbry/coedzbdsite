"use node";

import { action } from "../_generated/server";
import { requireAdminAction } from "../auth_helpers";

export const removeAllTierRoles = action({
  args: {},
  handler: async (ctx): Promise<{
    success: boolean;
    message: string;
  }> => {
    await requireAdminAction(ctx);

    const apiSecret = process.env.TIER_CLEAR_API_SECRET;
    if (!apiSecret) {
      throw new Error("TIER_CLEAR_API_SECRET environment variable is not set");
    }

    const response = await fetch("https://welcome-ping.fly.dev/api/tier-clear", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiSecret}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Tier clear failed: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();
    return {
      success: true,
      message: data.message ?? "Tier roles cleared successfully",
    };
  },
});
