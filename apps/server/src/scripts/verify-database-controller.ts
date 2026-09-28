import assert from "node:assert/strict";
import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { runMigrationSets } from "@zilobase/runtime-adapter/node";
import { databaseViewQueryHash } from "@zilobase/features/databases/query-hash";
import type {
  DatabaseCommand,
  DatabaseCommandRequest,
} from "@zilobase/features/databases/contracts";
import { createDbClientForUrl, runWithDb } from "../infrastructure/database";
import {
  database,
  databaseAccess,
  databaseActorState,
  databaseCommandReceipt,
  databaseDataSource,
  databaseMutationEvent,
  databaseRealtimeOutbox,
  databaseRow,
  databaseView,
  dataSource,
  member,
  page,
  user,
  workspace,
} from "../infrastructure/database/schema";
import { CORE_MIGRATION_SET } from "../public/node-adapter-api";
import { executeDatabaseCommand } from "../features/databases/commands/framework";
import { dispatchDatabaseCommand } from "../features/databases/commands/dispatcher";
import {
  DatabaseViewQueryChangedError,
  getDatabaseRecordWindowService,
} from "../features/databases/read/service";
import { pageBrowseRoutes } from "../features/pages/page-browse-routes";
import type { AppBindings } from "../shared/types";
import type { PageNavigationPayload } from "@zilobase/features/pages/contracts";

const connection = process.env.ZILOBASE_CONTROLLER_VERIFY_URL;
assert.ok(connection, "Use the isolated controller test runner; no default database is allowed");
const url = new URL(connection);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/zilobase_controller_verify");
const first = createDbClientForUrl(connection, { queryTimeoutMillis: 15_000 });
const second = createDbClientForUrl(connection, { queryTimeoutMillis: 15_000 });
try {
  await first.client.connect();
  await second.client.connect();
  const existing = await first.client.query(
    "select count(*)::int as count from information_schema.tables where table_schema = 'public'",
  );
  assert.equal(existing.rows[0].count, 0, "Verification refuses a nonempty database");
  await runMigrationSets(first.db, [CORE_MIGRATION_SET]);
  const nullable = await first.client.query(
    "select is_nullable from information_schema.columns where table_name = 'database_command_receipt' and column_name = 'event_id'",
  );
  assert.equal(nullable.rows[0]?.is_nullable, "YES");
  const [actor, other] = await first.db
    .insert(user)
    .values([
      { id: "actor", name: "Actor", email: "actor@controller.invalid" },
      { id: "other", name: "Other", email: "other@controller.invalid" },
    ])
    .returning();
  await first.db
    .insert(workspace)
    .values({ id: "workspace", name: "Verification", slug: "verification" });
  await first.db.insert(member).values([
    { id: "membership", organizationId: "workspace", userId: "actor", role: "owner" },
    { id: "other-membership", organizationId: "workspace", userId: "other", role: "member" },
  ]);
  await first.db.insert(database).values([
    { id: "host", workspaceId: "workspace", createdById: "actor", name: "Database", config: {} },
    {
      id: "linked-host",
      workspaceId: "workspace",
      createdById: "actor",
      name: "Linked",
      config: {},
    },
  ]);
  await first.db.insert(databaseAccess).values({
    id: "other-access",
    databaseId: "host",
    workspaceId: "workspace",
    targetType: "user",
    targetId: "other",
    accessLevel: "view",
  });
  await first.db.insert(dataSource).values({
    id: "source",
    workspaceId: "workspace",
    parentDatabaseId: "host",
    createdById: "actor",
    name: "Source",
    config: {},
  });
  await first.db.insert(databaseDataSource).values({ databaseId: "host", dataSourceId: "source" });
  await first.db.insert(databaseView).values({
    id: "view",
    databaseId: "host",
    dataSourceId: "source",
    name: "Table",
    type: "table",
    config: {},
  });
  for (const [index, id] of ["a", "b"].entries()) {
    await first.db
      .insert(page)
      .values({ id, workspaceId: "workspace", createdById: "actor", name: id });
    await first.db
      .insert(databaseRow)
      .values({ id, dataSourceId: "source", pageId: id, orderKey: String((index + 1) * 1024) });
  }
  const send = (
    command: DatabaseCommand,
    options: {
      databaseId?: string;
      dataSourceId?: string;
      requestId?: string;
      client?: typeof first;
    } = {},
  ) => {
    const request: DatabaseCommandRequest = {
      command,
      commandId: options.requestId ?? crypto.randomUUID(),
      protocolVersion: 2,
    };
    return executeDatabaseCommand(
      {
        actorId: "actor",
        scope: {
          databaseId: options.databaseId ?? "host",
          dataSourceId: options.dataSourceId ?? null,
        },
        request,
      },
      { database: (options.client ?? first).db, dispatch: dispatchDatabaseCommand },
    );
  };
  const nav = async (activeActor: typeof actor) => {
    const app = new Hono<AppBindings>();
    app.use("*", async (c, next) => {
      c.set("user", activeActor!);
      c.set("authMethod", "session");
      await next();
    });
    app.route("/pages", pageBrowseRoutes);
    const response = await runWithDb(first.db, async () =>
      app.request("/pages?workspaceId=workspace&fields=nav"),
    );
    assert.equal(response.status, 200, await response.clone().text());
    return ((await response.json()) as PageNavigationPayload).databases.find(
      ({ id }) => id === "host",
    )!;
  };
  const favoriteCommand = { type: "database.favorite", favorite: true } as const;
  const favoriteAck = await send(favoriteCommand, { requestId: "favorite-once" });
  assert.deepEqual(await send(favoriteCommand, { requestId: "favorite-once" }), favoriteAck);
  assert.equal(favoriteAck.privateConfirmation?.revision, 1);
  assert.deepEqual((await nav(actor)).actorState, {
    actorId: "actor",
    revision: 1,
    isFavorite: true,
  });
  assert.deepEqual((await nav(other)).actorState, {
    actorId: "other",
    revision: 0,
    isFavorite: false,
  });
  assert.equal((await first.db.select().from(databaseMutationEvent)).length, 0);
  assert.equal((await first.db.select().from(databaseRealtimeOutbox)).length, 0);
  const concurrent = await Promise.all([
    send({ type: "database.favorite", favorite: false }),
    send({ type: "database.favorite", favorite: true }, { client: second }),
  ]);
  concurrent.sort((a, b) => a.privateConfirmation!.revision - b.privateConfirmation!.revision);
  assert.deepEqual(
    concurrent.map((ack) => ack.privateConfirmation!.revision),
    [2, 3],
  );
  assert.equal(
    (await nav(actor)).isFavorite,
    (concurrent[1]!.result as { isFavorite: boolean }).isFavorite,
  );
  assert.equal((await first.db.select().from(databaseActorState)).length, 1);
  console.info(
    "Passed real private receipts, idempotent replay, concurrent actor ordering and navigation isolation.",
  );

  const read = (hash: string) =>
    runWithDb(first.db, () =>
      getDatabaseRecordWindowService({
        databaseId: "host",
        dataSourceId: "source",
        viewId: "view",
        userId: "actor",
        expectedQueryHash: hash,
      }),
    );
  const emptyHash = databaseViewQueryHash({});
  assert.equal((await read(emptyHash)).queryHash, emptyHash);
  const sorts = [{ column: "name", direction: "descending" }];
  await send({
    type: "view.update",
    viewId: "view",
    patch: { configuration: [{ operation: "set", path: ["sorts"], value: sorts }] },
  });
  await assert.rejects(read(emptyHash), DatabaseViewQueryChangedError);
  assert.equal((await read(databaseViewQueryHash({ sorts }))).records[0]?.id, "b");
  const placement = await send(
    {
      type: "row.change",
      rowId: "b",
      placement: { afterRowId: null, beforeRowId: "a" },
      clearSortViewId: "view",
    },
    { dataSourceId: "source" },
  );
  assert.ok(placement.event?.areas.includes("views"));
  assert.ok(placement.event?.areas.includes("records"));
  assert.deepEqual(
    (await read(emptyHash)).records.map(({ id }) => id),
    ["b", "a"],
  );
  const before = await first.db.select().from(databaseRow).orderBy(asc(databaseRow.orderKey));
  await assert.rejects(
    send(
      {
        type: "row.change",
        rowId: "a",
        placement: { afterRowId: null, beforeRowId: "b" },
        clearSortViewId: "missing",
      },
      { dataSourceId: "source", requestId: "reject-compound" },
    ),
  );
  assert.deepEqual(
    await first.db.select().from(databaseRow).orderBy(asc(databaseRow.orderKey)),
    before,
  );
  assert.equal(
    (
      await first.db
        .select()
        .from(databaseCommandReceipt)
        .where(eq(databaseCommandReceipt.commandId, "reject-compound"))
    ).length,
    0,
  );
  const sourceBefore = (await first.db.select().from(dataSource))[0]!.version;
  const setup = await send({
    type: "view.update",
    viewId: "view",
    patch: { configuration: [{ operation: "set", path: ["subItems"], value: { enabled: true } }] },
  });
  assert.equal(setup.sourceVersions.source, sourceBefore + 1);
  for (let index = 0; index < 2; index++)
    await send(
      {
        type: "dataSource.link",
        dataSourceId: "source",
        afterId: null,
        beforeId: null,
        view: { name: "Linked", type: "table", config: {} },
      },
      { databaseId: "linked-host" },
    );
  assert.equal(
    (await first.db.select().from(databaseView).where(eq(databaseView.databaseId, "linked-host")))
      .length,
    2,
  );
  const archiveSourceVersion = (await first.db.select().from(dataSource))[0]!.version;
  const archived = await send({ type: "database.archive" });
  assert.equal(archived.sourceVersions.source, archiveSourceVersion + 1);
  const archiveEvents = await first.db
    .select()
    .from(databaseMutationEvent)
    .where(eq(databaseMutationEvent.commandId, archived.commandId));
  assert.ok(
    archiveEvents.some((event) => event.databaseId === "linked-host" && event.requiresReset),
  );
  const restored = await send({ type: "database.restore" });
  assert.equal(restored.sourceVersions.source, archiveSourceVersion + 2);
  assert.deepEqual(
    (await read(emptyHash)).records.map(({ id }) => id),
    ["b", "a"],
  );
  console.info(
    "Passed real query hashes, atomic sort/drop rollback, sub-item source revisions and source-link/view compounds.",
  );
  console.info(
    "Passed archive/restore source revisions, linked-host resets and restored record ordering.",
  );
} finally {
  await Promise.all([first.client.end(), second.client.end()]);
}
