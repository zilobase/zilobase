import assert from "node:assert/strict";
import { test } from "vitest";

import {
  formatDatePropertyValueAsText,
  getStatusDefaultValue,
  normalizePropertyConfig,
  validateCellValue,
} from "./database-property-config";
import { ServiceMutationError } from "./mutation-error";
import {
  databasePropertyTypes,
  normalizeDatabasePropertyType,
} from "./database-property-types";

test("formatDatePropertyValueAsText preserves date ranges", () => {
  assert.equal(
    formatDatePropertyValueAsText({
      end: "2026-07-12",
      start: "2026-07-10",
    }),
    "2026-07-10 - 2026-07-12",
  );
  assert.equal(
    formatDatePropertyValueAsText(["2026-07-10", "2026-07-12"]),
    "2026-07-10 - 2026-07-12",
  );
  assert.equal(formatDatePropertyValueAsText("2026-07-10"), "2026-07-10");
  assert.equal(formatDatePropertyValueAsText(null), null);
});

test("normalizeDatabasePropertyType accepts known types and defaults blanks to text", () => {
  for (const type of databasePropertyTypes) {
    assert.equal(normalizeDatabasePropertyType(type), type);
  }

  assert.equal(normalizeDatabasePropertyType(undefined), "text");
  assert.equal(normalizeDatabasePropertyType(" STATUS "), "status");
  assert.equal(normalizeDatabasePropertyType(123), null);
  assert.equal(normalizeDatabasePropertyType("made_up"), null);
});

test("normalizePropertyConfig seeds default status options with colors and groups", () => {
  const config = normalizePropertyConfig("status", null) as {
    defaultOptionId?: string;
    options?: Array<{
      color?: string;
      group?: string;
      id: string;
      name: string;
    }>;
  };

  assert.equal(config.defaultOptionId, "not-started");
  assert.deepEqual(config.options, [
    { color: "gray", group: "To-do", id: "not-started", name: "Not started" },
    {
      color: "blue",
      group: "In progress",
      id: "in-progress",
      name: "In progress",
    },
    { color: "green", group: "Complete", id: "done", name: "Done" },
  ]);
});

test("normalizePropertyConfig maps status aliases and fills missing colors", () => {
  const config = normalizePropertyConfig("status", {
    options: [
      { id: "todo", name: "Todo" },
      { id: "inprogress", name: "In progress" },
      { id: "complete", name: "Complete" },
    ],
  }) as {
    options?: Array<{
      color?: string;
      group?: string;
      id: string;
      name: string;
    }>;
  };

  assert.deepEqual(config.options, [
    { color: "gray", group: "To-do", id: "not-started", name: "Not started" },
    {
      color: "blue",
      group: "In progress",
      id: "in-progress",
      name: "In progress",
    },
    { color: "green", group: "Complete", id: "done", name: "Done" },
  ]);
});

test("normalizePropertyConfig recognizes canonical status IDs", () => {
  const config = normalizePropertyConfig("status", {
    options: [{ id: "done", name: "Custom complete label" }],
  }) as { options: unknown[] };

  assert.deepEqual(config.options, [
    { color: "green", group: "Complete", id: "done", name: "Done" },
  ]);
});

test("normalizePropertyConfig assigns cycling colors to select options", () => {
  const config = normalizePropertyConfig("select", {
    options: [
      { id: "low", name: "Low" },
      { id: "medium", name: "Medium" },
      { id: "high", name: "High" },
    ],
  }) as {
    options?: Array<{ color?: string; id: string; name: string }>;
  };

  assert.deepEqual(config.options, [
    { color: "gray", id: "low", name: "Low" },
    { color: "brown", id: "medium", name: "Medium" },
    { color: "orange", id: "high", name: "High" },
  ]);
});

test("normalizePropertyConfig preserves explicit select colors", () => {
  const config = normalizePropertyConfig("multi_select", {
    options: [{ color: "red", id: "blocked", name: "Blocked" }],
  }) as {
    options?: Array<{ color?: string; id: string; name: string }>;
  };

  assert.deepEqual(config.options, [
    { color: "red", id: "blocked", name: "Blocked" },
  ]);
});

test("normalizePropertyConfig filters malformed options and preserves metadata", () => {
  const status = normalizePropertyConfig("status", {
    defaultOptionId: "custom-default",
    label: "Workflow",
    options: [
      null,
      { id: "", name: "Missing ID" },
      { id: "review", name: "Review", color: " purple ", group: " QA " },
      { id: "anything", name: "Completed" },
    ],
  }) as Record<string, any>;

  assert.equal(status.defaultOptionId, "custom-default");
  assert.equal(status.label, "Workflow");
  assert.deepEqual(status.options, [
    { color: "purple", group: "QA", id: "review", name: "Review" },
    { color: "green", group: "Complete", id: "done", name: "Done" },
  ]);

  assert.deepEqual(
    normalizePropertyConfig("select", {
      label: "Priority",
      options: [false, { id: "valid", name: " Valid " }, { id: 1, name: "No" }],
    }),
    {
      label: "Priority",
      options: [{ color: "brown", id: "valid", name: "Valid" }],
    },
  );
  assert.equal(normalizePropertyConfig("text", "unchanged"), "unchanged");
});

test("normalizePropertyConfig preserves explicit status defaults without options", () => {
  const config = normalizePropertyConfig("status", {
    defaultOptionId: "done",
    options: [],
  }) as { defaultOptionId: string };

  assert.equal(config.defaultOptionId, "done");
});

test("normalizePropertyConfig rejects unknown property types", () => {
  assert.throws(
    () => normalizePropertyConfig("made_up", {}),
    (error) =>
      error instanceof ServiceMutationError &&
      error.status === 400 &&
      error.message === "Unsupported property type",
  );
});

test("validateCellValue rejects unknown and read-only property types", () => {
  assert.throws(
    () => validateCellValue("made_up", null, "value"),
    (error) =>
      error instanceof ServiceMutationError &&
      error.status === 400 &&
      error.message === "Unsupported property type",
  );
  assert.throws(
    () => validateCellValue("created_time", null, "2026-01-01"),
    (error) =>
      error instanceof ServiceMutationError &&
      error.status === 400 &&
      error.message === "This property is read-only",
  );
});

test("validateCellValue validates select-like option values", () => {
  const config = {
    options: [
      { id: "todo", name: "Todo" },
      { id: "done", name: "Done" },
    ],
  };

  assert.doesNotThrow(() => validateCellValue("select", config, "Todo"));
  assert.doesNotThrow(() =>
    validateCellValue("multi_select", config, ["Todo", "Done"]),
  );
  assert.throws(
    () => validateCellValue("status", config, "Missing"),
    (error) =>
      error instanceof ServiceMutationError &&
      error.status === 400 &&
      error.message.startsWith("Invalid select/status option name."),
  );
  assert.throws(
    () => validateCellValue("multi_select", config, "Todo"),
    (error) =>
      error instanceof ServiceMutationError &&
      error.status === 400 &&
      error.message === "multi_select values must be an array of option names.",
  );
});

test("validateCellValue accepts writable scalar types and reports empty options", () => {
  assert.doesNotThrow(() => validateCellValue("text", null, { anything: true }));
  assert.doesNotThrow(() => validateCellValue("multi_select", { options: [] }, []));

  assert.throws(
    () => validateCellValue("select", {}, "Missing"),
    /Known options: \(none\)/,
  );
  assert.throws(
    () => validateCellValue("status", { options: "invalid" }, "Missing"),
    /Known options: \(none\)/,
  );
  assert.throws(
    () =>
      validateCellValue(
        "multi_select",
        { options: [null, { name: "Known" }, { name: "" }] },
        ["Known", 1],
      ),
    /Invalid multi_select option/,
  );
});

test("formatDatePropertyValueAsText normalizes object and blank inputs", () => {
  assert.equal(
    formatDatePropertyValueAsText({ date: " 2026-08-02 " }),
    "2026-08-02",
  );
  assert.equal(
    formatDatePropertyValueAsText({ start: " ", end: "2026-08-03" }),
    null,
  );
  assert.equal(formatDatePropertyValueAsText([123, "2026-08-03"]), null);
});

test("getStatusDefaultValue resolves configured and fallback options", () => {
  assert.equal(getStatusDefaultValue(null), "Not started");
  assert.equal(
    getStatusDefaultValue({
      defaultOptionId: "done",
      options: [
        { id: "todo", name: "Todo" },
        { id: "done", name: "Done" },
      ],
    }),
    "Done",
  );
  assert.equal(
    getStatusDefaultValue({
      defaultOptionId: "missing",
      options: [null, { id: "review", name: "Review" }, { id: 1 }],
    }),
    "Review",
  );
  assert.equal(getStatusDefaultValue({ options: [] }), "Not started");
});
