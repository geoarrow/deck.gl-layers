import { describe, it, expect } from "vitest";
import { expandArrayToCoords } from "../src/utils/utils.js";
import { arraysEqual } from "./utils.js";

describe("linestring vertex expansion", (t) => {
  it("expands correctly (size = 1)", () => {
    const input = new Uint8Array([1, 2, 3, 4]);
    const size = 1;
    const geomOffsets = new Int32Array([0, 5, 8, 12]);
    const expanded = expandArrayToCoords(input, size, geomOffsets);
    const expected = new Uint8Array([1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3]);
    expect(
      arraysEqual(expanded, expected),
      "Expected arrays to be equal",
    ).toBeTruthy();
  });

  it("expands correctly (size = 3)", () => {
    const input = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const size = 3;
    const geomOffsets = new Int32Array([0, 2, 5, 9]);
    const expanded = expandArrayToCoords(input, size, geomOffsets);
    const expected = new Uint8Array([
      0, 1, 2, 0, 1, 2, 3, 4, 5, 3, 4, 5, 3, 4, 5, 6, 7, 8, 6, 7, 8, 6, 7, 8, 6,
      7, 8,
    ]);
    expect(
      arraysEqual(expanded, expected),
      "Expected arrays to be equal",
    ).toBeTruthy();
  });
});
