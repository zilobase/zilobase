import assert from "node:assert/strict";
import { test } from "node:test";
import { changeRecordHierarchy } from "./hierarchy";

const input = {
  rowId: "child",
  parentRowId: "new",
  parentPropertyId: "parent",
  subItemPropertyId: "children",
  rows: ["old", "new", "child", "grandchild"].map((id) => ({ id, pageId: `page-${id}` })),
  values: [
    { pageId: "page-child", propertyId: "parent", value: ["page-old"] },
    { pageId: "page-old", propertyId: "children", value: ["page-child"] },
    { pageId: "page-grandchild", propertyId: "parent", value: ["page-child"] },
  ],
};
test("nesting changes both sides without rewriting unrelated relations", () => {
  assert.deepEqual(changeRecordHierarchy(input), [
    { rowId: "child", pageId: "page-child", propertyId: "parent", value: ["page-new"] },
    { rowId: "old", pageId: "page-old", propertyId: "children", value: [] },
    { rowId: "new", pageId: "page-new", propertyId: "children", value: ["page-child"] },
  ]);
});
test("server hierarchy validation rejects descendants outside the visible window", () => {
  assert.throws(() => changeRecordHierarchy({ ...input, parentRowId: "grandchild" }), /descendant/);
  assert.throws(() => changeRecordHierarchy({ ...input, parentRowId: "missing" }), /Invalid/);
  assert.throws(() => changeRecordHierarchy({ ...input, parentRowId: "child" }), /Invalid/);
});

test("unnesting clears the parent and its inverse without disturbing children", () => {
  assert.deepEqual(changeRecordHierarchy({ ...input, parentRowId: null }), [
    { rowId: "child", pageId: "page-child", propertyId: "parent", value: [] },
    { rowId: "old", pageId: "page-old", propertyId: "children", value: [] },
  ]);
});
