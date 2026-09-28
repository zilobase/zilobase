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
  const ack = (index: number, version = 2, source = "source") => {
    const { commandId } = JSON.parse(requests[index]!.body);
    requests[index]!.resolve({
      commandId,
      result: {},
      sourceVersions: { [source]: version },
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
