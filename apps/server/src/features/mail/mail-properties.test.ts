import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  deleteResults: [] as unknown[][],
  enqueue: vi.fn(async () => undefined),
  insertResults: [] as unknown[][],
  mutations: [] as Array<{ kind: string; value: unknown }>,
  selectResults: [] as unknown[][],
  updateResults: [] as unknown[][],
}));

vi.mock("../../infrastructure/database", () => {
  const query = (result: unknown[], kind?: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where", "orderBy", "limit", "onConflictDoUpdate"]) {
      chain[method] = (...args: unknown[]) => {
        if (kind) state.mutations.push({ kind: `${kind}.${method}`, value: args });
        return chain;
      };
    }
    chain.values = (value: unknown) => {
      if (kind) state.mutations.push({ kind: `${kind}.values`, value });
      return chain;
    };
    chain.set = (value: unknown) => {
      if (kind) state.mutations.push({ kind: `${kind}.set`, value });
      return chain;
    };
    chain.returning = () => Promise.resolve(result);
    chain.then = (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  };
  const db: Record<string, unknown> = {
    delete: vi.fn(() => query(state.deleteResults.shift() ?? [], "delete")),
    insert: vi.fn(() => query(state.insertResults.shift() ?? [], "insert")),
    select: vi.fn(() => query(state.selectResults.shift() ?? [])),
    update: vi.fn(() => query(state.updateResults.shift() ?? [], "update")),
  };
  db.transaction = vi.fn(async (callback: (tx: typeof db) => unknown) => callback(db));
  return { db };
});

vi.mock("./mail-database-sync-worker", () => ({
  enqueueMailDatabaseSyncForThread: state.enqueue,
}));

import {
  createMailProperty,
  deleteMailProperty,
  listMailProperties,
  listMailThreadPropertyValues,
  MailPropertyError,
  setMailThreadPropertyValue,
  updateMailProperty,
} from "./mail-properties";

const now = new Date("2026-01-02T03:04:05.000Z");

beforeEach(() => {
  state.deleteResults.length = 0;
  state.insertResults.length = 0;
  state.mutations.length = 0;
  state.selectResults.length = 0;
  state.updateResults.length = 0;
  vi.clearAllMocks();
});

test("mail properties list and serialize definitions with active workspace members", async () => {
  state.selectResults.push([
    propertyRow({ options: [{ color: "blue", id: "open", name: "Open" }], type: "status" }),
  ], [
    { email: "ada@example.com", id: "user-1", image: null, name: "Ada" },
  ]);

  assert.deepEqual(await listMailProperties("binding-1", "workspace-1"), {
    members: [{ email: "ada@example.com", id: "user-1", image: null, name: "Ada" }],
    properties: [{
      bindingId: "binding-1",
      createdAt: now.toISOString(),
      id: "property-1",
      name: "Priority",
      options: [{ color: "blue", id: "open", name: "Open" }],
      type: "status",
      updatedAt: now.toISOString(),
    }],
  });
});

test("mail property definitions reject malformed names, types, and options", async () => {
  const invalid = [
    null,
    [],
    {},
    { name: "", type: "text" },
    { name: "x".repeat(101), type: "text" },
    { name: "Priority", type: "unknown" },
    { name: "Priority", options: "open", type: "select" },
    { name: "Priority", options: new Array(101).fill({ color: "blue", id: "x", name: "X" }), type: "select" },
    { name: "Priority", options: [null], type: "select" },
    { name: "Priority", options: [{ color: "", id: "open", name: "Open" }], type: "select" },
    { name: "Priority", options: [{ color: "blue", id: "open", name: "Open" }, { color: "red", id: "open", name: "Again" }], type: "select" },
  ];
  for (const value of invalid) {
    await assert.rejects(createMailProperty({ bindingId: "binding-1", value }), invalidProperty);
  }
});

test("mail properties create, update, and delete with stable public errors", async () => {
  const createdRow = propertyRow({ name: "Status", type: "status" });
  state.insertResults.push([createdRow]);
  const created = await createMailProperty({
    bindingId: "binding-1",
    value: { name: " Status ", options: undefined, type: "status" },
  });
  assert.equal(created.name, "Status");

  state.selectResults.push([createdRow]);
  state.updateResults.push([propertyRow({ name: "Done", type: "text" })]);
  state.deleteResults.push([]);
  const updated = await updateMailProperty({
    bindingId: "binding-1",
    propertyId: "property-1",
    value: { name: "Done", type: "text" },
  });
  assert.equal(updated.type, "text");
  assert.ok(state.mutations.some(({ kind }) => kind === "delete.where"));

  state.deleteResults.push([{ id: "property-1" }]);
  assert.deepEqual(await deleteMailProperty({ bindingId: "binding-1", propertyId: "property-1" }), { success: true });
  state.deleteResults.push([]);
  await assert.rejects(
    deleteMailProperty({ bindingId: "binding-1", propertyId: "missing" }),
    (error: unknown) => error instanceof MailPropertyError && error.status === 404,
  );
});

test("mail thread property values validate every supported type and enqueue database sync", async () => {
  const cases = [
    { accepted: "hello", rejected: 1, type: "text" },
    { accepted: 42, rejected: Number.NaN, type: "number" },
    { accepted: true, rejected: "true", type: "checkbox" },
    { accepted: "https://example.com", rejected: "javascript:alert(1)", type: "url" },
    { accepted: "2026-04-05", rejected: "not-a-date", type: "date" },
    { accepted: "open", rejected: "missing", type: "select" },
    { accepted: "open", rejected: "missing", type: "status" },
    { accepted: ["open", "open"], expected: ["open"], rejected: ["missing"], type: "multi_select" },
    { accepted: [], rejected: [1], type: "person" },
    {
      accepted: [{ id: "asset-1", name: "brief.pdf", url: "https://example.com/brief.pdf" }],
      rejected: [null],
      type: "files",
    },
  ] as const;

  for (const item of cases) {
    prepareSet(item.type);
    const result = await setMailThreadPropertyValue({
      bindingId: "binding-1",
      gmailAccountId: "account-1",
      propertyId: "property-1",
      threadId: "thread-1",
      value: item.accepted,
      workspaceId: "workspace-1",
    });
    assert.deepEqual(result.value, "expected" in item ? item.expected : item.accepted);

    prepareSet(item.type);
    await assert.rejects(
      setMailThreadPropertyValue({
        bindingId: "binding-1",
        gmailAccountId: "account-1",
        propertyId: "property-1",
        threadId: "thread-1",
        value: item.rejected,
        workspaceId: "workspace-1",
      }),
      invalidValue,
    );
  }
  assert.equal(state.enqueue.mock.calls.length, cases.length);
});

test("mail person values require active members and list values require an indexed thread", async () => {
  prepareSet("person", [[{ userId: "user-1" }]]);
  const saved = await setMailThreadPropertyValue({
    bindingId: "binding-1",
    gmailAccountId: "account-1",
    propertyId: "property-1",
    threadId: "thread-1",
    value: ["user-1"],
    workspaceId: "workspace-1",
  });
  assert.deepEqual(saved.value, ["user-1"]);

  prepareSet("person", [[]]);
  await assert.rejects(setMailThreadPropertyValue({
    bindingId: "binding-1",
    gmailAccountId: "account-1",
    propertyId: "property-1",
    threadId: "thread-1",
    value: ["user-1"],
    workspaceId: "workspace-1",
  }), invalidValue);

  state.selectResults.push([{ id: "thread-index-1" }], [
    { propertyId: "property-1", value: "hello" },
  ]);
  assert.deepEqual(await listMailThreadPropertyValues({
    bindingId: "binding-1",
    gmailAccountId: "account-1",
    threadId: "thread-1",
  }), [{ propertyId: "property-1", value: "hello" }]);

  state.selectResults.push([]);
  await assert.rejects(listMailThreadPropertyValues({
    bindingId: "binding-1",
    gmailAccountId: "account-1",
    threadId: "missing",
  }), (error: unknown) => error instanceof MailPropertyError && error.status === 404);
});

function prepareSet(type: string, extraSelects: unknown[][] = []) {
  state.selectResults.push(
    [propertyRow({
      options: ["select", "multi_select", "status"].includes(type)
        ? [{ color: "blue", id: "open", name: "Open" }]
        : [],
      type,
    })],
    [{ id: "thread-index-1" }],
    ...extraSelects,
  );
  state.insertResults.push([]);
}

function propertyRow(overrides: Record<string, unknown> = {}) {
  return {
    bindingId: "binding-1",
    createdAt: now,
    id: "property-1",
    name: "Priority",
    options: [],
    type: "text",
    updatedAt: now,
    ...overrides,
  };
}

function invalidProperty(error: unknown) {
  return error instanceof MailPropertyError && error.status === 400 &&
    ["A valid mail property is required.", "Property options are invalid."].includes(error.message);
}

function invalidValue(error: unknown) {
  return error instanceof MailPropertyError && error.status === 400 && error.message === "Property value is invalid.";
}
