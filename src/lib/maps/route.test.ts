import { describe, expect, it } from "vitest";
import { normalizeMapsPathname } from "./route";

describe("normalizeMapsPathname", () => {
  it("lowercases mixed-case map paths", () => {
    expect(normalizeMapsPathname("/maPS/NEW")).toBe("/maps/new");
    expect(normalizeMapsPathname("/Maps/AbCdEf123456789012345678")).toBe(
      "/maps/abcdef123456789012345678",
    );
  });

  it("leaves already-lowercase paths unchanged", () => {
    expect(normalizeMapsPathname("/maps/new")).toBe("/maps/new");
  });

  it("does not alter unrelated paths", () => {
    expect(normalizeMapsPathname("/Members")).toBe("/Members");
  });
});
