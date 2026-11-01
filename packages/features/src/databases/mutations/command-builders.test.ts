import assert from "node:assert/strict";
import test from "node:test";

import { databaseCreationCommandSchema } from "../core/lifecycle-commands";
import {
  dataSourceCommandSchema,
  hostDatabaseCommandSchema,
  type DatabasePropertyEntity,
  type DatabaseRecordEntity,
} from "../core/entities";
import * as builders from "./command-builders";

const scope = { dataSourceId: "source-1", hostDatabaseId: "host-1" };
const property = (id: string, position: number, dataSourceId = "source-1") =>
  ({ id, position, dataSourceId }) as DatabasePropertyEntity;
const record = (id: string) => ({ id }) as DatabaseRecordEntity;

test("every builder emits a command accepted by its scope schema", () => {
  const host = [
    builders.buildDatabaseUpdate({ databaseId: "host-1", name: "Roadmap" }),
    builders.buildDatabaseState("host-1", "database.archive"),
    builders.buildDatabaseState("host-1", "database.restore"),
    builders.buildDatabaseFavorite({ databaseId: "host-1", isFavorite: true }),
    builders.buildDataSourceLink({ databaseId: "host-1", dataSourceId: "source-2" }),
    builders.buildDataSourceCreate({ databaseId: "host-1" }),
    builders.buildDataSourceUnlink({ databaseId: "host-1", dataSourceId: "source-2" }),
    builders.buildViewCreate({ databaseId: "host-1", dataSourceId: "source-1" }),
    builders.buildViewUpdate({ databaseId: "host-1", databaseViewId: "view-1", name: "Board" }),
    builders.buildViewMove({
      afterViewId: null,
      beforeViewId: "view-2",
      databaseId: "host-1",
      databaseViewId: "view-1",
    }),
    builders.buildViewDelete({ databaseId: "host-1", databaseViewId: "view-1" }),
    builders.buildViewSetDataSource({
      databaseId: "host-1",
      databaseViewId: "view-1",
      dataSourceId: "source-2",
    }),
  ];
  for (const input of host) {
    assert.equal(input.databaseId, "host-1");
    assert.equal("dataSourceId" in input, false);
    hostDatabaseCommandSchema.parse(input.command);
  }
  const source = [
    builders.buildDataSourceUpdate(scope, { name: "Tasks" }),
    builders.buildPropertyCreate(scope, [], {}),
    builders.buildPropertyUpdate(scope, { databasePropertyId: "column-1", name: "Stage" }),
    builders.buildPropertyMove(scope, {
      afterPropertyId: "column-2",
      beforePropertyId: null,
      databasePropertyId: "column-1",
    }),
    builders.buildPropertyState(scope, "column-1", "property.archive"),
    builders.buildPropertyState(scope, "column-1", "property.restore"),
    builders.buildPropertyDuplicate(scope, { databasePropertyId: "column-1" }),
    builders.buildTemplateApply(scope, { config: {}, name: "Tasks", properties: [], rows: [] }),
    builders.buildTemplateCreate(scope, { name: "Default", template: {} }),
    builders.buildTemplateUpdate(scope, { patch: {}, templateId: "template-1" }),
    builders.buildTemplateState(scope, "template-1", "template.archive"),
    builders.buildTemplateState(scope, "template-1", "template.restore"),
    builders.buildRowPlace(scope, [], { title: "First" }).input,
    builders.buildRowChange(scope, { rowId: "row-1", title: "Renamed" }),
    builders.buildRowState(scope, "row-1", "row.archive"),
    builders.buildRowState(scope, "row-1", "row.restore"),
    builders.buildRowDuplicate(scope, { rowId: "row-1" }),
    builders.buildRowMoveToPage(scope, { rowId: "row-1", pageId: "page-1" }),
  ];
  for (const input of source) {
    assert.deepEqual(
      { databaseId: input.databaseId, dataSourceId: input.dataSourceId },
      { databaseId: "host-1", dataSourceId: "source-1" },
    );
    dataSourceCommandSchema.parse(input.command);
  }
  const created = builders.buildDatabaseCreate({ workspaceId: "org-1", standalone: true });
  assert.equal(created.databaseId, "org-1");
  databaseCreationCommandSchema.parse(created.command);
});

test("builders apply the same defaults as the client operations", () => {
  assert.deepEqual(builders.buildDatabaseCreate({ workspaceId: "org-1", pageId: "p" }).command, {
    type: "database.create",
    workspaceId: "org-1",
    pageId: "p",
    name: "New database",
    standalone: false,
  });
  assert.deepEqual(builders.buildPropertyCreate(scope, [], { name: "  " }).command, {
    afterPropertyId: null,
    beforePropertyId: null,
    config: null,
    name: "Property",
    propertyType: "text",
    type: "property.create",
  });
  assert.deepEqual(
    builders.buildViewCreate({ databaseId: "host-1", dataSourceId: "source-1" }).command,
    {
      afterViewId: null,
      beforeViewId: null,
      config: null,
      dataSourceId: "source-1",
      name: "Table",
      type: "view.create",
      viewType: "table",
    },
  );
});

test("property anchors are scoped to the source, ordered and clamped", () => {
  const properties = [
    property("c", 2),
    property("a", 0),
    property("other", 1, "source-2"),
    property("b", 1),
  ];
  assert.deepEqual(builders.resolvePropertyCreateAnchors(properties, "source-1"), {
    afterPropertyId: "c",
    beforePropertyId: null,
  });
  assert.deepEqual(builders.resolvePropertyCreateAnchors(properties, "source-1", 1), {
    afterPropertyId: "a",
    beforePropertyId: "b",
  });
  assert.deepEqual(builders.resolvePropertyCreateAnchors(properties, "source-1", -4), {
    afterPropertyId: null,
    beforePropertyId: "a",
  });
});

test("row placement honors explicit anchors, positions and hierarchy parents", () => {
  const records = [record("row-1"), record("row-2")];
  assert.deepEqual(builders.resolveRowCreateAnchors(records, {}), {
    afterRowId: "row-2",
    beforeRowId: null,
  });
  assert.deepEqual(builders.resolveRowCreateAnchors(records, { position: 0 }), {
    afterRowId: null,
    beforeRowId: "row-1",
  });
  assert.deepEqual(builders.resolveRowCreateAnchors(records, { afterRowId: "row-1" }), {
    afterRowId: "row-1",
    beforeRowId: null,
  });
  const placed = builders.buildRowPlace(scope, records, {
    hierarchy: { parentRowId: "row-1", parentPropertyId: "parent", subItemPropertyId: "sub" },
    initialValues: [{ propertyId: "status", value: "Done" }],
    parentRowId: "ignored",
  });
  assert.equal(placed.parentRowId, "row-1");
  assert.deepEqual(placed.valuesByPropertyId, { status: "Done" });
});

test("row change keeps only placement anchors and optional duplicate parents", () => {
  const change = builders.buildRowChange(scope, {
    rowId: "row-1",
    placement: { afterRowId: "row-2", beforeRowId: null, extra: true } as never,
  });
  assert.deepEqual(change.command, {
    placement: { afterRowId: "row-2", beforeRowId: null },
    rowId: "row-1",
    type: "row.change",
  });
  assert.deepEqual(builders.buildRowDuplicate(scope, { rowId: "row-1" }).command, {
    type: "row.duplicate",
    rowId: "row-1",
  });
  assert.deepEqual(
    builders.buildRowDuplicate(scope, { rowId: "row-1", parentRowId: "copy-1" }).command,
    { type: "row.duplicate", rowId: "row-1", parentRowId: "copy-1" },
  );
});
