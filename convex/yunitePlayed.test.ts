/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type AppTestConvex = TestConvex<typeof schema>;

async function insertPlayer(
  t: AppTestConvex,
  fields: Partial<Doc<"players">> & { discordUserId: string },
): Promise<Id<"players">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("players", {
      discordUsername: "ScrimPlayer",
      serverJoinDate: "2026-01-01T00:00:00.000Z",
      epicUsername: "ScrimEpic",
      status: "discord_member",
      ...fields,
    });
  });
}

async function insertYuniteResult(
  t: AppTestConvex,
  args: {
    discordId?: string;
    playerId?: Id<"players">;
    source?: string;
  },
) {
  await t.run(async (ctx) => {
    const importedBy = await ctx.db.insert("users", {
      tokenIdentifier: `test:${crypto.randomUUID()}`,
    });
    const importId = await ctx.db.insert("thirdPartyImports", {
      leaderboardUrl: "https://yunite.xyz/leaderboard/abc",
      leaderboardId: "yunite-abc",
      eventName: "ZBD Scrim",
      source: args.source ?? "Yunite",
      importMethod: "api",
      playersMatched: 1,
      playersUnmatched: 0,
      totalPlayers: 1,
      importedBy,
    });
    await ctx.db.insert("thirdPartyResults", {
      importId,
      playerId: args.playerId,
      eventName: "ZBD Scrim",
      source: args.source ?? "Yunite",
      leaderboardUrl: "https://yunite.xyz/leaderboard/abc",
      epicUsername: "ScrimEpic",
      discordId: args.discordId,
      placement: 4,
      points: 12,
      matched: Boolean(args.playerId),
    });
  });
}

describe("getYunitePlayedByDiscordIds", () => {
  test("marks a player with eventsPlayedCount as played", async () => {
    const t = convexTest(schema, modules);
    await insertPlayer(t, {
      discordUserId: "111111111111111111",
      eventsPlayedCount: 3,
      epicId: "epic-1",
      epicUsername: "PlayedEpic",
    });

    const result = await t.query(
      internal.discord.yunitePlayed.getYunitePlayedByDiscordIds,
      { discordIds: ["111111111111111111"] },
    );

    expect(result.members).toEqual([
      {
        discordId: "111111111111111111",
        played: true,
        eventsPlayedCount: 3,
        epicId: "epic-1",
        epicName: "PlayedEpic",
        match: "player",
      },
    ]);
  });

  test("uses alternate Discord IDs and unmatched Yunite result rows", async () => {
    const t = convexTest(schema, modules);
    const playerId = await insertPlayer(t, {
      discordUserId: "222222222222222222",
      alternateDiscordUserIds: ["333333333333333333"],
      eventsPlayedCount: 0,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("playerDiscordAliases", {
        discordUserId: "333333333333333333",
        playerId,
      });
    });
    await insertYuniteResult(t, {
      discordId: "222222222222222222",
    });
    await insertYuniteResult(t, {
      discordId: "444444444444444444",
    });

    const result = await t.query(
      internal.discord.yunitePlayed.getYunitePlayedByDiscordIds,
      {
        discordIds: [
          "333333333333333333",
          "444444444444444444",
          "555555555555555555",
        ],
      },
    );

    expect(result.members).toEqual([
      {
        discordId: "333333333333333333",
        played: true,
        eventsPlayedCount: 1,
        epicId: "",
        epicName: "ScrimEpic",
        match: "player",
      },
      {
        discordId: "444444444444444444",
        played: true,
        eventsPlayedCount: 1,
        epicId: "",
        epicName: "",
        match: "result",
      },
      {
        discordId: "555555555555555555",
        played: false,
        eventsPlayedCount: 0,
        epicId: "",
        epicName: "",
        match: "none",
      },
    ]);
  });

  test("treats linked Yunite results as played even when eventsPlayedCount is 0", async () => {
    const t = convexTest(schema, modules);
    const playerId = await insertPlayer(t, {
      discordUserId: "666666666666666666",
      eventsPlayedCount: 0,
    });
    await insertYuniteResult(t, {
      playerId,
      discordId: "666666666666666666",
    });

    const result = await t.query(
      internal.discord.yunitePlayed.getYunitePlayedByDiscordIds,
      { discordIds: ["666666666666666666"] },
    );

    expect(result.members[0]?.played).toBe(true);
    expect(result.members[0]?.match).toBe("player");
  });
});
