import { describe, expect, it } from "vitest";

import { applyDatabaseAutomationPropertyOperation } from "./internal-mutations";

describe("automation property operations", () => {
  it("sets scalar values and clears them to null", () => {
    expect(applyDatabaseAutomationPropertyOperation("old", {
      mode: "set",
      propertyId: "title",
      value: "new",
    }, "text")).toBe("new");
    expect(applyDatabaseAutomationPropertyOperation("old", {
      mode: "clear",
      propertyId: "title",
    }, "text")).toBeNull();
  });

  it("adds unique collection values and removes matching values", () => {
    const added = applyDatabaseAutomationPropertyOperation(["a"], {
      mode: "add",
      propertyId: "tags",
      value: ["a", "b"],
    }, "multi_select");
    expect(added).toEqual(["a", "b"]);
    expect(applyDatabaseAutomationPropertyOperation(added, {
      mode: "remove",
      propertyId: "tags",
      value: "a",
    }, "multi_select")).toEqual(["b"]);
  });

  it.each(["multi_select", "person", "relation"])(
    "clears %s values to an empty collection",
    (propertyType) => {
      expect(applyDatabaseAutomationPropertyOperation(["value"], {
        mode: "clear",
        propertyId: "collection",
      }, propertyType)).toEqual([]);
    },
  );
});
