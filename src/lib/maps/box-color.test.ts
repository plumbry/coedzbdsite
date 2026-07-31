import { describe, expect, it } from "vitest";
import {
  MAP_BOX_DEFAULT_COLOR,
  getContrastTextColor,
  isStoredHexColor,
  isValidHexColor,
  normalizeHexColor,
  resolveMapBoxColor,
} from "./box-color";

describe("normalizeHexColor", () => {
  it("expands three-digit hex values", () => {
    expect(normalizeHexColor("#f80")).toBe("#FF8800");
  });

  it("uppercases six-digit hex values", () => {
    expect(normalizeHexColor("#ff8800")).toBe("#FF8800");
  });

  it("rejects invalid values", () => {
    expect(normalizeHexColor("FF8800")).toBeNull();
    expect(normalizeHexColor("#GGG")).toBeNull();
  });
});

describe("isValidHexColor", () => {
  it("accepts short and long hex forms", () => {
    expect(isValidHexColor("#ABC")).toBe(true);
    expect(isValidHexColor("#AABBCC")).toBe(true);
    expect(isValidHexColor("#AABBC")).toBe(false);
  });
});

describe("isStoredHexColor", () => {
  it("accepts only uppercase six-digit stored values", () => {
    expect(isStoredHexColor("#FF8800")).toBe(true);
    expect(isStoredHexColor("#ff8800")).toBe(false);
    expect(isStoredHexColor("#F80")).toBe(false);
  });
});

describe("resolveMapBoxColor", () => {
  it("falls back to the default colour", () => {
    expect(resolveMapBoxColor(undefined)).toBe(MAP_BOX_DEFAULT_COLOR);
    expect(resolveMapBoxColor("invalid")).toBe(MAP_BOX_DEFAULT_COLOR);
    expect(MAP_BOX_DEFAULT_COLOR).toBe("#FAE904");
  });
});

describe("getContrastTextColor", () => {
  it("uses white text on dark colours and black on light colours", () => {
    expect(getContrastTextColor("#000000")).toBe("#FFFFFF");
    expect(getContrastTextColor("#FFFFFF")).toBe("#000000");
  });
});
