import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type { ApiFetcher } from "../../shared/api-fetcher";
import { RecordInteractionStore } from "./store";
import { DatabaseCommandUnconfirmedError } from "../mutations/execute";

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
  const store = new RecordInteractionStore(client, "session", apiFetch);
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
    const unrelated = h.submit("other");
    h.requests[0]!.reject(Object.assign(new Error("forbidden"), { status: 403 }));
    await Promise.all([rejected, dependentRejected]);
    await tick();
    assert.equal(h.requests.length, 2);
    assert.equal(JSON.parse(h.requests[1]!.body).command.rowId, "other");
    h.ack(1);
    await unrelated;
  } finally {
    h.close();
  }
});
