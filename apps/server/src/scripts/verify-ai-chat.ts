import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { runMigrationSets } from "@zilobase/runtime-adapter/node";
import { createDbClientForUrl, runWithDb } from "../infrastructure/database";
import {
  askAiThread,
  askAiTurn,
  member,
  user,
  workspace,
  database,
  dataSource,
  databaseDataSource,
  databaseRow,
  page,
  pageProperty,
  pagePropertyValue,
  databaseProperty,
} from "../infrastructure/database/schema";
import { CORE_MIGRATION_SET } from "../public/node-adapter-api";
import { managedAppPolicy } from "../shared/config/app-policy";
import type { ServerOperationContext } from "../services/operations/context";
import {
  beginChatTurn,
  finishChatTurn,
  getChatThread,
  deleteChatThread,
} from "../services/ai/conversations";
import { prepareChat } from "../services/ai/chat";
import {
  querySourceRecords,
  aggregateSourceRecords,
  describeDatabaseSource,
} from "../services/databases/read/source-query";
import { readDocumentWindow } from "../services/pages/read/document-window";
import { createAgentState } from "../services/ai/agent-state";
import { createReadTools } from "../services/ai/read-tools";
import { sourceRecordQuerySchema } from "@zilobase/features/runtime";
import { readDatabaseExport } from "../services/databases/read/operations";
import type { ChatRequest } from "@zilobase/features/runtime";
import type { BuildContextResult } from "@zilobase/page-context";

const connection = process.env.ZILOBASE_AI_VERIFY_URL;
assert.ok(connection, "Use the isolated AI test runner");
const url = new URL(connection);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/zilobase_ai_verify");
const client = createDbClientForUrl(connection);
const second = createDbClientForUrl(connection);
try {
  await client.client.connect();
  await second.client.connect();
  const existing = await client.client.query(
    "select count(*)::int as count from information_schema.tables where table_schema = 'public'",
  );
  assert.equal(existing.rows[0].count, 0, "Refuse a nonempty verification database");
  await runMigrationSets(client.db, [CORE_MIGRATION_SET]);
  await runMigrationSets(client.db, [CORE_MIGRATION_SET]);
  const actors = await client.db
    .insert(user)
    .values([
      { id: "actor", name: "Actor", email: "actor@ai.invalid" },
      { id: "other", name: "Other", email: "other@ai.invalid" },
    ])
    .returning();
  await client.db.insert(workspace).values([
    { id: "workspace", name: "AI", slug: "ai" },
    { id: "other-workspace", name: "Other", slug: "other" },
  ]);
  await client.db.insert(member).values(
    actors.map((actor) => ({
      id: actor.id,
      organizationId: "workspace",
      userId: actor.id,
      role: "owner",
    })),
  );
  const context: ServerOperationContext = {
    authentication: {
      user: actors[0]!,
      session: null,
      authMethod: "session",
      apiKey: null,
      oauthScopes: [],
    },
    activeWorkspaceId: "workspace",
    pinnedWorkspaceId: null,
    env: {},
    policy: managedAppPolicy,
    editionExtension: null,
    runtimePorts: {},
    requestId: randomUUID(),
  };
  const request: ChatRequest = {
    requestId: randomUUID(),
    workspaceId: "workspace",
    text: "Hello",
    roots: [],
    snapshots: [],
    history: [],
  };
  const built: BuildContextResult = {
    version: 1,
    status: "complete",
    markdown: "Private page body",
    charCount: 17,
    manifest: [],
    omissions: [],
    trimmedAttachmentIds: [],
  };
  const run = <T>(fn: () => Promise<T>) => runWithDb(client.db, fn);
  await client.db
    .insert(database)
    .values({ id: "db", workspaceId: "workspace", createdById: "actor", name: "Tasks" });
  await client.db
    .insert(dataSource)
    .values({ id: "source", workspaceId: "workspace", parentDatabaseId: "db", name: "Tasks" });
  await client.db.insert(databaseDataSource).values({ databaseId: "db", dataSourceId: "source" });
  await client.db.insert(page).values(
    Array.from({ length: 205 }, (_, i) => ({
      id: `page-${i}`,
      workspaceId: "workspace",
      createdById: "actor",
      name: `Task ${i}`,
      deletedAt: i === 204 ? new Date() : null,
    })),
  );
  await client.db.insert(databaseRow).values(
    Array.from({ length: 205 }, (_, i) => ({
      id: `row-${i}`,
      dataSourceId: "source",
      pageId: `page-${i}`,
      position: i,
      orderKey: String(i).padStart(4, "0"),
    })),
  );
  await client.db.insert(pageProperty).values([
    { id: "amount", workspaceId: "workspace", name: "Amount", type: "number" },
    { id: "due", workspaceId: "workspace", name: "Due", type: "date" },
    {
      id: "status",
      workspaceId: "workspace",
      name: "Status",
      type: "status",
      config: { defaultOptionId: "queued", options: [{ id: "queued", name: "Queued" }] },
    },
  ]);
  await client.db.insert(databaseProperty).values([
    { id: "amount-column", dataSourceId: "source", propertyId: "amount" },
    { id: "due-column", dataSourceId: "source", propertyId: "due" },
    { id: "status-column", dataSourceId: "source", propertyId: "status" },
  ]);
  await client.db.insert(pagePropertyValue).values(
    Array.from({ length: 205 }, (_, i) => [
      { id: `amount-${i}`, pageId: `page-${i}`, propertyId: "amount", value: i },
      {
        id: `due-${i}`,
        pageId: `page-${i}`,
        propertyId: "due",
        value: i > 100 ? { start: "2026-10-01", end: "2026-10-22" } : "2026-11-01",
      },
    ]).flat(),
  );
  const bounded = await run(() => readDatabaseExport(context, { databaseId: "db", rowLimit: 200 }));
  assert.equal(bounded.rows.length, 200);
  assert.ok("rowCount" in bounded && "rowsPagination" in bounded);
  assert.equal(bounded.rowCount, 204);
  assert.equal(bounded.rowsPagination?.hasMore, true);
  assert.equal(bounded.rows[0]?.id, "row-0");
  const complete = await run(() => readDatabaseExport(context, { databaseId: "db" }));
  assert.equal(complete.rows.length, 204);
  await assert.rejects(
    run(() => readDatabaseExport(context, { databaseId: "db", rowLimit: 501 })),
    /rowLimit/,
  );
  const query = sourceRecordQuerySchema.parse({
    databaseId: "db",
    dataSourceId: "source",
    limit: 50,
  });
  const description = await run(() =>
    describeDatabaseSource(context, { databaseId: "db", section: "sources" }),
  );
  assert.equal(description.entries[0]?.id, "source");
  const seen = new Set<string>();
  let position: import("@zilobase/features/runtime").SourceRecordPosition | undefined;
  let revision: import("@zilobase/features/runtime").SourceReadRevision | undefined;
  for (;;) {
    const result = await run(() => querySourceRecords(context, query, position, revision));
    revision = result.revision;
    for (const record of result.records) {
      assert.ok(!seen.has(record.id), "Pagination must not duplicate records");
      seen.add(record.id);
    }
    position = result.positions.at(-1);
    if (!result.hasMore) break;
  }
  assert.equal(
    seen.size,
    204,
    "Pagination reaches every live record beyond the old 200-row ceiling",
  );
  const count = await run(() => aggregateSourceRecords(context, query, "count"));
  assert.equal(Number(count.value), 204);
  await client.db.insert(pagePropertyValue).values([
    { id: "status-0", pageId: "page-0", propertyId: "status", value: "Done" },
    { id: "status-1", pageId: "page-1", propertyId: "status", value: "" },
    { id: "status-2", pageId: "page-2", propertyId: "status", value: null },
  ]);
  const defaults = await run(() =>
    querySourceRecords(context, {
      ...query,
      propertyIds: ["status"],
      filters: [{ propertyId: "status", operator: "eq", value: "Queued" }],
    }),
  );
  assert.ok(defaults.records.every((record) => record.values.status === "Queued"));
  assert.ok(defaults.records.some((record) => record.pageId === "page-1"));
  const nullStatus = await run(() =>
    querySourceRecords(context, { ...query, recordId: "row-2", propertyIds: ["status"] }),
  );
  assert.equal(nullStatus.records[0]?.values.status, "Queued");
  const defaultCount = await run(() =>
    aggregateSourceRecords(
      context,
      { ...query, filters: [{ propertyId: "status", operator: "eq", value: "Queued" }] },
      "count",
    ),
  );
  assert.equal(
    Number(defaultCount.value),
    203,
    "Unset status has the same effective default in filters, reads and counts",
  );
  const filtered = await run(() =>
    aggregateSourceRecords(context, { ...query, nameContains: "Task 1" }, "count"),
  );
  assert.equal(Number(filtered.value), 111);
  const numeric = await run(() =>
    querySourceRecords(context, {
      ...query,
      propertyIds: ["amount"],
      filters: [{ propertyId: "amount", operator: "gte", value: 200 }],
      sort: "name",
      direction: "desc",
      limit: 2,
    }),
  );
  assert.equal(numeric.records.length, 2);
  assert.equal(numeric.records[0]?.name, "Task 203");
  assert.deepEqual(Object.keys(numeric.records[0]!.values), ["amount"]);
  const numericNext = await run(() =>
    querySourceRecords(
      context,
      {
        ...query,
        propertyIds: ["amount"],
        filters: [{ propertyId: "amount", operator: "gte", value: 200 }],
        sort: "name",
        direction: "desc",
        limit: 2,
      },
      numeric.positions.at(-1),
      numeric.revision,
    ),
  );
  assert.equal(numericNext.records[0]?.name, "Task 201");
  assert.equal(numericNext.hasMore, false);
  for (const direction of ["asc", "desc"] as const) {
    const sortedQuery = {
      ...query,
      sortPropertyId: "amount",
      direction,
      limit: 1,
      filters: [{ propertyId: "amount", operator: "gte" as const, value: 200 }],
    };
    const first = await run(() => querySourceRecords(context, sortedQuery));
    const next = await run(() =>
      querySourceRecords(context, sortedQuery, first.positions.at(-1), first.revision),
    );
    assert.equal(first.records[0]?.name, direction === "asc" ? "Task 200" : "Task 203");
    assert.equal(next.records[0]?.name, direction === "asc" ? "Task 201" : "Task 202");
  }
  await client.db.delete(pagePropertyValue).where(eq(pagePropertyValue.id, "amount-1"));
  const missingLastQuery = {
    ...query,
    sortPropertyId: "amount",
    direction: "desc" as const,
    limit: 100,
  };
  let sortedPosition: import("@zilobase/features/runtime").SourceRecordPosition | undefined;
  let sortedTotal = 0;
  let sortedLast = "";
  for (;;) {
    const result = await run(() => querySourceRecords(context, missingLastQuery, sortedPosition));
    sortedTotal += result.records.length;
    sortedLast = result.records.at(-1)!.name;
    sortedPosition = result.positions.at(-1);
    if (!result.hasMore) break;
  }
  assert.equal(sortedTotal, 204);
  assert.equal(sortedLast, "Task 1");
  await client.db
    .insert(pagePropertyValue)
    .values({ id: "amount-1", pageId: "page-1", propertyId: "amount", value: 1 });
  const sum = await run(() => aggregateSourceRecords(context, query, "sum", "amount"));
  assert.equal(Number(sum.value), 20706);
  const overdue = await run(() =>
    aggregateSourceRecords(
      context,
      { ...query, filters: [{ propertyId: "due", operator: "lt", value: "2026-10-20" }] },
      "count",
    ),
  );
  assert.equal(Number(overdue.value), 103);
  await client.db.update(dataSource).set({ version: 1 }).where(eq(dataSource.id, "source"));
  await assert.rejects(
    run(() => querySourceRecords(context, query, position, revision)),
    /SOURCE_CHANGED/,
  );
  await client.db
    .update(page)
    .set({
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Saved source content" }] },
          { type: "databaseBlock", attrs: { databaseId: "db" } },
          { type: "pageBlock", attrs: { pageId: "page-1", title: "Untitled page" } },
        ],
      },
    })
    .where(eq(page.id, "page-0"));
  const document = await run(() => readDocumentWindow(context, { pageId: "page-0" }));
  assert.ok(
    document.entries.some((entry) => entry.kind === "reference" && entry.resource.id === "db"),
  );
  assert.ok(
    document.entries.some(
      (entry) => entry.kind === "text" && entry.text.includes("Saved source content"),
    ),
  );
  await client.db.update(page).set({ name: "Renamed child" }).where(eq(page.id, "page-1"));
  const renamed = await run(() => readDocumentWindow(context, { pageId: "page-0" }));
  assert.ok(
    renamed.entries.some((entry) => entry.kind === "text" && entry.text.includes("Renamed child")),
  );
  await assert.rejects(
    run(() => readDocumentWindow(context, { pageId: "page-0", revision: document.revision })),
    /SOURCE_CHANGED/,
  );
  await client.db.insert(page).values([
    {
      id: "search-private",
      workspaceId: "workspace",
      createdById: "other",
      name: "Saved source secret",
    },
    {
      id: "search-foreign",
      workspaceId: "other-workspace",
      createdById: "actor",
      name: "Saved source foreign",
    },
  ]);
  const searchState = createAgentState(
    "workspace",
    [],
    [{ role: "user", content: "Find saved source content" }],
  );
  const searchSignal = new AbortController().signal;
  const searchTools = createReadTools(context, searchState, {
    signal: searchSignal,
  });
  const searchOptions = {
    toolCallId: "search",
    messages: [],
    abortSignal: searchSignal,
    context: {},
  };
  const found = (await run(async () =>
    searchTools.search_workspace.execute!(
      {
        queryType: "content",
        query: "Saved source",
        types: ["page"],
        limit: 20,
        responseMode: "read",
      },
      searchOptions,
    ),
  )) as { results: Array<{ id: string; type: string }> };
  assert.deepEqual(
    found.results.map((match) => match.id),
    ["page-0"],
  );
  assert.equal(searchState.context.manifest.length, 0, "Search snippets are not evidence");
  const discovered = await run(async () =>
    searchTools.read_page.execute!(
      { pageId: "page-0", cursor: null },
      { ...searchOptions, toolCallId: "read-found" },
    ),
  );
  assert.ok(JSON.stringify(discovered).includes("Saved source content"));
  const foundDatabase = (await run(async () =>
    searchTools.search_workspace.execute!(
      {
        queryType: "content",
        query: "Tasks",
        types: ["database"],
        limit: 20,
        responseMode: "read",
      },
      { ...searchOptions, toolCallId: "search-db" },
    ),
  )) as { results: Array<{ id: string; type: string }> };
  assert.deepEqual(
    foundDatabase.results.map((match) => [match.type, match.id]),
    [["database", "db"]],
  );
  assert.ok(
    searchState.grants.every(
      (grant) => !["search-private", "search-foreign"].includes(grant.resource.id),
    ),
  );
  await assert.rejects(
    run(() =>
      readDocumentWindow(
        { ...context, pinnedWorkspaceId: "other-workspace" },
        { pageId: "page-0" },
      ),
    ),
    /Forbidden/,
  );
  const claimed = await run(() => beginChatTurn(context, request, built));
  assert.ok(claimed.threadId);
  await assert.rejects(
    runWithDb(second.db, () => beginChatTurn(context, request, built)),
    /still being generated/,
  );
  await run(() =>
    finishChatTurn(request.requestId, "Hello back", "completed", {
      inputTokens: 5,
      outputTokens: 3,
    }),
  );
  const replay = await run(() => beginChatTurn(context, request, built));
  assert.equal(replay.threadId, claimed.threadId);
  assert.equal(replay.replay?.assistantText, "Hello back");
  const rows = await client.db.select().from(askAiTurn);
  assert.equal(rows.length, 1);
  assert.equal("markdown" in rows[0]!.context, false);
  await assert.rejects(
    run(() => beginChatTurn(context, { ...request, text: "Different" }, built)),
    /Request ID/,
  );
  const detail = await run(() => getChatThread(context, "workspace", claimed.threadId));
  assert.equal(detail.messages.length, 2);
  assert.equal(detail.messages[1]?.context?.markdown, "");
  const otherContext = {
    ...context,
    authentication: { ...context.authentication, user: actors[1]! },
  };
  await assert.rejects(
    run(() => getChatThread(otherContext, "workspace", claimed.threadId)),
    /not found/,
  );
  await assert.rejects(
    run(() => getChatThread(context, "other-workspace", claimed.threadId)),
    /Switch/,
  );
  const interrupted = { ...request, requestId: randomUUID(), threadId: claimed.threadId };
  await run(() => beginChatTurn(context, interrupted, built));
  await client.db
    .update(askAiTurn)
    .set({ expiresAt: new Date(0) })
    .where(eq(askAiTurn.id, interrupted.requestId));
  const recovered = await run(() => getChatThread(context, "workspace", claimed.threadId));
  assert.equal(recovered.messages.at(-1)?.status, "interrupted");
  await client.db
    .update(askAiTurn)
    .set({
      context: {
        ...rows[0]!.context,
        manifest: [
          {
            key: "page:removed",
            type: "page",
            id: "removed",
            title: "Removed",
            pageId: "removed",
            provenance: { origin: "saved", capturedAt: new Date().toISOString() },
          },
        ],
      },
    })
    .where(eq(askAiTurn.id, request.requestId));
  await assert.rejects(
    run(() => getChatThread(context, "workspace", claimed.threadId)),
    /no longer accessible/,
  );
  await run(() => deleteChatThread(context, "workspace", claimed.threadId));
  assert.equal((await client.db.select().from(askAiThread)).length, 0);
  assert.equal((await client.db.select().from(askAiTurn)).length, 0);
  // Explicit opt-in: use only the synthetic records created in this isolated DB.
  if (process.env.ZILOBASE_AI_VERIFY_MODEL) {
    assert.ok(process.env.OPENAI_API_KEY, "Live verification needs an API key");
    const liveContext = {
      ...context,
      env: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        AI_MODEL: process.env.ZILOBASE_AI_VERIFY_MODEL,
        DATABASE_URL: connection,
      },
    };
    await run(async () => {
      const prepared = await prepareChat(liveContext, {
        ...request,
        requestId: randomUUID(),
        text: "In one sentence, name the attached page and cite it.",
        roots: [{ type: "page", id: "page-0" }],
      });
      let threadId = "",
        answer = "",
        completed = false;
      for await (const event of prepared.events(AbortSignal.timeout(45_000))) {
        if (event.type === "context") threadId = event.threadId ?? "";
        if (event.type === "delta") answer += event.text;
        if (event.type === "done") completed = event.status === "completed";
        if (event.type === "error") throw new Error(event.message);
      }
      assert.ok(completed && answer.trim(), "Live model must complete a streamed answer");
      const restored = await getChatThread(liveContext, "workspace", threadId);
      assert.equal(restored.messages.at(-1)?.status, "completed");
      assert.equal(restored.messages.at(-1)?.text, answer);
      await deleteChatThread(liveContext, "workspace", threadId);
    });
    console.info(
      "Live model completed attached-context streaming and persisted/reloaded its answer.",
    );
  }
  console.info(
    "AI migrations, idempotency, private threads, interrupted turns, source revocation and deletion passed.",
  );
} finally {
  await client.client.end();
  await second.client.end();
}
