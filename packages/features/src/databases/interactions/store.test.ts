import assert from "node:assert/strict";
import { test } from "node:test";
import { TestQueryClient as QueryClient } from "../../data/testing";
import type { ApiFetcher } from "../../shared/api-fetcher";
import { DatabaseController } from "./store";
import { DatabaseCommandUnconfirmedError, DatabaseReconciliationError } from "../mutations/execute";
import { databaseAccessQueryKey } from "../queries/queries";
import { pagesQueryKey, pageQueryKey } from "../../pages/queries";

function harness() {
  const requests: Array<{
    body: string;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];
  const apiFetch = ((_: string, init?: RequestInit) =>
    new Promise<unknown>((resolve, reject) =>
      requests.push({ body: String(init?.body), resolve, reject }),
    )) as ApiFetcher;
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const store = new DatabaseController(client, "session", apiFetch);
  const token = {};
  store.observe(token, { dataSourceId: "source", sourceVersion: 1 });
  const submit = (rowId = "row", source = "source") =>
    store.submit(
      {
        databaseId: "host",
        dataSourceId: source,
        command: { type: "row.change", rowId, title: rowId },
      },
      [{ dataSourceId: source, rowId, title: rowId }],
    );
  const ack = (
    index: number,
    version = 2,
    source = "source",
    result: unknown = {},
    versions = { [source]: version },
  ) => {
    const { commandId } = JSON.parse(requests[index]!.body);
    requests[index]!.resolve({
      commandId,
      result,
      sourceVersions: versions,
      event: {
        actorId: "user",
        areas: ["records"],
        changes: {},
        commandId,
        committedAt: new Date().toISOString(),
        databaseId: "host",
        dataSourceId: source,
        eventId: commandId,
        protocolVersion: 2,
        type: "database.mutation",
        version,
      },
    });
  };
  return {
    client,
    store,
    requests,
    submit,
    ack,
    token,
    close: () => {
      store.dispose();
      client.clear();
    },
  };
}
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

test("host configuration forms a barrier between record writes without blocking unrelated hosts", async () => {
  const h = harness();
  try {
    const first = h.submit("row");
    const metadata = h.store.execute({
      databaseId: "host",
      command: { type: "view.update", viewId: "view", patch: { name: "Renamed" } },
    });
    const next = h.submit("next");
    assert.equal(h.requests.length, 1);
    h.ack(0);
    await first;
    await tick();
    assert.equal(h.requests.length, 2);
    assert.equal(JSON.parse(h.requests[1]!.body).command.type, "view.update");
    h.ack(1);
    await metadata;
    await tick();
    assert.equal(h.requests.length, 3);
    h.ack(2);
    await next;
  } finally {
    h.close();
  }
});

test("session queue publishes synchronously, survives ack and reconciles each mounted window", async () => {
  const h = harness();
  try {
    const sibling = {};
    h.store.observe(sibling, { dataSourceId: "source", sourceVersion: null });
    const first = h.submit();
    const second = h.submit("second");
    assert.equal(h.store.getSnapshot().length, 2);
    assert.equal(h.requests.length, 1);
    h.ack(0);
    await first;
    await tick();
    assert.equal(h.requests.length, 2);
    h.ack(1, 3);
    await second;
    h.store.observe(h.token, { dataSourceId: "source", sourceVersion: 3 });
    assert.equal(h.store.getSnapshot().length, 2, "placeholder sibling cannot confirm");
    h.store.observe(sibling, { dataSourceId: "source", sourceVersion: 2 });
    assert.equal(h.store.getSnapshot().length, 1);
    h.store.observe(sibling, { dataSourceId: "source", sourceVersion: 3 });
    assert.equal(h.store.getSnapshot().length, 0);
  } finally {
    h.close();
  }
});

test("rejection drops only its intention and releases the next source action", async () => {
  const h = harness();
  try {
    const failed = h.submit();
    const rejection = assert.rejects(failed, /forbidden/);
    const next = h.submit("next");
    h.requests[0]!.reject(Object.assign(new Error("forbidden"), { status: 403 }));
    await rejection;
    await tick();
    assert.equal(h.store.getSnapshot().length, 1);
    assert.equal(h.requests.length, 2);
    h.ack(1);
    await next;
  } finally {
    h.close();
  }
});

test("lost responses retain intentions, block dependencies and retry the exact receipt", async () => {
  const h = harness();
  try {
    const failed = h.submit();
    const rejection = assert.rejects(failed, DatabaseCommandUnconfirmedError);
    const next = h.submit("next");
    h.requests[0]!.reject(new TypeError("network"));
    await tick();
    h.requests[1]!.reject(new TypeError("network"));
    await rejection;
    assert.equal(h.store.getSnapshot()[0]!.status, "unconfirmed");
    assert.equal(h.requests.length, 2);
    h.store.retryUnconfirmed();
    assert.equal(h.requests[2]!.body, h.requests[0]!.body);
    h.ack(2);
    await tick();
    assert.equal(h.requests.length, 4);
    h.ack(3, 3);
    await next;
  } finally {
    h.close();
  }
});

test("access receipt recovery invalidates only the confirmed host's access snapshot", async () => {
  const h = harness();
  const key = databaseAccessQueryKey("host");
  const unrelatedKey = databaseAccessQueryKey("other");
  h.client.setQueryData(key, { access: [] });
  h.client.setQueryData(unrelatedKey, { access: [] });
  try {
    const failed = h.store.execute({
      databaseId: "host",
      command: { type: "access.remove", ruleId: "rule" },
    });
    const rejection = assert.rejects(failed, DatabaseCommandUnconfirmedError);
    h.requests[0]!.reject(new TypeError("network"));
    await tick();
    h.requests[1]!.reject(new TypeError("network"));
    await rejection;
    assert.equal(h.client.getQueryState(key)?.isInvalidated, false);
    h.store.retryUnconfirmed();
    assert.equal(h.requests[2]!.body, h.requests[0]!.body);
    h.ack(2);
    await tick();
    assert.equal(h.client.getQueryState(key)?.isInvalidated, true);
    assert.equal(h.client.getQueryState(unrelatedKey)?.isInvalidated, false);
    assert.equal(h.store.commandState.get({ hostDatabaseId: "host" }).error, null);
  } finally {
    h.close();
  }
});

for (const lifecycle of ["archive", "restore"] as const) {
  test(`recovered database ${lifecycle} reconciles descendants and navigation only in its session`, async () => {
    const h = harness();
    const active = ["db", "session", "child", "bootstrap", null, false];
    const trash = ["db", "session", "child", "bootstrap", null, true];
    const other = ["db", "other-session", "child", "bootstrap", null, false];
    const page = pageQueryKey("child-page");
    const nav = pagesQueryKey("workspace");
    const unrelated = pagesQueryKey("unrelated");
    for (const key of [active, trash, other, page, nav, unrelated]) h.client.setQueryData(key, {});
    try {
      const rejected = assert.rejects(
        h.store.execute({ databaseId: "host", command: { type: `database.${lifecycle}` } }),
        DatabaseCommandUnconfirmedError,
      );
      h.requests[0]!.reject(new TypeError("network"));
      await tick();
      h.requests[1]!.reject(new TypeError("network"));
      await rejected;
      assert.ok(h.client.getQueryState(active));
      assert.equal(h.client.getQueryState(nav)?.isInvalidated, false);
      h.store.retryUnconfirmed();
      assert.equal(h.requests[2]!.body, h.requests[0]!.body);
      h.ack(2, 2, "source", {
        database: { workspaceId: "workspace" },
        ...(lifecycle === "archive"
          ? { deletedDatabaseIds: ["host", "child"], deletedPageIds: ["child-page"] }
          : { restoredDatabaseIds: ["host", "child"], restoredPageIds: ["child-page"] }),
      });
      await tick();
      assert.equal(h.client.getQueryState(nav)?.isInvalidated, true);
      assert.equal(h.client.getQueryState(unrelated)?.isInvalidated, false);
      assert.equal(h.client.getQueryState(other)?.isInvalidated, false);
      assert.equal(h.client.getQueryState(trash)?.isInvalidated, true);
      if (lifecycle === "archive") {
        assert.equal(h.client.getQueryState(active), undefined);
        assert.equal(h.client.getQueryState(page), undefined);
      } else {
        assert.equal(h.client.getQueryState(active)?.isInvalidated, true);
        assert.equal(h.client.getQueryState(page)?.isInvalidated, true);
      }
      assert.equal(h.store.commandState.get({ hostDatabaseId: "host" }).error, null);
    } finally {
      h.close();
    }
  });
}

test("view confirmation evicts inactive stale navigation without patching its contents", async () => {
  const h = harness();
  const nav = pagesQueryKey("workspace");
  const snapshot = { pages: [], placements: [], databases: [{ id: "host", name: "Saved" }] };
  h.client.setQueryData(nav, snapshot);
  try {
    const saved = h.store.execute({
      databaseId: "host",
      command: { type: "view.update", viewId: "view", patch: { name: "Renamed" } },
    });
    h.ack(0);
    await saved;
    assert.equal(h.client.getQueryData(nav), undefined);
    assert.equal(snapshot.databases[0]!.name, "Saved");
  } finally {
    h.close();
  }
});

test("creation succeeds without waiting for navigation and reports its refresh failure separately", async () => {
  const h = harness();
  const original = h.client.invalidateQueries.bind(h.client);
  let rejectRefresh!: (error: Error) => void;
  h.client.invalidateQueries = (filters, options) =>
    filters?.queryKey?.[0] === "pages"
      ? new Promise((_, reject) => {
          rejectRefresh = reject;
        })
      : original(filters, options);
  try {
    const saved = h.store.execute({
      databaseId: "workspace",
      command: { type: "database.create", workspaceId: "workspace", name: "New", standalone: true },
    });
    const { commandId } = JSON.parse(h.requests[0]!.body);
    h.requests[0]!.resolve({
      commandId,
      sourceVersions: {},
      result: {},
      event: {
        actorId: "user",
        areas: ["databases"],
        changes: {},
        commandId,
        committedAt: new Date().toISOString(),
        databaseId: commandId,
        dataSourceId: null,
        eventId: commandId,
        protocolVersion: 2,
        type: "database.mutation",
        version: 1,
      },
    });
    await saved;
    assert.equal(h.store.commandState.get({ hostDatabaseId: commandId }).isPending, false);
    rejectRefresh(new Error("Navigation unavailable"));
    await tick();
    assert.ok(h.store.getSynchronizationError() instanceof DatabaseReconciliationError);
  } finally {
    h.close();
  }
});

test("access refresh failure is synchronization failure, not a rejected committed command", async () => {
  const h = harness();
  const original = h.client.invalidateQueries.bind(h.client);
  h.client.invalidateQueries = (filters, options) =>
    filters?.queryKey?.[0] === "database"
      ? Promise.reject(new Error("Refresh unavailable"))
      : original(filters, options);
  try {
    const saved = h.store.execute({
      databaseId: "host",
      command: { type: "database.publish", published: true },
    });
    h.ack(0);
    await saved;
    await tick();
    const state = h.store.commandState.get({ hostDatabaseId: "host" });
    assert.equal(state.isPending, false);
    assert.equal(state.error, null);
    assert.ok(h.store.getSynchronizationError() instanceof DatabaseReconciliationError);
  } finally {
    h.close();
  }
});

test("unrelated sources can save concurrently and session disposal clears state", async () => {
  const h = harness();
  const first = h.submit();
  const second = h.submit("other", "other");
  assert.equal(h.requests.length, 2);
  h.ack(0);
  h.ack(1, 2, "other");
  await Promise.all([first, second]);
  h.close();
  assert.deepEqual(h.store.getSnapshot(), []);
});

function record(id: string, dataSourceId = "source") {
  const timestamp = "2026-09-28T00:00:00.000Z";
  return {
    id,
    dataSourceId,
    pageId: "page-" + id,
    orderKey: "1024.0000000000",
    parentRowId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    valuesByPropertyId: {},
    page: {
      id: "page-" + id,
      name: id,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      hasContent: false,
      metadata: null,
    },
  };
}

test("transfer projects both sources, remaps queued anchors, and confirms each source separately", async () => {
  const h = harness();
  try {
    const original = record("original", "origin");
    const temporary = { ...record("temporary"), pageId: original.pageId, page: original.page };
    const confirmed = { ...temporary, id: "confirmed" };
    const sourceToken = {};
    h.store.observe(sourceToken, { dataSourceId: "origin", sourceVersion: 1 });
    h.client.setQueryData(["db", "session", "origin-host", "window", "origin", "all"], {
      pages: [{ records: [original], dataSourceVersion: 1 }],
    });
    const transfer = h.store.submit(
      {
        databaseId: "host",
        dataSourceId: "source",
        command: {
          type: "row.place",
          pageId: original.pageId,
          afterRowId: null,
          beforeRowId: null,
          parentRowId: null,
          source: {
            databaseId: "origin-host",
            dataSourceId: "origin",
            rowId: original.id,
            propertyMode: "match",
          },
        },
      },
      [
        { dataSourceId: "origin", rowId: original.id, remove: true, record: original },
        { dataSourceId: "source", rowId: temporary.id, record: temporary },
      ],
      temporary.id,
    );
    assert.equal(h.store.records("origin").length, 0);
    assert.equal(h.store.records("source")[0]!.id, "temporary");
    const next = h.store.submit(
      {
        databaseId: "host",
        dataSourceId: "source",
        command: {
          type: "row.change",
          rowId: "other",
          placement: { afterRowId: "temporary", beforeRowId: null },
        },
      },
      [
        {
          dataSourceId: "source",
          rowId: "other",
          placement: { afterRowId: "temporary", beforeRowId: null },
        },
      ],
    );
    assert.equal(h.requests.length, 1);
    h.ack(0, 2, "source", confirmed, { source: 2, origin: 3 });
    await transfer;
    await tick();
    assert.equal(JSON.parse(h.requests[1]!.body).command.placement.afterRowId, "confirmed");
    assert.equal(h.store.records("source")[0]!.id, "confirmed");
    h.ack(1, 3);
    await next;
    h.store.observe(h.token, { dataSourceId: "source", sourceVersion: 3 });
    assert.equal(
      h.store.getSnapshot().length,
      1,
      "source-side removal must survive destination confirmation",
    );
    h.store.observe(sourceToken, { dataSourceId: "origin", sourceVersion: 3 });
    assert.equal(h.store.getSnapshot().length, 0);
  } finally {
    h.close();
  }
});

test("failed insertion removes its dependent gestures, without dropping unrelated work", async () => {
  const h = harness();
  try {
    const temporary = record("temporary");
    const creation = h.store.submit(
      {
        databaseId: "host",
        dataSourceId: "source",
        command: { type: "row.place", afterRowId: null, beforeRowId: null, parentRowId: null },
      },
      [{ dataSourceId: "source", rowId: temporary.id, record: temporary }],
      temporary.id,
    );
    const rejected = assert.rejects(creation, /forbidden/);
    const dependent = h.submit("temporary");
    const dependentRejected = assert.rejects(dependent, /forbidden/);
    const child = h.store.submit(
      {
        databaseId: "host",
        dataSourceId: "source",
        command: {
          type: "row.place",
          afterRowId: "temporary",
          beforeRowId: null,
          parentRowId: null,
        },
      },
      [{ dataSourceId: "source", rowId: "child", record: record("child") }],
      "child",
    );
    const childRejected = assert.rejects(child, /forbidden/);
    const grandchildRejected = assert.rejects(h.submit("child"), /forbidden/);
    const unrelated = h.submit("other");
    h.requests[0]!.reject(Object.assign(new Error("forbidden"), { status: 403 }));
    await Promise.all([rejected, dependentRejected, childRejected, grandchildRejected]);
    await tick();
    assert.equal(h.requests.length, 2);
    assert.equal(JSON.parse(h.requests[1]!.body).command.rowId, "other");
    h.ack(1);
    await unrelated;
  } finally {
    h.close();
  }
});

test("queued cell edits coalesce through the existing source scheduler before first delivery", async () => {
  const h = harness();
  const cell = (value: string) =>
    h.store.submit(
      {
        databaseId: "host",
        dataSourceId: "source",
        command: { type: "row.change", rowId: "row", valuesByPropertyId: { definition: value } },
      },
      [{ dataSourceId: "source", rowId: "row", values: { definition: value } }],
    );
  try {
    const first = cell("first");
    const next = cell("next");
    const latest = cell("latest");
    assert.equal(next, latest);
    assert.equal(h.requests.length, 1);
    h.ack(0);
    await first;
    await tick();
    assert.equal(h.requests.length, 2);
    assert.deepEqual(JSON.parse(h.requests[1]!.body).command.valuesByPropertyId, {
      definition: "latest",
    });
    h.ack(1, 3);
    await next;
    await latest;
  } finally {
    h.close();
  }
});
