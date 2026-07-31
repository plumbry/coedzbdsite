import { describe, expect, it } from "vitest";
import { MAP_ID_LENGTH, generateMapId } from "./id";

describe("generateMapId", () => {
  it("generates ids with at least 16 characters", () => {
    const id = generateMapId();
    expect(id.length).toBeGreaterThanOrEqual(16);
    expect(id.length).toBe(MAP_ID_LENGTH);
  });

  it("uses only lowercase letters and digits", () => {
    const id = generateMapId();
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});
