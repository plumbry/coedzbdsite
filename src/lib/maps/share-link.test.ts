import { describe, expect, it } from "vitest";
import { buildMapShareUrl, getSaveAndCopyToastMessage } from "./share-link";

describe("buildMapShareUrl", () => {
  it("builds the canonical share URL", () => {
    expect(buildMapShareUrl("https://coedzbd.com", "abc123")).toBe(
      "https://coedzbd.com/maps/abc123",
    );
  });
});

describe("getSaveAndCopyToastMessage", () => {
  it("returns the expected save and copy messages", () => {
    expect(getSaveAndCopyToastMessage("saved-and-copied")).toBe(
      "Saved — new link copied",
    );
    expect(getSaveAndCopyToastMessage("saved-copy-failed")).toBe(
      "Saved as a new link, but it could not be copied",
    );
    expect(getSaveAndCopyToastMessage("copied-only")).toBe("Link copied");
    expect(getSaveAndCopyToastMessage("copy-failed")).toBe("Could not copy the link");
    expect(getSaveAndCopyToastMessage("save-failed")).toBe("Failed to save map");
  });
});
