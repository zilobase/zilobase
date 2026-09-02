import { describe, expect, it } from "vitest";
import type { DatabaseAutomationDefinition } from "@zilobase/features/databases/automations";

import { matchesDatabaseAutomationEvent } from "./trigger-evaluator";

const definition = (
  clauses: Extract<DatabaseAutomationDefinition["trigger"], { kind: "event" }>["clauses"],
  match: "all" | "any" = "all",
): DatabaseAutomationDefinition => ({
  actions: [{ id: "variables", type: "define_variables", variables: [{ expression: { type: "literal", value: true }, name: "ok" }] }],
  definitionVersion: 1,
  scope: { type: "data_source" },
  timezone: "America/New_York",
  trigger: { clauses, kind: "event", match },
});

const input = {
  afterValues: { done: false, name: " Café ", score: 0, status: "Done" },
  changedPropertyIds: ["done", "name", "score", "status"],
  now: new Date("2026-03-08T16:00:00.000Z"),
  properties: new Map([
    ["done", { id: "done", type: "checkbox" }],
    ["name", { id: "name", type: "title" }],
    ["score", { id: "score", type: "number" }],
    ["status", { config: { options: [{ id: "done-id", name: "Done" }] }, id: "status", type: "status" }],
  ]),
  rowAdded: false,
  timezone: "America/New_York",
};

describe("automation event trigger evaluation", () => {
  it("matches Unicode text, zero, false, and stable option IDs", () => {
    const clauses = [
      { id: "text", operand: "café", operator: "is" as const, propertyId: "name", type: "property_edited" as const },
      { id: "number", operand: 0, operator: "is" as const, propertyId: "score", type: "property_edited" as const },
      { id: "checkbox", operator: "is_unchecked" as const, propertyId: "done", type: "property_edited" as const },
      { id: "status", operand: { entityType: "option" as const, id: "done-id", type: "entity" as const }, operator: "is" as const, propertyId: "status", type: "property_edited" as const },
    ];
    expect(matchesDatabaseAutomationEvent(definition(clauses), input)).toBe(true);
  });

  it("requires real edits and applies any/all semantics", () => {
    const clauses = [
      { id: "added", type: "page_added" as const },
      { id: "edited", operator: "was_edited" as const, propertyId: "any", type: "property_edited" as const },
    ];
    expect(matchesDatabaseAutomationEvent(definition(clauses, "any"), input)).toBe(true);
    expect(matchesDatabaseAutomationEvent(definition(clauses, "all"), input)).toBe(false);
    expect(matchesDatabaseAutomationEvent(definition(clauses, "all"), { ...input, rowAdded: true })).toBe(true);
  });

  it.each([
    ["contains", "afé", true],
    ["does_not_contain", "tea", true],
    ["starts_with", "ca", true],
    ["ends_with", "FÉ", true],
    ["is_not", "tea", true],
  ] as const)("evaluates text operator %s", (operator, operand, expected) => {
    expect(matchesDatabaseAutomationEvent(definition([{
      id: "text",
      operand,
      operator,
      propertyId: "name",
      type: "property_edited",
    }]), input)).toBe(expected);
  });

  it.each([
    ["greater_than", -1, true],
    ["less_than", 1, true],
    ["greater_than_or_equal", 0, true],
    ["less_than_or_equal", 0, true],
    ["is_not", 1, true],
  ] as const)("evaluates number operator %s without treating zero as empty", (operator, operand, expected) => {
    expect(matchesDatabaseAutomationEvent(definition([{
      id: "number",
      operand,
      operator,
      propertyId: "score",
      type: "property_edited",
    }]), input)).toBe(expected);
  });

  it("distinguishes missing values from false and zero", () => {
    const clauses = [{
      id: "empty",
      operator: "is_empty" as const,
      propertyId: "missing",
      type: "property_edited" as const,
    }];
    expect(matchesDatabaseAutomationEvent(definition(clauses), {
      ...input,
      changedPropertyIds: ["missing"],
    })).toBe(true);
    expect(matchesDatabaseAutomationEvent(definition([{
      ...clauses[0],
      propertyId: "done",
    }]), input)).toBe(false);
    expect(matchesDatabaseAutomationEvent(definition([{
      ...clauses[0],
      propertyId: "score",
    }]), input)).toBe(false);
  });

  it.each([
    ["is_before", { precision: "date", type: "date", value: "2026-03-09T12:00:00.000Z" }, true],
    ["is_after", { precision: "date", type: "date", value: "2026-03-07T12:00:00.000Z" }, true],
    ["is_on_or_before", { precision: "date", type: "date", value: "2026-03-08T12:00:00.000Z" }, true],
    ["is_on_or_after", { precision: "date", type: "date", value: "2026-03-08T12:00:00.000Z" }, true],
    ["is_between", { end: "2026-03-09T00:00:00.000Z", start: "2026-03-07T00:00:00.000Z", type: "date_range" }, true],
    ["is_relative_to_today", { amount: 1, direction: "past", type: "relative_date", unit: "day" }, true],
  ] as const)("evaluates date operator %s with the injected clock and timezone", (operator, operand, expected) => {
    expect(matchesDatabaseAutomationEvent(definition([{
      id: "date",
      operand,
      operator,
      propertyId: "due",
      type: "property_edited",
    }]), {
      ...input,
      afterValues: { ...input.afterValues, due: "2026-03-08T06:00:00.000Z" },
      changedPropertyIds: [...input.changedPropertyIds, "due"],
      properties: new Map([...input.properties, ["due", { id: "due", type: "date" }]]),
      now: operator === "is_relative_to_today"
        ? new Date("2026-03-09T16:00:00.000Z")
        : input.now,
    })).toBe(expected);
  });
});
