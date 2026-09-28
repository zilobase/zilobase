import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type {
  DatabaseCommandAck,
  DatabaseCommandRequest,
} from "@zilobase/features/databases/contracts";

const background = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("../../../infrastructure/background/dispatch", () => ({
  dispatchBackgroundTasks: background.dispatch,
}));

import {
  dataSource,
  database,
  databaseCommandReceipt,
  databaseActorState,
  databaseDataSource,
  databaseMutationEvent,
  databaseRealtimeOutbox,
} from "../../../infrastructure/database/schema";
import {
  CommandIdReusedError,
  executeDatabaseCommand,
  hashDatabaseCommandRequest,
  type DatabaseCommandContext,
  type DatabaseCommandDispatcher,
} from "./framework";

const request: DatabaseCommandRequest = {
  command: {
    patch: { configuration: [{ operation: "set", path: ["layout"], value: { b: 2, a: 1 } }] },
    type: "database.update",
  },
  commandId: "command-1",
  protocolVersion: 2,
};

const replayAck: DatabaseCommandAck = {
  commandId: "command-1",
  event: {
    actorId: "user-1",
    areas: ["databases"],
    changes: {},
    commandId: "command-1",
    committedAt: "2026-09-14T00:00:00.000Z",
    databaseId: "database-1",
    dataSourceId: null,
    eventId: "event-existing",
    protocolVersion: 2,
    type: "database.mutation",
    version: 4,
  },
  sourceVersions: {},
  result: { saved: true },
};

function transactionHarness(
  options: {
    databaseVersions?: number[];
    linked?: boolean;
    receipt?: Record<string, unknown>;
    sourceVersion?: number;
    lifecycle?: boolean;
  } = {},
) {
  const inserts = new Map<unknown, unknown[]>();
  const updates: unknown[] = [];
  const databaseVersions = [...(options.databaseVersions ?? [5])];
  const execute = vi.fn(async () => undefined);

  const rowsFor = (table: unknown) => {
    if (table === databaseCommandReceipt) {
      return options.receipt ? [options.receipt] : [];
    }
    if (options.lifecycle) {
      if (table === database) return [{ workspaceId: "workspace-1" }];
      if (table === dataSource) return [{ id: "source-1" }];
      if (table === databaseDataSource)
        return [{ databaseId: "database-1" }, { databaseId: "linked-host" }];
    }
    return options.linked === false ? [] : [{ dataSourceId: "source-1" }];
  };
  const tx = {
    execute,
    insert(table: unknown) {
      return {
        values(value: unknown) {
          inserts.set(table, [
            ...(inserts.get(table) ?? []),
            ...(Array.isArray(value) ? value : [value]),
          ]);
          return {
            then(resolve: (value: undefined) => unknown) {
              return Promise.resolve(resolve(undefined));
            },
            onConflictDoUpdate() {
              return {
                async returning() {
                  return [{ revision: 1 }];
                },
              };
            },
          };
        },
      };
    },
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                then(resolve: (value: ReturnType<typeof rowsFor>) => unknown) {
                  return Promise.resolve(resolve(rowsFor(table)));
                },
                for() {
                  return {
                    async limit() {
                      return rowsFor(table);
                    },
                  };
                },
                async limit() {
                  return rowsFor(table);
                },
              };
            },
          };
        },
      };
    },
    update(table: unknown) {
      updates.push(table);
      return {
        set() {
          return {
            where() {
              return {
                async returning() {
                  if (table === dataSource) {
                    return options.sourceVersion === undefined
                      ? []
                      : [{ version: options.sourceVersion }];
                  }
                  assert.equal(table, database);
                  const version = databaseVersions.shift();
                  return version === undefined ? [] : [{ version }];
                },
              };
            },
          };
        },
      };
    },
  };
  return {
    database: {
      transaction: async <T>(callback: (active: typeof tx) => Promise<T>) => callback(tx),
    },
    execute,
    inserts,
    updates,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  background.dispatch.mockReset();
  background.dispatch.mockResolvedValue(true);
});

test("private favorite receipts advance only the actor revision and never publish an event", async () => {
  const harness = transactionHarness();
  const acknowledgement = await executeDatabaseCommand(
    {
      actorId: "user-1",
      scope: { databaseId: "database-1", dataSourceId: null },
      request: {
        commandId: "favorite-1",
        protocolVersion: 2,
        command: { type: "database.favorite", favorite: true },
      },
    },
    {
      database: harness.database as never,
      dispatch: (async () => {
        assert.equal(
          harness.execute.mock.calls.length,
          2,
          "command and actor lanes lock before the private value write",
        );
        assert.equal(harness.inserts.has(databaseActorState), false);
        return { result: { isFavorite: true }, mutations: [] };
      }) as DatabaseCommandDispatcher,
    },
  );
  assert.equal(acknowledgement.event, null);
  assert.deepEqual(acknowledgement.privateConfirmation, {
    databaseId: "database-1",
    actorId: "user-1",
    revision: 1,
  });
  assert.equal(harness.inserts.has(databaseActorState), true);
  assert.equal(harness.inserts.has(databaseCommandReceipt), true);
  assert.equal(harness.inserts.has(databaseMutationEvent), false);
  assert.equal(harness.inserts.has(databaseRealtimeOutbox), false);
  assert.deepEqual(harness.updates, []);
});

test("rejected authorization does not write revisions, dispatch or receipts", async () => {
  const harness = transactionHarness();
  const dispatch = vi.fn();
  await assert.rejects(
    executeDatabaseCommand(
      { actorId: "user-1", request, scope: { databaseId: "database-1", dataSourceId: null } },
      {
        database: harness.database as never,
        dispatch: dispatch as DatabaseCommandDispatcher,
        authorize: async () => {
          throw new Error("Forbidden");
        },
      },
    ),
    /Forbidden/,
  );
  assert.equal(dispatch.mock.calls.length, 0);
  assert.deepEqual(harness.updates, []);
  assert.equal(harness.inserts.size, 0);
});

test("a failed command never runs registered post-commit delivery", async () => {
  const harness = transactionHarness();
  const delivery = vi.fn();
  await assert.rejects(
    executeDatabaseCommand(
      { actorId: "user-1", request, scope: { databaseId: "database-1", dataSourceId: null } },
      {
        database: harness.database as never,
        dispatch: (async (context) => {
          context.afterCommit!(delivery);
          throw new Error("Rejected");
        }) as DatabaseCommandDispatcher,
      },
    ),
    /Rejected/,
  );
  assert.equal(delivery.mock.calls.length, 0);
});

test("command hashes are stable across object key order and include route scope", async () => {
  const reordered: DatabaseCommandRequest = {
    ...request,
    command: {
      patch: { configuration: [{ operation: "set", path: ["layout"], value: { a: 1, b: 2 } }] },
      type: "database.update",
    },
  };
  const host = { databaseId: "database-1", dataSourceId: null };
  assert.equal(
    await hashDatabaseCommandRequest(host, request),
    await hashDatabaseCommandRequest(host, reordered),
  );
  assert.notEqual(
    await hashDatabaseCommandRequest(host, request),
    await hashDatabaseCommandRequest({ ...host, databaseId: "database-2" }, request),
  );
});

test("execution locks the command ID and atomically stores its event and receipt", async () => {
  const harness = transactionHarness({ databaseVersions: [5] });
  const dispatchMock = vi.fn(async (context: DatabaseCommandContext) => ({
    mutations: [
      {
        areas: ["databases"] as const,
        changes: {},
        databaseId: context.databaseId,
        dataSourceId: null,
      },
    ],
    sourceVersions: {},
    result: { saved: true },
  }));
  const dispatch = dispatchMock as unknown as DatabaseCommandDispatcher;

  const ack = await executeDatabaseCommand(
    {
      actorId: "user-1",
      request,
      scope: { databaseId: "database-1", dataSourceId: null },
    },
    {
      database: harness.database as never,
      dispatch,
      now: () => new Date("2026-09-14T00:00:00.000Z"),
      randomUUID: () => "event-1",
    },
  );

  assert.equal(harness.execute.mock.calls.length, 2);
  assert.equal(dispatchMock.mock.calls[0]?.[0].commandId, "command-1");
  assert.ok(ack.event);
  assert.equal(ack.event.eventId, "event-1");
  assert.equal(ack.event.version, 5);
  assert.equal(harness.inserts.get(databaseMutationEvent)?.length, 1);
  assert.deepEqual(harness.inserts.get(databaseRealtimeOutbox), [
    {
      eventId: "event-1",
      id: "event-1",
    },
  ]);
  const receipts = harness.inserts.get(databaseCommandReceipt) as Array<{
    acknowledgement: DatabaseCommandAck;
    expiresAt: Date;
  }>;
  assert.equal(receipts.length, 1);
  assert.deepEqual(receipts[0]?.acknowledgement, ack);
  assert.equal(receipts[0]?.expiresAt.toISOString(), "2026-09-21T00:00:00.000Z");
});

test("committed commands enqueue delivery without publishing a socket event inline", async () => {
  const harness = transactionHarness({ databaseVersions: [5] });
  const dispatch = (async (context: DatabaseCommandContext) => ({
    mutations: [
      {
        areas: ["databases"],
        changes: {},
        databaseId: context.databaseId,
        dataSourceId: null,
      },
    ],
    sourceVersions: {},
    result: null,
  })) as DatabaseCommandDispatcher;
  await executeDatabaseCommand(
    {
      actorId: "user-1",
      env: { ZILOBASE_RUNTIME_KIND: "worker" },
      request,
      scope: { databaseId: "database-1", dataSourceId: null },
    },
    {
      database: harness.database as never,
      dispatch,
      randomUUID: () => "event-background",
    },
  );
  assert.equal(background.dispatch.mock.calls.length, 1);
  assert.deepEqual(
    background.dispatch.mock.calls[0]?.[1].map((task: { kind: string; resourceId: string }) => ({
      kind: task.kind,
      resourceId: task.resourceId,
    })),
    [{ kind: "realtime.database", resourceId: "event-background" }],
  );
});

test("identical retries replay the stored acknowledgement without side effects", async () => {
  const scope = { databaseId: "database-1", dataSourceId: null };
  const requestHash = await hashDatabaseCommandRequest(scope, request);
  const harness = transactionHarness({
    receipt: {
      acknowledgement: replayAck,
      actorId: "user-1",
      dataSourceId: null,
      databaseId: "database-1",
      requestHash,
    },
  });
  const dispatchMock = vi.fn();
  const dispatch = dispatchMock as unknown as DatabaseCommandDispatcher;
  const ack = await executeDatabaseCommand(
    { actorId: "user-1", request, scope },
    {
      database: harness.database as never,
      dispatch,
    },
  );

  assert.deepEqual(ack, replayAck);
  assert.equal(dispatchMock.mock.calls.length, 0);
  assert.equal(harness.inserts.size, 0);
});

test("reusing a command ID with another body is rejected", async () => {
  const harness = transactionHarness({
    receipt: {
      acknowledgement: replayAck,
      actorId: "user-1",
      dataSourceId: null,
      databaseId: "database-1",
      requestHash: "another-request",
    },
  });

  await assert.rejects(
    executeDatabaseCommand(
      {
        actorId: "user-1",
        request,
        scope: { databaseId: "database-1", dataSourceId: null },
      },
      {
        database: harness.database as never,
        dispatch: vi.fn() as unknown as DatabaseCommandDispatcher,
      },
    ),
    (error: unknown) => error instanceof CommandIdReusedError && error.status === 409,
  );
});

test("source commands verify host linkage and increment the source version", async () => {
  const unlinked = transactionHarness({ linked: false, sourceVersion: 8 });
  await assert.rejects(
    executeDatabaseCommand(
      {
        actorId: "user-1",
        request: {
          command: { patch: { name: "Tasks" }, type: "dataSource.update" },
          commandId: "source-command",
          protocolVersion: 2,
        },
        scope: { databaseId: "database-1", dataSourceId: "source-1" },
      },
      {
        database: unlinked.database as never,
        dispatch: vi.fn() as unknown as DatabaseCommandDispatcher,
      },
    ),
    /Data source is not linked/,
  );
});

test("sub-item configuration reserves the source before the host and confirms both clocks", async () => {
  const harness = transactionHarness({ databaseVersions: [5], sourceVersion: 3 });
  const ack = await executeDatabaseCommand(
    {
      actorId: "user-1",
      scope: { databaseId: "database-1", dataSourceId: null },
      request: {
        commandId: "setup",
        protocolVersion: 2,
        command: {
          type: "view.update",
          viewId: "view-1",
          patch: {
            configuration: [{ operation: "set", path: ["subItems"], value: { enabled: true } }],
          },
        },
      },
    },
    {
      database: harness.database as never,
      dispatch: (async (context) => ({
        result: {},
        mutations: [
          {
            databaseId: context.databaseId,
            dataSourceId: "source-1",
            areas: ["views", "properties"],
            changes: {},
          },
        ],
      })) as DatabaseCommandDispatcher,
    },
  );
  assert.deepEqual(harness.updates.slice(0, 2), [dataSource, database]);
  assert.deepEqual(ack.sourceVersions, { "source-1": 3 });
  assert.equal(ack.event?.version, 5);
});

test.each(["database.archive", "database.restore"] as const)(
  "%s advances owned source clocks and resets linked hosts once",
  async (type) => {
    const harness = transactionHarness({
      lifecycle: true,
      databaseVersions: [5, 8],
      sourceVersion: 3,
    });
    const ack = await executeDatabaseCommand(
      {
        actorId: "user-1",
        scope: { databaseId: "database-1", dataSourceId: null },
        request: { commandId: "lifecycle", protocolVersion: 2, command: { type } },
      },
      {
        database: harness.database as never,
        dispatch: (async () => ({
          result: {},
          mutations: [
            { databaseId: "database-1", dataSourceId: null, areas: ["databases"], changes: {} },
          ],
        })) as DatabaseCommandDispatcher,
      },
    );
    assert.deepEqual(ack.sourceVersions, { "source-1": 3 });
    assert.equal(ack.event?.requiresReset, true);
    const events = harness.inserts.get(databaseMutationEvent) as Array<{
      databaseId: string;
    }>;
    assert.deepEqual(events.map(({ databaseId }) => databaseId).sort(), [
      "database-1",
      "linked-host",
    ]);
    assert.equal(harness.execute.mock.calls.length, 2);
  },
);

test("a linked source version is incremented before its handler builds entities", async () => {
  const harness = transactionHarness({ databaseVersions: [7], sourceVersion: 3 });
  const dispatchMock = vi.fn(async (context: DatabaseCommandContext) => {
    assert.equal(harness.updates[0], dataSource);
    return {
      mutations: [
        {
          areas: ["dataSources"] as const,
          changes: {},
          databaseId: context.databaseId,
          dataSourceId: context.dataSourceId,
        },
      ],
      sourceVersions: {},
      result: null,
    };
  });
  await executeDatabaseCommand(
    {
      actorId: "user-1",
      request: {
        command: { patch: { name: "Tasks" }, type: "dataSource.update" },
        commandId: "source-command",
        protocolVersion: 2,
      },
      scope: { databaseId: "database-1", dataSourceId: "source-1" },
    },
    {
      database: harness.database as never,
      dispatch: dispatchMock as unknown as DatabaseCommandDispatcher,
    },
  );
  assert.deepEqual(harness.updates.slice(0, 2), [dataSource, database]);
});

test("oversized changesets produce a reset event instead of truncated data", async () => {
  const harness = transactionHarness();
  const removedRecordIds = Array.from(
    { length: 700 },
    (_, index) => `row-${String(index).padStart(3, "0")}-${"x".repeat(100)}`,
  );
  const dispatch = (async (context) => ({
    mutations: [
      {
        areas: ["records"],
        changes: { removedRecordIds },
        databaseId: context.databaseId,
        dataSourceId: null,
      },
    ],
    sourceVersions: {},
    result: null,
  })) as DatabaseCommandDispatcher;
  const ack = await executeDatabaseCommand(
    {
      actorId: "user-1",
      request,
      scope: { databaseId: "database-1", dataSourceId: null },
    },
    {
      database: harness.database as never,
      dispatch,
      randomUUID: () => "event-large",
    },
  );

  assert.ok(ack.event);
  assert.equal(ack.event.requiresReset, true);
  assert.deepEqual(ack.event.changes, {});
});

test("opposing transfers lock sources in one order and return only touched source clocks", async () => {
  for (const [destination, origin] of [
    ["source-z", "source-a"],
    ["source-a", "source-z"],
  ]) {
    const harness = transactionHarness({ sourceVersion: 8, databaseVersions: [12] });
    const ack = await executeDatabaseCommand(
      {
        actorId: "user-1",
        scope: { databaseId: "database-1", dataSourceId: destination },
        request: {
          commandId: "transfer-" + destination,
          protocolVersion: 2,
          command: {
            type: "row.place",
            pageId: "page-1",
            afterRowId: null,
            beforeRowId: null,
            parentRowId: null,
            source: {
              databaseId: "database-1",
              dataSourceId: origin,
              rowId: "row-1",
              propertyMode: "match",
            },
          },
        },
      },
      {
        database: harness.database as never,
        dispatch: (async () => ({
          mutations: [
            {
              databaseId: "database-1",
              dataSourceId: destination,
              changes: {},
              areas: ["records"],
            },
          ],
          result: {},
        })) as DatabaseCommandDispatcher,
      },
    );
    assert.deepEqual(Object.keys(ack.sourceVersions), ["source-a", "source-z"]);
    assert.deepEqual(ack.sourceVersions, { "source-a": 8, "source-z": 8 });
    assert.equal(
      harness.execute.mock.calls.length,
      3,
      "receipt lock followed by both source locks",
    );
    assert.deepEqual(harness.updates.slice(0, 2), [dataSource, dataSource]);
  }
});
