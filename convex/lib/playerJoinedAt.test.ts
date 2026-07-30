import { describe, expect, test } from "vitest";
import type { Doc } from "../_generated/dataModel";
import {
  normalizeJoinedAt,
  pickEarliestJoinedAt,
  validateJoinedAtContractValue,
} from "./playerJoinedAt";
import { mapPlayer } from "./zbdRaw/mappers";

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

describe("joinedAt contract helpers", () => {
  test("normalizes valid Discord timestamps to ISO-8601 UTC", () => {
    expect(normalizeJoinedAt("2026-04-18T14:42:10+01:00")).toBe(
      "2026-04-18T13:42:10.000Z",
    );
  });

  test("keeps the earliest trusted joinedAt", () => {
    expect(
      pickEarliestJoinedAt(
        "2026-04-18T13:42:10.000Z",
        "2026-04-17T13:42:10.000Z",
      ),
    ).toBe("2026-04-17T13:42:10.000Z");
  });

  test("validator accepts valid UTC timestamps and null but rejects malformed values", () => {
    expect(validateJoinedAtContractValue("2026-04-18T13:42:10.000Z")).toBe(
      "2026-04-18T13:42:10.000Z",
    );
    expect(validateJoinedAtContractValue(null)).toBeNull();
    expect(() => validateJoinedAtContractValue("2026-04-18")).toThrow(
      /joinedAt/,
    );
    expect(() => validateJoinedAtContractValue("not-a-date")).toThrow(
      /joinedAt/,
    );
  });
});

describe("zbd.raw player mapper joinedAt", () => {
  test("exports joinedAt without changing existing player fields", () => {
    const mapped = mapPlayer(
      playerDoc({
        joinedAt: "2026-04-18T13:42:10.000Z",
        tier: "A",
        totalScore: 940,
        currentMembershipStatus: "accepted",
        status: "active",
      }),
    );

    expect(mapped).toMatchObject({
      discordUsername: "CanonicalUser",
      epicUsername: "CanonicalEpic",
      recordStatus: "active",
      membershipStatus: "accepted",
      officialTier: "A",
      evaluationTotalScore: 940,
      serverJoinDate: "2026-04-18",
      joinedAt: "2026-04-18T13:42:10.000Z",
    });
  });

  test("exports missing or malformed joinedAt as null", () => {
    expect(mapPlayer(playerDoc()).joinedAt).toBeNull();
    expect(
      mapPlayer(playerDoc({ joinedAt: "2026-04-18" })).joinedAt,
    ).toBeNull();
  });
});
