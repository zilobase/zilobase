import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { aiAgentTrigger, automationSecret } from "../../../infrastructure/database/schema";
const schedule = vi.hoisted(() => ({
  calls: [] as unknown[],
  next: new Date("2030-01-02"),
}));
vi.mock("./agent-definition", async (original) => ({
  ...(await original<typeof import("./agent-definition")>()),
  computeNextAgentSchedule: (config: unknown) => {
    schedule.calls.push(config);
    return schedule.next;
  },
}));
import { synchronizeMaterializedTriggers } from "./agent-revision-service";
type Tx = Parameters<typeof synchronizeMaterializedTriggers>[0];
type Desired = Parameters<typeof synchronizeMaterializedTriggers>[3];
function transaction(rows: unknown[]) {
  const deletes: unknown[] = [],
    updates: Record<string, unknown>[] = [],
    inserts: Record<string, unknown>[] = [];
  const tx = {
    select: () => ({ from: () => ({ where: async () => rows }) }),
    delete: (table: unknown) => ({
      where: async () => {
        deletes.push(table);
      },
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => ({
        where: async () => {
          updates.push(value);
        },
      }),
    }),
    insert: () => ({
      values: async (value: Record<string, unknown>) => {
        inserts.push(value);
      },
    }),
  } as unknown as Tx;
  return { tx, deletes, updates, inserts };
}
beforeEach(() => {
  schedule.calls = [];
});
test("trigger materialization removes secrets before obsolete triggers and preserves unchanged schedules", async () => {
  const nextRunAt = new Date("2030-01-01");
  const fixture = transaction([
    { id: "obsolete", webhookSecretId: "secret" },
    {
      id: "scheduled",
      kind: "schedule",
      status: "active",
      config: { cadence: "daily" },
      nextRunAt,
    },
  ]);
  const desired = [
    {
      id: "manual",
      kind: "manual",
      status: "active",
      label: "Manual",
      config: {},
    },
    {
      id: "scheduled",
      kind: "schedule",
      status: "active",
      label: "Daily",
      config: { cadence: "daily" },
    },
    ...["webhook", "connector", "slack"].map((kind) => ({
      id: kind,
      kind,
      status: "active",
      label: kind,
      config: {},
    })),
  ] as Desired;
  await synchronizeMaterializedTriggers(
    fixture.tx,
    "profile",
    "revision",
    desired,
    new Date("2029-01-01"),
  );
  assert.deepEqual(fixture.deletes, [automationSecret, aiAgentTrigger]);
  assert.equal(fixture.updates[0].nextRunAt, nextRunAt);
  assert.equal(fixture.updates[0].revisionId, "revision");
  assert.deepEqual(schedule.calls, []);
  assert.deepEqual(
    fixture.inserts.map((value) => [value.kind, value.status, value.nextRunAt]),
    [
      ["webhook", "paused", null],
      ["connector", "degraded", null],
      ["slack", "degraded", null],
    ],
  );
});
test("trigger materialization recomputes changed or resumed schedules and clears paused runs", async () => {
  for (const scenario of [
    {
      existing: {
        status: "active",
        config: { cadence: "weekly" },
        nextRunAt: new Date("2030-01-01"),
      },
      status: "active",
      recompute: true,
    },
    {
      existing: {
        status: "paused",
        config: { cadence: "daily" },
        nextRunAt: null,
      },
      status: "active",
      recompute: true,
    },
    {
      existing: {
        status: "active",
        config: { cadence: "daily" },
        nextRunAt: null,
      },
      status: "active",
      recompute: true,
    },
    {
      existing: {
        status: "active",
        config: { cadence: "daily" },
        nextRunAt: new Date("2030-01-01"),
      },
      status: "paused",
      recompute: false,
    },
  ]) {
    schedule.calls = [];
    const fixture = transaction([{ id: "scheduled", kind: "schedule", ...scenario.existing }]);
    await synchronizeMaterializedTriggers(
      fixture.tx,
      "profile",
      "revision",
      [
        {
          id: "scheduled",
          kind: "schedule",
          status: scenario.status,
          label: "Daily",
          config: { cadence: "daily" },
        },
      ] as Desired,
      new Date("2029-01-01"),
    );
    assert.equal(fixture.updates[0].nextRunAt, scenario.recompute ? schedule.next : null);
    assert.equal(schedule.calls.length, scenario.recompute ? 1 : 0);
  }
});
