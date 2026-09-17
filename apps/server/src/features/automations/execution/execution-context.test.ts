import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[][], predicates: [] as unknown[], joins: [] as unknown[] }));
vi.mock("../../../infrastructure/database", () => ({
  db: {
    select() {
      const rows = mocks.rows.shift();
      if (!rows) throw new Error("Unexpected database read");
      const builder = {
        from() { return builder; },
        innerJoin(_table: unknown, predicate: unknown) { mocks.joins.push(predicate); return builder; },
        where(predicate: unknown) { mocks.predicates.push(predicate); return builder; },
        limit() { return builder; }, orderBy() { return builder; },
        then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(rows).then(resolve); },
      };
      return builder;
    },
  },
}));
import { loadExecutionContext } from "./execution-context";

const definition = {
  definitionVersion: 1,
  scope: { type: "data_source" }, timezone: "UTC",
  trigger: { kind: "schedule", schedule: { frequency: "daily", interval: 1, localTime: "09:00", startDate: "2026-01-01", timezone: "UTC" } },
  actions: [{ id: "pinned-action", type: "define_variables", variables: [{ name: "result", expression: { type: "literal", value: 7 } }] }],
};
const record = () => ({
  automation: { id: "automation-1", currentRevisionId: "newer-revision" },
  revision: { id: "pinned-revision", definition },
  run: { id: "run-1", revisionId: "pinned-revision", dataSourceId: "source-1", scheduledFor: new Date("2026-01-01T09:00:00Z") },
});
beforeEach(() => { mocks.rows.length = mocks.predicates.length = mocks.joins.length = 0; });

it("loads the run's pinned revision and completed receipts under its worker claim", async () => {
  mocks.rows.push([record()], [], [{ actionId: "pinned-action", outputSummary: { variables: { result: 7 } } }]);
  const loaded = await loadExecutionContext("run-1", "worker-1");
  expect(loaded?.definition.actions[0]?.id).toBe("pinned-action");
  expect(loaded?.row).toBeNull();
  expect(loaded?.completedSteps).toHaveLength(1);
  const dialect = new PgDialect();
  const joins = mocks.joins.map(value => dialect.sqlToQuery(value as SQL).sql);
  expect(joins).toContain('"database_automation_revision"."id" = "database_automation_run"."revision_id"');
  expect(dialect.sqlToQuery(mocks.predicates[0] as SQL).params).toEqual(["run-1", "running", "worker-1"]);
});

it("rejects an invalid pinned revision and a scheduled run without its occurrence", async () => {
  mocks.rows.push([{ ...record(), revision: { definition: {} } }]);
  await expect(loadExecutionContext("run-1", "worker-1")).rejects.toMatchObject({ code: "AUTOMATION_REVISION_INVALID" });
  mocks.rows.push([{ ...record(), run: { ...record().run, scheduledFor: null } }]);
  await expect(loadExecutionContext("run-1", "worker-1")).rejects.toMatchObject({ code: "AUTOMATION_SCHEDULE_MISSING" });
});

it("does not load context when the worker no longer owns a running claim", async () => {
  mocks.rows.push([]);
  expect(await loadExecutionContext("run-1", "other-worker")).toBeNull();
  expect(mocks.rows).toHaveLength(0);
});
