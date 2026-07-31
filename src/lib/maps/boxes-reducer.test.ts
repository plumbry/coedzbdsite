import { describe, expect, it } from "vitest";
import { boxesReducer, dedupeBoxesById } from "./boxes-reducer";
import type { MapBox } from "./types";

const box = (
  id: string,
  x = 0.1,
  y = 0.1,
): MapBox => ({
  id,
  x,
  y,
  width: 0.2,
  height: 0.2,
  label: "",
  color: "#FAE904",
});

describe("boxesReducer", () => {
  it("keeps the first box when appending a second", () => {
    const afterFirst = boxesReducer([], { type: "append", box: box("a") });
    const afterSecond = boxesReducer(afterFirst, { type: "append", box: box("b", 0.5, 0.5) });
    expect(afterSecond.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("is idempotent when the same id is appended twice", () => {
    const a = box("a");
    const once = boxesReducer([], { type: "append", box: a });
    const twice = boxesReducer(once, { type: "append", box: a });
    expect(twice).toHaveLength(1);
    expect(twice).toBe(once);
  });

  it("patching the first box never drops the second (reselect/move regression)", () => {
    let state = boxesReducer([], { type: "append", box: box("a") });
    state = boxesReducer(state, { type: "append", box: box("b", 0.5, 0.5) });
    state = boxesReducer(state, {
      type: "patch",
      id: "a",
      box: box("a", 0.15, 0.15),
    });
    expect(state).toHaveLength(2);
    expect(state.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(state[0]?.x).toBe(0.15);
    expect(state[1]?.id).toBe("b");
  });

  it("remove deletes only the targeted id", () => {
    let state = boxesReducer([], { type: "append", box: box("a") });
    state = boxesReducer(state, { type: "append", box: box("b", 0.5, 0.5) });
    state = boxesReducer(state, { type: "remove", id: "b" });
    expect(state.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("hydrate replaces the list explicitly", () => {
    let state = boxesReducer([], { type: "append", box: box("a") });
    state = boxesReducer(state, {
      type: "hydrate",
      boxes: [box("server-1"), box("server-2", 0.4, 0.4)],
    });
    expect(state.map((entry) => entry.id)).toEqual(["server-1", "server-2"]);
  });
});

describe("dedupeBoxesById", () => {
  it("keeps the first of duplicate ids", () => {
    const result = dedupeBoxesById([box("a", 0.1), box("a", 0.9), box("b", 0.5)]);
    expect(result).toHaveLength(2);
    expect(result[0]?.x).toBe(0.1);
    expect(result[1]?.id).toBe("b");
  });
});
