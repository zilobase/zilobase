import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gateway: { listMessages: vi.fn() },
  index: {
    completedAt: null,
    indexedThreadCount: 3,
    lastErrorCode: null,
    resultSizeEstimate: 3,
    status: "ready" as const,
  },
  selectResults: [] as unknown[][],
}));

vi.mock("../../infrastructure/database", () => {
  const query = (result: unknown[]) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where", "orderBy", "limit"]) {
      chain[method] = () => chain;
    }
    chain.then = (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return chain;
  };
  return { db: { select: vi.fn(() => query(mocks.selectResults.shift() ?? [])) } };
});

vi.mock("./gmail-gateway", () => ({ createGmailGateway: vi.fn(async () => mocks.gateway) }));
vi.mock("./mail-index", () => ({ getMailIndexProgress: vi.fn(async () => mocks.index) }));

import {
  decodeMailQueryCursor,
  encodeMailGroupCursor,
  encodeMailQueryCursor,
  MailQueryError,
  queryIndexedMail,
  queryIndexedMailGroups,
} from "./mail-query";

beforeEach(() => {
  mocks.selectResults.length = 0;
  mocks.gateway.listMessages.mockReset();
});

test("mail query cursors are opaque, deterministic, and validated", () => {
  const cursor = encodeMailQueryCursor({ id: "account:thread", internalDate: 1788231600000 });
  assert.doesNotMatch(cursor, /account|thread|\{|\}/);
  assert.deepEqual(decodeMailQueryCursor(cursor), {
    id: "account:thread",
    internalDate: 1788231600000,
  });
  for (const invalid of ["not.valid", btoa(JSON.stringify({ id: "x" })), btoa(JSON.stringify({ id: "", internalDate: 1 }))]) {
    assert.throws(
      () => decodeMailQueryCursor(invalid),
      (error: unknown) => error instanceof MailQueryError && error.status === 400,
    );
  }
  assert.doesNotMatch(encodeMailGroupCursor("CATEGORY_UPDATES"), /CATEGORY|UPDATES/);
});

test("indexed mail queries page, serialize, filter, and load custom values", async () => {
  mocks.selectResults.push([
    threadRow({ gmailThreadId: "thread-2", id: "index-2", internalDate: 200 }),
    threadRow({ gmailThreadId: "thread-1", id: "index-1", internalDate: 100 }),
  ], [
    { gmailThreadId: "thread-2", propertyId: "priority-custom", value: "high" },
  ]);

  const result = await queryIndexedMail({
    bindingId: "binding-1",
    env: {},
    gmailAccountId: "account-1",
    limit: 1,
    routeId: "all_mail",
  });
  assert.equal(result.threads.length, 1);
  assert.equal(result.threads[0]?.thread.id, "thread-2");
  assert.deepEqual(result.threads[0]?.thread.participants, [
    { address: "sender@example.com", name: "Sender" },
    { address: "recipient@example.com", name: null },
  ]);
  assert.deepEqual(result.threads[0]?.customValues, { "priority-custom": "high" });
  assert.deepEqual(decodeMailQueryCursor(result.nextCursor!), { id: "index-2", internalDate: 200 });
  assert.deepEqual(result.index, mocks.index);
});

test("indexed mail search intersects Gmail results and validates accounts and views", async () => {
  mocks.gateway.listMessages
    .mockResolvedValueOnce({ messages: [{ threadId: "thread-2" }], nextPageToken: "next" })
    .mockResolvedValueOnce({ messages: [{ threadId: "thread-3" }] });
  mocks.selectResults.push(
    [{ id: "account-1" }],
    [threadRow({ gmailThreadId: "thread-1" }), threadRow({ gmailThreadId: "thread-2", id: "index-2" })],
    [],
  );
  const result = await queryIndexedMail({
    bindingId: "binding-1",
    env: {},
    gmailAccountId: "account-1",
    routeId: "all_mail",
    search: " quarterly report ",
  });
  assert.deepEqual(result.threads.map(({ thread }) => thread.id), ["thread-2"]);
  assert.equal(result.searchTruncated, false);
  assert.equal(mocks.gateway.listMessages.mock.calls[0]?.[0].query, "quarterly report");

  mocks.selectResults.push([]);
  await assert.rejects(queryIndexedMail({
    bindingId: "binding-1",
    env: {},
    gmailAccountId: "missing",
    routeId: "all_mail",
    search: "x",
  }), (error: unknown) => error instanceof MailQueryError && error.status === 404);

  mocks.selectResults.push([]);
  await assert.rejects(queryIndexedMailGroups({
    bindingId: "binding-1",
    env: {},
    gmailAccountId: "account-1",
    routeId: "missing-view",
  }), (error: unknown) => error instanceof MailQueryError && error.status === 404);
});

test("mail groups cover immutable fields, labels, and custom scalar or multi-values", async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const rows = [
    threadRow({ custom: "unused", internalDate: Date.now(), labelIds: ["INBOX", "CATEGORY_UPDATES"] }),
    threadRow({
      fromAddresses: [],
      gmailThreadId: "thread-2",
      id: "index-2",
      important: false,
      internalDate: yesterday.getTime(),
      labelIds: [],
      starred: false,
      unread: false,
    }),
  ];
  const customRows = [
    { gmailThreadId: "thread-1", propertyId: "custom", value: ["alpha", "beta"] },
    { gmailThreadId: "thread-2", propertyId: "custom", value: null },
  ];
  for (const propertyId of ["date", "received_date", "starred", "important", "priority", "unread", "from", "email_domain", "labels", "custom"]) {
    mocks.selectResults.push([{ config: viewConfig(propertyId) }], rows, customRows);
    const result = await queryIndexedMailGroups({
      bindingId: "binding-1",
      env: {},
      gmailAccountId: "account-1",
      routeId: `view-${propertyId}`,
    });
    assert.equal(result.group?.propertyId, propertyId);
    assert.ok(result.groups.length > 0, `missing groups for ${propertyId}`);
    assert.equal(result.groups.every(({ mutable }) => mutable === !["date", "received_date", "from", "email_domain"].includes(propertyId)), true);
  }
});

test("a custom view without grouping returns no groups", async () => {
  mocks.selectResults.push([{ config: viewConfig(null) }]);
  assert.deepEqual(await queryIndexedMailGroups({
    bindingId: "binding-1",
    env: {},
    gmailAccountId: "account-1",
    routeId: "view-1",
  }), { group: null, groups: [], index: mocks.index });
});

function viewConfig(propertyId: string | null) {
  return {
    filter: { filters: [], id: "root", operator: "and", type: "group" },
    group: propertyId ? { direction: "descending", hideEmptyGroups: false, propertyId } : null,
  };
}

function threadRow(overrides: Record<string, unknown> = {}) {
  return {
    attachmentCount: 0,
    bccAddresses: [],
    ccAddresses: [],
    fromAddresses: [{ address: "sender@example.com", name: "Sender" }],
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
    starred: true,
    subject: "Quarterly report",
    toAddresses: [
      { address: "recipient@example.com", name: null },
      { address: "sender@example.com", name: "Duplicate" },
    ],
    unread: true,
    ...overrides,
  };
}
