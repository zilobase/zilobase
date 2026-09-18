import assert from "node:assert/strict";
import test from "node:test";

import {
  clearSerializationStateForTests,
  orderingSerializationKey,
  runSerialized,
  saveCellValue,
  structuralSerializationKey,
  viewSerializationKey,
} from "./serialize";
import type { ApiFetcher } from "../../shared/api-fetcher";
import { QueryClient } from "@tanstack/react-query";

function cellInput(value: unknown, overrides: Record<string, unknown> = {}) {
  const queryClient = new QueryClient();
  const apiFetch = (async (_path: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { commandId: string };
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    return {
      commandId: request.commandId,
      event: {
        actorId: "user-1",
        areas: ["records"],
        changes: {},
        commandId: request.commandId,
        committedAt: "2026-09-08T00:00:00.000Z",
        databaseId: "database-1",
        dataSourceId: "data-source-1",
        eventId: `event-${request.commandId}`,
        protocolVersion: 2,
        type: "database.mutation",
        version: 1,
      },
      result: {},
    };
  }) as ApiFetcher;
  return {
    apiFetch,
    cleanup: () => queryClient.clear(),
    dataSourceId: "data-source-1",
    hostDatabaseId: "database-1",
    propertyId: "property-1",
    queryClient,
    rowId: "row-1",
    sessionId: "session-1",
    value,
    ...overrides,
  };
}

test("same cell key coalesces to latest value", async () => {
  clearSerializationStateForTests();
  const first = cellInput("one");
  const seen: unknown[] = [];
  const trackingFetch = (async (path: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as {
      command: { value: unknown };
      commandId: string;
    };
    seen.push(request.command.value);
    return first.apiFetch(path, init);
  }) as ApiFetcher;
  const base = { ...first, apiFetch: trackingFetch };
  try {
    const p1 = saveCellValue(base);
    const p2 = saveCellValue({ ...base, value: "two" });
    const p3 = saveCellValue({ ...base, value: "three" });
    const [a1, a2, a3] = await Promise.all([p1, p2, p3]);
    assert.ok(a1 && a2 && a3);
    // 1 in flight + 1 queued latest: at most 2 POSTs, last is latest value
    assert.ok(seen.length <= 2);
    assert.equal(seen.at(-1), "three");
  } finally {
    first.cleanup();
    clearSerializationStateForTests();
  }
});

test("different cells run in parallel", async () => {
  clearSerializationStateForTests();
  const base = cellInput("one");
  let concurrent = 0;
  let maxConcurrent = 0;
  const slowFetch = (async (path: string, init?: RequestInit) => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    try {
      return await base.apiFetch(path, init);
    } finally {
      concurrent -= 1;
    }
  }) as ApiFetcher;
  try {
    await Promise.all([
      saveCellValue({ ...base, apiFetch: slowFetch, propertyId: "property-1" }),
      saveCellValue({ ...base, apiFetch: slowFetch, propertyId: "property-2" }),
    ]);
    assert.equal(maxConcurrent, 2);
  } finally {
    base.cleanup();
    clearSerializationStateForTests();
  }
});

test("ordering per-source and view per-host are serial", async () => {
  clearSerializationStateForTests();
  const order: string[] = [];
  const task = (name: string, delay: number) => () =>
    new Promise<string>((resolve) => {
      order.push(`start:${name}`);
      setTimeout(() => {
        order.push(`end:${name}`);
        resolve(name);
      }, delay);
    });
  const key = orderingSerializationKey("data-source-1");
  const [a, b] = await Promise.all([
    runSerialized(key, task("a", 20)),
    runSerialized(key, task("b", 1)),
  ]);
  assert.deepEqual([a, b], ["a", "b"]);
  assert.deepEqual(order, ["start:a", "end:a", "start:b", "end:b"]);

  const viewOrder: string[] = [];
  const viewKey = viewSerializationKey("database-1");
  await Promise.all([
    runSerialized(viewKey, async () => {
      viewOrder.push("one");
    }),
    runSerialized(viewKey, async () => {
      viewOrder.push("two");
    }),
  ]);
  assert.deepEqual(viewOrder, ["one", "two"]);
  assert.equal(structuralSerializationKey("data-source-1"), "structural:data-source-1");
  clearSerializationStateForTests();
});
