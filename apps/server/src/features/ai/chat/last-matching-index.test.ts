import { describe, expect, it } from "vitest";

import { lastMatchingIndex } from "./last-matching-index";

describe("lastMatchingIndex", () => {
  it("returns the final match without requiring ES2023 array methods", () => {
    expect(lastMatchingIndex(["user", "assistant", "user"], (value) => value === "user"))
      .toBe(2);
    expect(lastMatchingIndex(["assistant"], (value) => value === "user"))
      .toBe(-1);
  });
});
