import assert from "node:assert/strict";
import { test } from "node:test";
import { getStatusOptions, reorderStatusGroupOptions } from "./status-options.ts";
import { defaultStatusOptions, getEffectiveStatusValue } from "./property-defaults.ts";
import { getSelectOptions, getSelectConfigWithOptions } from "../views/grouping.ts";
import { getDateConfigWithFormat } from "./date-config.ts";
import { getRelationPageSummary } from "./relation-settings.ts";
import { getPlainConditionalColorSettings } from "../views/configuration.ts";

test("effective status uses configured defaults for unset values and preserves explicit statuses", () => {
  const config = { defaultOptionId: "queued", options: [{ id: "queued", name: "Queued" }] };
  for (const value of [null, undefined, "", "   "])
    assert.equal(getEffectiveStatusValue(value, config), "Queued");
  assert.equal(getEffectiveStatusValue("Done", config), "Done");
  assert.equal(getEffectiveStatusValue(null, { defaultOptionId: "missing" }), "Not started");
});

test("invalid option configuration falls back without discarding valid option metadata", () => {
  assert.equal(getStatusOptions({ options: [{ id: 2, name: "Invalid" }] }), defaultStatusOptions);
  const option = { id: "a", name: "Todo", color: "red", suffix: "Guest" };
  assert.deepEqual(getSelectOptions({ options: [null, option, { name: "No id" }] }), [option]);
  assert.deepEqual(getSelectConfigWithOptions({ sort: "manual", defaultOptionId: "a" }, [option]), {
    sort: "manual",
    defaultOptionId: "a",
    options: [option],
  });
  assert.deepEqual(
    getDateConfigWithFormat({ timeFormat: "24_hour", extra: true }, { dateFormat: "short" }),
    {
      timeFormat: "24_hour",
      extra: true,
      dateFormat: "short",
    },
  );
});

test("status reordering affects only the selected group", () => {
  const a = { id: "a", name: "One", group: "To-do" };
  const other = { id: "other", name: "Done", group: "Complete" };
  const b = { id: "b", name: "Two", group: "To-do" };
  assert.deepEqual(reorderStatusGroupOptions([a, other, b], "To-do", ["b", "a"]), [b, other, a]);
});

test("persisted configuration excludes view annotations and rejects malformed relation summaries", () => {
  const config = {
    applyTo: "entire-row",
    color: "green",
    id: "color",
    style: "background",
    filter: {
      id: "filter",
      operator: "is",
      propertyId: "name",
      values: ["A"],
      label: "Name",
      valueOptions: [],
    },
  };
  assert.deepEqual(getPlainConditionalColorSettings([config])[0].filter, {
    id: "filter",
    operator: "is",
    propertyId: "name",
    values: ["A"],
  });
  assert.equal(getRelationPageSummary({ pageSummaries: { a: [] } }, "a"), null);
  assert.equal(getRelationPageSummary({ pageSummaries: [] }, "a"), null);
  const summary = { id: "a", name: "Related page", metadata: { icon: "x" } };
  assert.equal(getRelationPageSummary({ pageSummaries: { a: summary } }, "a"), summary);
});
