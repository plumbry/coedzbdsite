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
  fields: Partial<Doc<"players">>,
): Promise<Id<"players">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("players", {
      discordUsername: "ExistingUser",
      discordUserId: "111111111111111111",
      serverJoinDate: "2026-01-01T00:00:00.000Z",
      epicUsername: "ExistingEpic",
      status: "discord_member",
      ...fields,
    });
  });
}

async function getPlayerByDiscordId(t: AppTestConvex, discordUserId: string) {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("players")
      .withIndex("by_discord_user_id", (q) =>
        q.eq("discordUserId", discordUserId),
      )
      .unique();
  });
}

describe("Discord joinedAt sync", () => {
  test("stores joinedAt for a new Discord member from joined_at", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(internal.discord.syncDiscordMembersBatch, {
      members: [
        {
          discordUsername: "NewUser",
          discordUserId: "222222222222222222",
          serverJoinDate: "2026-04-18T14:42:10+01:00",
          roles: [],
        },
      ],
    });

    const player = await getPlayerByDiscordId(t, "222222222222222222");
    expect(result.added).toBe(1);
    expect(player?.joinedAt).toBe("2026-04-18T13:42:10.000Z");
  });

  test("backfills existing members and is idempotent", async () => {
    const t = convexTest(schema, modules);
    await insertPlayer(t, { joinedAt: undefined });

    const first = await t.mutation(internal.discord.syncDiscordMembersBatch, {
      members: [
        {
          discordUsername: "ExistingUser",
          discordUserId: "111111111111111111",
          serverJoinDate: "2026-04-18T13:42:10.000Z",
          roles: [],
        },
      ],
    });
    const afterFirst = await getPlayerByDiscordId(t, "111111111111111111");

    const second = await t.mutation(internal.discord.syncDiscordMembersBatch, {
      members: [
        {
          discordUsername: "ExistingUser",
          discordUserId: "111111111111111111",
          serverJoinDate: "2026-04-18T13:42:10.000Z",
          roles: [],
        },
      ],
    });
    const afterSecond = await getPlayerByDiscordId(t, "111111111111111111");

    expect(first.updated).toBe(1);
    expect(afterFirst?.joinedAt).toBe("2026-04-18T13:42:10.000Z");
    expect(second.updated).toBe(0);
    expect(afterSecond?.joinedAt).toBe("2026-04-18T13:42:10.000Z");
  });

  test("does not overwrite an existing trusted joinedAt with a missing source", async () => {
    const t = convexTest(schema, modules);
    const existingJoinedAt = "2026-04-18T13:42:10.000Z";
    await insertPlayer(t, { joinedAt: existingJoinedAt });

    await t.mutation(internal.discord.upsertDiscordMember, {
      discordUserId: "111111111111111111",
      discordUsername: "ExistingUser",
      nickname: null,
      joinedAt: null,
      roles: null,
    });

    const player = await getPlayerByDiscordId(t, "111111111111111111");
    expect(player?.joinedAt).toBe(existingJoinedAt);
  });
});
