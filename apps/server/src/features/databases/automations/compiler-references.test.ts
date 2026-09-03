import { describe, expect, it, vi } from "vitest";

import { optionReferenceIds, visitFormulaExpressions, visitReferences } from "./compiler-references";

describe("automation compiler reference traversal", () => {
  it("collects unique option references from nested values", () => {
    expect(optionReferenceIds({
      nested: [
        { entityType: "option", id: "one", type: "entity" },
        { entityType: "option", ids: ["two", "one", 3], type: "entity_list" },
      ],
    })).toEqual(["one", "two"]);
  });

  it("reports reference and formula paths without interpreting unrelated objects", () => {
    const references = vi.fn();
    const formulas = vi.fn();
    const value = {
      action: { type: "reference", reference: "trigger_page" },
      nested: [{ expression: "prop(\"Amount\")", type: "formula" }],
    };

    visitReferences(value, references);
    visitFormulaExpressions(value, formulas);

    expect(references).toHaveBeenCalledWith(value.action, ["action"]);
    expect(formulas).toHaveBeenCalledWith('prop("Amount")', ["nested", 0, "expression"]);
  });
});
