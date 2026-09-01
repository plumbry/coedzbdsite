import { describe, expect, test } from "vitest";
import type { Doc } from "../../_generated/dataModel";
import {
  mapPlayer,
  mapTierChange,
  officialTierChangedAtFromHistory,
} from "./mappers";

function playerDoc(overrides: Partial<Doc<"players">> = {}): Doc<"players"> {
  return {
    _id: "players:canonical" as Doc<"players">["_id"],
    _creationTime: Date.parse("2026-05-01T00:00:00.000Z"),
    discordUsername: "CanonicalUser",
    discordUserId: "123456789012345678",
    serverJoinDate: "2026-04-18",
    epicUsername: "CanonicalEpic",
    ...overrides,
  } as Doc<"players">;
}

function tierHistoryDoc(
  overrides: Partial<Doc<"tierHistory">> = {},
): Doc<"tierHistory"> {
  return {
    _id: "tierHistory:change-1" as Doc<"tierHistory">["_id"],
    _creationTime: Date.parse("2026-03-15T12:00:00.000Z"),
    playerId: "players:canonical" as Doc<"players">["_id"],
    tier: "A",
    previousTier: "B",
    totalScore: 900,
    ...overrides,
  } as Doc<"tierHistory">;
}

describe("zbd.raw player mapper officialTierChangedAt", () => {
  test("defaults to null when no history is supplied", () => {
    expect(mapPlayer(playerDoc({ tier: "A" })).officialTierChangedAt).toBeNull();
  });

  test("exports the latest history timestamp without changing other player fields", () => {
    const mapped = mapPlayer(playerDoc({ tier: "A", totalScore: 940 }), {
      officialTierChangedAt: "2026-03-15T12:00:00.000Z",
    });

    expect(mapped).toMatchObject({
      officialTier: "A",
      officialTierChangedAt: "2026-03-15T12:00:00.000Z",
      evaluationTotalScore: 940,
      discordUsername: "CanonicalUser",
    });
  });
});

describe("officialTierChangedAtFromHistory", () => {
  test("returns null for an empty history", () => {
    expect(officialTierChangedAtFromHistory([])).toBeNull();
  });

  test("uses the newest _creationTime", () => {
    expect(
      officialTierChangedAtFromHistory([
        tierHistoryDoc({
          _creationTime: Date.parse("2026-01-01T00:00:00.000Z"),
        }),
        tierHistoryDoc({
          _id: "tierHistory:change-2" as Doc<"tierHistory">["_id"],
          _creationTime: Date.parse("2026-06-20T18:30:00.000Z"),
        }),
        tierHistoryDoc({
          _id: "tierHistory:change-3" as Doc<"tierHistory">["_id"],
          _creationTime: Date.parse("2026-03-15T12:00:00.000Z"),
        }),
      ]),
    ).toBe("2026-06-20T18:30:00.000Z");
  });
});

describe("zbd.raw tierChange mapper", () => {
  test("pulls changedAt through from _creationTime", () => {
    expect(mapTierChange(tierHistoryDoc())).toMatchObject({
      playerId: "players:canonical",
      previousTier: "B",
      newTier: "A",
      totalScore: 900,
      changedAt: "2026-03-15T12:00:00.000Z",
    });
  });
});
