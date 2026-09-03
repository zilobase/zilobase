import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  insertResults: [] as unknown[][],
  metric: vi.fn(async (_event: string, _input: { code?: string }) => undefined),
  mutations: [] as Array<{ kind: string; value: unknown }>,
  selectResults: [] as unknown[][],
  updateResults: [] as unknown[][],
}));

vi.mock("../../infrastructure/database", () => {
  const query = (result: unknown[], kind?: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where", "orderBy", "limit", "onConflictDoNothing", "onConflictDoUpdate"]) {
      chain[method] = (...args: unknown[]) => {
        if (kind) state.mutations.push({ kind: `${kind}.${method}`, value: args });
        return chain;
      };
    }
    for (const method of ["values", "set"]) {
      chain[method] = (value: unknown) => {
        if (kind) state.mutations.push({ kind: `${kind}.${method}`, value });
        return chain;
      };
    }
    chain.returning = () => Promise.resolve(result);
    chain.then = (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  };
  const db: Record<string, unknown> = {
    insert: vi.fn(() => query(state.insertResults.shift() ?? [], "insert")),
    select: vi.fn(() => query(state.selectResults.shift() ?? [])),
    update: vi.fn(() => query(state.updateResults.shift() ?? [], "update")),
  };
  db.transaction = vi.fn(async (callback: (tx: typeof db) => unknown) => callback(db));
  return { db };
});

vi.mock("../databases/access/database-access", () => ({
  requireDatabaseEditAccess: vi.fn(async () => ({ workspaceId: "workspace-1" })),
}));
vi.mock("../databases/access/data-source-access", () => ({
  requireDataSourceEditAccess: vi.fn(async () => ({ workspaceId: "workspace-1" })),
}));
vi.mock("../databases/core/commit", () => ({
  commitDataSourceMutation: vi.fn(async (_input, callback: (tx: Record<string, unknown>) => unknown) => {
    const { db } = await import("../../infrastructure/database");
    return callback(db as unknown as Record<string, unknown>);
  }),
}));
vi.mock("../databases/automations/event-capture", () => ({ lockDatabaseAutomationFactRows: vi.fn(async () => undefined) }));
vi.mock("../databases/properties/config", () => ({ validateCellValue: vi.fn() }));
vi.mock("../databases/realtime/delta", () => ({
  fetchDatabaseRowDelta: vi.fn(async () => ({ rows: [] })),
  fetchDatabaseValuesForPage: vi.fn(async () => []),
}));
vi.mock("../pages/placements", () => ({ upsertPageItemPlacement: vi.fn(async () => undefined) }));
vi.mock("../collaboration/service", () => ({ encodePageContentAsYjs: vi.fn(() => new Uint8Array()) }));
vi.mock("../../infrastructure/storage/image-storage", () => ({ createImageStorage: vi.fn() }));
vi.mock("./gmail-gateway", () => ({
  createGmailGateway: vi.fn(async () => ({ getThread: vi.fn(async () => ({})) })),
}));
vi.mock("./mail-normalize", () => ({
  normalizeGmailThread: vi.fn(() => ({
    messages: [{ attachments: [], bodyHtml: null, bodyText: "body" }],
    summary: { subject: "Quarterly report" },
  })),
}));
vi.mock("./mail-metrics", () => ({ recordMailMetric: state.metric }));

import {
  drainMailDatabaseSyncOutbox,
  enqueueMailDatabaseSyncForThread,
  enqueueMailDatabaseSyncForIndexedThread,
  getMailDatabaseSyncViewStatus,
  MailDatabaseSyncPausedError,
  mailDatabaseSyncBackoffMs,
} from "./mail-database-sync-worker";

beforeEach(() => {
  state.insertResults.length = 0;
  state.mutations.length = 0;
  state.selectResults.length = 0;
  state.updateResults.length = 0;
  vi.clearAllMocks();
});

test("database sync retry backoff grows exponentially and is bounded", () => {
  assert.equal(mailDatabaseSyncBackoffMs(0), 5_000);
  assert.equal(mailDatabaseSyncBackoffMs(2), 10_000);
  assert.equal(mailDatabaseSyncBackoffMs(8), 640_000);
  assert.equal(mailDatabaseSyncBackoffMs(100), 3_600_000);
  assert.equal(new MailDatabaseSyncPausedError("paused").name, "MailDatabaseSyncPausedError");
});

test("database sync enqueues eligible existing views idempotently", async () => {
  const indexed = indexedRow();
  state.selectResults.push([indexed], [
    { bindingId: "binding-1", config: syncConfig(), viewId: "view-1" },
  ], [{ viewId: "view-1" }]);
  state.insertResults.push([]);
  await enqueueMailDatabaseSyncForThread("account-1", "thread-1");
  assert.ok(state.mutations.some(({ kind }) => kind === "insert.onConflictDoUpdate"));

  state.selectResults.push([
    { bindingId: "binding-1", config: syncConfig({ enabled: false }), viewId: "disabled" },
    { bindingId: "binding-1", config: syncConfig({ activatedAt: new Date(indexed.internalDate + 1).toISOString() }), viewId: "new" },
  ], []);
  assert.equal(await enqueueMailDatabaseSyncForIndexedThread(indexed), 0);

  state.selectResults.push([]);
  assert.equal(await enqueueMailDatabaseSyncForIndexedThread(indexed), 0);
});

test("database sync status reports pending, paused, synced, and missing views", async () => {
  state.selectResults.push([{ id: "view-1" }], [
    { lastError: null, status: "pending" },
    { lastError: "Destination removed", status: "paused" },
    { lastError: null, status: "processing" },
  ], [{ status: "active" }, { status: "active" }]);
  assert.deepEqual(await getMailDatabaseSyncViewStatus("binding-1", "view-1"), {
    lastError: "Destination removed",
    paused: 1,
    pending: 2,
    synced: 2,
    viewId: "view-1",
  });
  state.selectResults.push([]);
  await assert.rejects(
    getMailDatabaseSyncViewStatus("binding-1", "missing"),
    (error: unknown) => error instanceof MailDatabaseSyncPausedError,
  );
});

test("database sync completes a claimed job without recreating its destination row", async () => {
  const claimed = outboxRow();
  state.selectResults.push(
    [claimed],
    [{ account: { id: "account-1", status: "connected" }, binding: { userId: "user-1", workspaceId: "workspace-1" }, config: syncConfig() }],
    [{ id: "source-1" }],
    [indexedRow()],
    [syncRecord()],
    [{ deletedAt: null, id: "row-1" }],
    [],
    [],
    [],
    [{ id: "row-1", title: "Old title" }],
  );
  state.updateResults.push([claimed], [], []);
  state.insertResults.push([], [], []);

  assert.deepEqual(await drainMailDatabaseSyncOutbox({}, { limit: 10, workerId: "worker-1" }), {
    completed: 1,
    paused: 0,
    retried: 0,
  });
  assert.equal(state.metric.mock.calls[0]?.[1].code, "complete");
  assert.ok(state.mutations.some(({ kind, value }) => kind === "update.set" && (value as { status?: string }).status === "completed"));
});

test("database sync maps system and custom values to destination property types", async () => {
  const claimed = outboxRow({ id: "mapped" });
  const mappings = [
    ["from", "from-text", "text"],
    ["to", "to-text", "text"],
    ["cc", "cc-text", "text"],
    ["bcc", "bcc-text", "text"],
    ["subject", "subject-text", "text"],
    ["body", "body-text", "text"],
    ["date", "date-value", "date"],
    ["received_date", "received-value", "date"],
    ["calendar_event", "calendar-value", "checkbox"],
    ["unread", "unread-value", "checkbox"],
    ["sent", "sent-value", "checkbox"],
    ["archived", "archived-value", "checkbox"],
    ["starred", "starred-value", "checkbox"],
    ["important", "important-value", "checkbox"],
    ["labels", "labels-value", "multi_select"],
    ["categories", "categories-value", "multi_select"],
    ["priority", "priority-value", "select"],
    ["mailbox", "mailbox-value", "multi_select"],
    ["email_domain", "domain-value", "multi_select"],
    ["custom", "custom-value", "select"],
    ["people", "people-value", "person"],
    ["amount", "amount-value", "number"],
  ].map(([sourcePropertyId, destinationPropertyId, type]) => ({
    destination: {
      config: ["select", "multi_select", "status"].includes(type!)
        ? { options: [{ id: "important", name: "Important" }, { id: "high", name: "High" }] }
        : {},
      id: destinationPropertyId,
      name: destinationPropertyId,
      type,
    },
    mapping: { destinationPropertyId, sourcePropertyId },
  }));
  state.selectResults.push(
    [claimed],
    [{
      account: { id: "account-1", status: "connected" },
      binding: { userId: "user-1", workspaceId: "workspace-1" },
      config: syncConfig({ mappings: mappings.map(({ mapping }) => mapping) }),
    }],
    [{ id: "source-1" }],
    [indexedRow()],
    [syncRecord()],
    [{ deletedAt: null, id: "row-1" }],
    [
      { propertyId: "custom", value: "custom-option" },
      { propertyId: "people", value: ["user-1"] },
      { propertyId: "amount", value: "42" },
    ],
    [{ id: "custom", options: [{ id: "custom-option", name: "High" }, null, { id: 2 }] }],
    mappings.map(({ destination }) => destination),
    [{ id: "row-1", title: "Old title" }],
    [{ propertyId: "custom-value", value: "Low" }],
  );
  state.updateResults.push([claimed]);

  assert.deepEqual(await drainMailDatabaseSyncOutbox({}, { workerId: "worker-1" }), {
    completed: 1,
    paused: 0,
    retried: 0,
  });
  const insertedValues = state.mutations
    .filter(({ kind }) => kind === "insert.values")
    .map(({ value }) => value as { propertyId?: string; value?: unknown });
  assert.equal(insertedValues.find(({ propertyId }) => propertyId === "priority-value")?.value, "Important");
  assert.equal(insertedValues.find(({ propertyId }) => propertyId === "custom-value")?.value, "High");
  assert.equal(insertedValues.find(({ propertyId }) => propertyId === "amount-value")?.value, 42);
  assert.deepEqual(insertedValues.find(({ propertyId }) => propertyId === "people-value")?.value, ["user-1"]);
});

test("database sync retries transient failures and pauses permanent or exhausted jobs", async () => {
  const transient = outboxRow({ attempts: 1, id: "retry" });
  state.selectResults.push([transient], [
    { account: { id: "account-1", status: "disconnected" }, binding: { userId: "user-1", workspaceId: "workspace-1" }, config: syncConfig() },
  ], [{ id: "source-1" }]);
  state.updateResults.push([transient], []);
  assert.deepEqual(await drainMailDatabaseSyncOutbox({}, { workerId: "worker-1" }), {
    completed: 0,
    paused: 0,
    retried: 1,
  });

  const permanent = outboxRow({ id: "paused" });
  state.selectResults.push([permanent], []);
  state.updateResults.push([permanent], [{ id: permanent.id }], []);
  assert.deepEqual(await drainMailDatabaseSyncOutbox({}, { bindingId: "binding-1", workerId: "worker-1" }), {
    completed: 0,
    paused: 1,
    retried: 0,
  });

  const exhausted = outboxRow({ attempts: 7, id: "exhausted" });
  state.selectResults.push([exhausted], [
    { account: { id: "account-1", status: "disconnected" }, binding: { userId: "user-1", workspaceId: "workspace-1" }, config: syncConfig() },
  ], [{ id: "source-1" }]);
  state.updateResults.push([exhausted], [{ id: exhausted.id }], []);
  assert.deepEqual(await drainMailDatabaseSyncOutbox({}, { workerId: "worker-1" }), {
    completed: 0,
    paused: 1,
    retried: 0,
  });
});

function indexedRow() {
  const timestamp = new Date();
  return {
    attachmentCount: 0,
    bccAddresses: [],
    ccAddresses: [],
    createdAt: timestamp,
    domains: ["example.com"],
    fromAddresses: [{ address: "sender@example.com", name: "Sender" }],
    generation: 1,
    gmailAccountId: "account-1",
    gmailThreadId: "thread-1",
    hasCalendarEvent: false,
    id: "index-1",
    important: true,
    internalDate: Date.now(),
    labelIds: ["INBOX"],
    latestMessageId: "message-1",
    messageCount: 1,
    messageIds: ["message-1"],
    receivedAt: timestamp,
    starred: true,
    subject: "Quarterly report",
    toAddresses: [],
    unread: true,
    updatedAt: timestamp,
  };
}

function syncConfig(overrides: Record<string, unknown> = {}) {
  return {
    databaseSync: {
      activatedAt: new Date(0).toISOString(),
      destinationDataSourceId: "source-1",
      destinationDatabaseId: "database-1",
      enabled: true,
      mappings: [{ destinationPropertyId: "title", sourcePropertyId: "subject" }],
      workspaceId: "workspace-1",
      ...overrides,
    },
    filter: { filters: [], id: "root", operator: "and", type: "group" },
  };
}

function outboxRow(overrides: Record<string, unknown> = {}) {
  const date = new Date();
  return {
    attempts: 0,
    bindingId: "binding-1",
    createdAt: date,
    gmailThreadId: "thread-1",
    id: "outbox-1",
    nextAttemptAt: date,
    sourceUpdatedAt: date,
    status: "pending",
    updatedAt: date,
    viewId: "view-1",
    workerId: "worker-1",
    ...overrides,
  };
}

function syncRecord() {
  return {
    bindingId: "binding-1",
    databaseRowId: "row-1",
    destinationDataSourceId: "source-1",
    gmailThreadId: "thread-1",
    id: "record-1",
    pageId: "page-1",
    viewId: "view-1",
  };
}
