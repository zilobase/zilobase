import assert from "node:assert/strict";
import { test } from "node:test";
import type { DatabaseRecordEntity } from "../core/entities";
import { projectRecordInteractions, remapRecordIdentity, type DatabaseIntention } from "./model";

const row = (id: string): DatabaseRecordEntity => ({
  id,
  pageId: `page-${id}`,
  dataSourceId: "source",
  orderKey: "1024.0000000000",
  parentRowId: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  valuesByPropertyId: {},
  page: {
    id: `page-${id}`,
    name: id,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    deletedAt: null,
    hasContent: false,
    metadata: null,
  },
});
const scope = { dataSourceId: "source", sourceVersion: 1 };
const move = (id: string, rowId: string, afterRowId: string | null): DatabaseIntention => ({
  id,
  status: "saving",
  effects: [{ dataSourceId: "source", rowId, placement: { afterRowId, beforeRowId: null } }],
});
const ids = (rows: DatabaseRecordEntity[]) => rows.map(({ id }) => id);

test("rapid moves replay over stale reads and rejecting one preserves later intent", () => {
  const base = [row("a"), row("b"), row("c")];
  const first = move("one", "a", "b");
  const second = move("two", "a", "c");
  assert.deepEqual(ids(projectRecordInteractions(base, [first, second], scope)), ["b", "c", "a"]);
  assert.deepEqual(ids(projectRecordInteractions(base, [second], scope)), ["b", "c", "a"]);
  assert.deepEqual(ids(base), ["a", "b", "c"]);
});

test("acknowledgement retires per window, never by a sibling's freshness", () => {
  const operation = {
    ...move("one", "a", "b"),
    status: "committed" as const,
    sourceVersions: { source: 2 },
  };
  const base = [row("a"), row("b")];
  assert.deepEqual(ids(projectRecordInteractions(base, [operation], scope)), ["b", "a"]);
  assert.equal(projectRecordInteractions(base, [operation], { ...scope, sourceVersion: 2 }), base);
  assert.deepEqual(
    ids(projectRecordInteractions(base, [operation], { ...scope, sourceVersion: null })),
    ["b", "a"],
  );
});

test("sparse changes preserve refreshed fields and sequence cell and group writes", () => {
  const first = move("one", "a", "b");
  first.effects = [{ ...first.effects[0]!, values: { status: "done" }, title: "moved" }];
  const second: DatabaseIntention = {
    id: "two",
    status: "queued",
    effects: [{ dataSourceId: "source", rowId: "a", values: { status: "open" } }],
  };
  const base = [{ ...row("a"), updatedAt: "fresh" }, row("b")];
  const result = projectRecordInteractions(base, [first, second], scope);
  assert.equal(result[1]!.page.name, "moved");
  assert.equal(result[1]!.updatedAt, "fresh");
  assert.equal(result[1]!.valuesByPropertyId.status!.value, "open");
  assert.deepEqual(base[0]!.valuesByPropertyId, {});
});

test("transfer projects both sources and remaps dependent anchors", () => {
  const temporary = { ...row("temp"), dataSourceId: "destination" };
  const transfer: DatabaseIntention = {
    id: "one",
    status: "unconfirmed",
    effects: [
      { dataSourceId: "source", rowId: "a", remove: true },
      { dataSourceId: "destination", rowId: "temp", record: temporary },
    ],
  };
  assert.deepEqual(projectRecordInteractions([row("a")], [transfer], scope), []);
  assert.deepEqual(
    ids(
      projectRecordInteractions([], [transfer], { dataSourceId: "destination", sourceVersion: 1 }),
    ),
    ["temp"],
  );
  const dependent = move("two", "b", "temp");
  assert.equal(
    remapRecordIdentity(dependent, "temp", row("confirmed")).effects[0]!.placement!.afterRowId,
    "confirmed",
  );
  assert.deepEqual(ids(projectRecordInteractions([row("a")], [], scope)), ["a"]);
});

test("a queued transfer retains its row identity but remaps a newly created page", () => {
  const pending = row("destination-temp");
  pending.pageId = "page-temp";
  pending.page.id = "page-temp";
  const interaction: DatabaseIntention = {
    id: "transfer",
    status: "queued",
    effects: [
      {
        dataSourceId: "destination",
        rowId: pending.id,
        record: pending,
        values: { relation: ["page-temp"] },
      },
    ],
  };
  const result = remapRecordIdentity(interaction, "temp", row("confirmed"), "page-temp");
  assert.equal(result.effects[0]!.record!.id, "destination-temp");
  assert.equal(result.effects[0]!.record!.pageId, "page-confirmed");
  assert.deepEqual(result.effects[0]!.values!.relation, ["page-confirmed"]);
});
