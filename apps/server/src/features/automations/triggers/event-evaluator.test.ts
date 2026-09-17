import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  window: {} as Record<string, unknown>,
  writes: [] as Record<string, unknown>[],
  runs: [] as Record<string, unknown>[],
  dispatched: [] as unknown[][],
  denied: false,
  duplicate: false,
}));
vi.mock("../../../infrastructure/database", () => {
  function result(rows: unknown[]) {
    const chain = {
      from: () => chain,
      where: () => chain,
      innerJoin: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      for: () => chain,
      then: Promise.resolve(rows).then.bind(Promise.resolve(rows)),
    };
    return chain;
  }
  const tx = {
    execute: async () => ({ rows: [{ now: new Date() }] }),
    select: () => result(state.rows.shift() ?? []),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        state.writes.push(value);
        return {
          where: () =>
            Object.assign(result([]), {
              returning: async () => [state.window],
            }),
        };
      },
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        state.runs.push(value);
        return {
          onConflictDoNothing: () => ({
            returning: async () => (state.duplicate ? [] : [{ id: value.id }]),
          }),
        };
      },
    }),
  };
  return {
    db: {
      ...tx,
      transaction: async (run: (tx: unknown) => unknown) => run(tx),
    },
  };
});
vi.mock("./event-capture", () => ({
  promoteClosedDatabaseAutomationEventWindows: async () => {},
}));
vi.mock("../../databases/access/data-source-access", () => ({
  requireDataSourceAccess: async () => {
    if (state.denied) throw new Error("Revoked");
    return { id: "source" };
  },
}));
vi.mock("../../../infrastructure/background/dispatch", () => ({
  dispatchBackgroundTasks: async (_env: unknown, tasks: unknown[]) => {
    state.dispatched.push(tasks);
  },
}));
import { drainDatabaseAutomationEventWindows } from "./event-evaluator";
const definition = {
  definitionVersion: 1,
  timezone: "UTC",
  scope: { type: "data_source" },
  trigger: {
    kind: "event",
    match: "all",
    clauses: [{ id: "added", type: "page_added" }],
  },
  actions: [
    {
      id: "variables",
      type: "define_variables",
      variables: [{ name: "ok", expression: { type: "literal", value: true } }],
    },
  ],
};
beforeEach(() => {
  state.rows = [];
  state.writes = [];
  state.runs = [];
  state.dispatched = [];
  state.denied = false;
  state.duplicate = false;
  state.window = {
    id: "window",
    dataSourceId: "source",
    rowId: "row",
    pageId: "page",
    workspaceId: "workspace",
    status: "processing",
    attempts: 0,
    rowAdded: true,
    changedPropertyIds: [],
    afterValues: {},
    beforeValues: {},
    origins: ["user"],
    lastFactAt: new Date("2026-01-01"),
    triggerActorId: "actor",
  };
});
function queue(
  options: {
    locked?: boolean;
    owner?: string | null;
    scope?: unknown;
    unavailable?: boolean;
  } = {},
) {
  state.rows.push(
    [{ id: "window", status: "ready" }],
    [state.window],
    [
      {
        config: { locked: options.locked ?? false },
        parentDatabaseId: "database",
      },
    ],
    options.unavailable ? [] : [{ id: "row", pageId: "page", title: "Title" }],
  );
  if (!options.unavailable)
    state.rows.push(
      [],
      [],
      [
        {
          automation: {
            id: "automation",
            ownerUserId: options.owner === undefined ? "owner" : options.owner,
          },
          revision: {
            id: "revision",
            definitionHash: "hash",
            definition: {
              ...definition,
              scope: options.scope ?? definition.scope,
            },
          },
        },
      ],
    );
}
test("event windows pin matching revisions and dispatch only newly queued runs", async () => {
  queue();
  assert.deepEqual(
    await drainDatabaseAutomationEventWindows({}, { workerId: "worker" }),
    { claimed: 1, completed: 1, retried: 0, runsCreated: 1 },
  );
  assert.equal(state.runs[0].revisionId, "revision");
  assert.equal(state.runs[0].definitionHash, "hash");
  assert.equal(state.runs[0].status, "queued");
  assert.equal(state.runs[0].eventWindowId, "window");
  assert.equal(state.writes.at(-1)?.status, "completed");
  assert.equal(state.dispatched[0].length, 1);
  state.duplicate = true;
  queue();
  assert.equal(
    (await drainDatabaseAutomationEventWindows({}, { workerId: "worker" }))
      .runsCreated,
    0,
  );
  assert.equal(state.dispatched[1].length, 0);
});
test("event windows record locked, revoked and missing-view skips without dispatching runs", async () => {
  for (const [options, denied, reason] of [
    [{ locked: true }, false, "locked_database"],
    [{}, true, "revoked_authority"],
    [{ owner: null }, false, "revoked_authority"],
    [{ scope: { type: "view", viewId: "view" } }, false, "view_mismatch"],
  ] as const) {
    state.denied = denied;
    queue(options);
    if ("scope" in options) state.rows.push([]);
    assert.equal(
      (await drainDatabaseAutomationEventWindows({}, { workerId: "worker" }))
        .runsCreated,
      0,
    );
    assert.equal(state.runs.at(-1)?.skipReason, reason);
    assert.equal(state.runs.at(-1)?.status, "skipped");
  }
});
test("event windows discard missing rows and respect execution disablement", async () => {
  assert.deepEqual(
    await drainDatabaseAutomationEventWindows({
      DATABASE_AUTOMATIONS_EXECUTION_DISABLED: "true",
    }),
    { claimed: 0, completed: 0, retried: 0, runsCreated: 0 },
  );
  assert.equal(state.writes.length, 0);
  queue({ unavailable: true });
  assert.equal(
    (await drainDatabaseAutomationEventWindows({}, { workerId: "worker" }))
      .completed,
    1,
  );
  assert.equal(state.writes.at(-1)?.terminalReason, "row_unavailable");
  assert.deepEqual(state.runs, []);
});
