import { searchWorkspaceUsersOperation } from "../../apps/server/src/services/search/users";
import type { ServerOperationContext } from "../../apps/server/src/services/operations/context";
import {
  database,
  dataSource,
  databaseDataSource,
  databaseView,
} from "../../apps/server/src/infrastructure/database/schema";
import { keywordCandidateQuery } from "../../apps/server/src/services/search/keyword-query";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDbClientForUrl, runWithDb, db } from "../../apps/server/src/infrastructure/database";
import { CORE_MIGRATION_SET } from "../../apps/server/src/public/node-adapter-api";
import { runMigrationSets } from "@zilobase/runtime-adapter/node";
import { searchWorkspaceItems } from "../../apps/server/src/services/search/workspace-search";
const url = process.env.ZILOBASE_BACKGROUND_VERIFY_URL!;
assert.equal(new URL(url).hostname, "127.0.0.1");
assert.equal(new URL(url).pathname, "/zilobase_background_verify");
const fixture = createDbClientForUrl(url);
try {
  await fixture.client.connect();
  await runMigrationSets(fixture.db, [CORE_MIGRATION_SET]);
  await runWithDb(fixture.db, async () => {
    const w = randomUUID(),
      actor = randomUUID(),
      other = randomUUID();
    await db.execute(sql`insert into workspace(id,name,slug) values(${w},'Controls',${w})`);
    await db.execute(
      sql`insert into "user"(id,name,email) values(${actor},'Ada',${actor + "@test.invalid"}),(${other},'Other',${other + "@test.invalid"})`,
    );
    await db.execute(
      sql`insert into member(id,workspace_id,user_id,role) values(${randomUUID()},${w},${actor},'owner'),(${randomUUID()},${w},${other},'member')`,
    );
    const root = randomUUID(),
      child = randomUUID(),
      linked = randomUUID();
    await db.execute(
      sql`insert into page(id,workspace_id,name,created_by_id,content,created_at,updated_at) values(${root},${w},'Root',${actor},'{}',now(),now()),(${child},${w},'Needle child',${actor},'{}',now(),now()),(${linked},${w},'Needle linked',${actor},'{}',now(),now())`,
    );
    await db.execute(
      sql`insert into page_item_placement(id,workspace_id,parent_kind,parent_id,item_kind,item_id,placement_kind,created_at,updated_at) values(${randomUUID()},${w},'page',${root},'page',${child},'primary',now(),now()),(${randomUUID()},${w},'page',${root},'page',${linked},'linked',now(),now())`,
    );
    const search = (filters = {}, query = "Needle", limit = 50) =>
      searchWorkspaceItems({ workspaceId: w, userId: actor, query, filters, limit });
    assert.deepEqual(
      (await search({ pageIds: [root] })).map((r) => r.id),
      [child],
    );
    assert.equal((await search({ pageIds: [randomUUID()] })).length, 0);
    assert.equal((await search({ createdByUserIds: ["me"] })).length, 2);
    assert.equal((await search({ editedByUserIds: [other] })).length, 0);
    // More inaccessible matches than the old candidate pool cannot crowd out an accessible result.
    await db.execute(
      sql`insert into page(id,workspace_id,name,created_by_id,created_at,updated_at) select ${w}||'-hidden-'||n,${w},'Needle A '||n,${other},now(),now() from generate_series(1,600) n`,
    );
    assert.equal((await search({}, "Needle", 2)).length, 2);
    await db.execute(
      sql`update page set name='Changed child',last_edited_by_id=${other},last_edited_at=clock_timestamp() where id=${child}`,
    );
    assert.deepEqual(
      (await search({ editedByUserIds: [other] }, "Changed")).map((r) => r.id),
      [child],
    );
    assert.equal(
      (await search({ createdByUserIds: ["me"], editedByUserIds: [other] }, "Changed")).length,
      1,
    );
    await db.execute(
      sql`update page set content='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"bodysecret"}]}]}'::jsonb where id=${child}`,
    );
    assert.equal((await search({}, "bodysecret")).length, 1);
    assert.equal((await search({ titleOnly: true }, "bodysecret")).length, 0);
    await db.execute(
      sql`update page set created_at='2026-01-01T00:00:00Z',verified_at='2026-01-01T00:00:00Z',verification_expires_at='2026-02-01T00:00:00Z' where id=${child}`,
    );
    assert.equal((await search({ contentStatus: ["expired"] }, "")).length, 1);
    assert.equal((await search({ contentStatus: ["verified"] }, "")).length, 0);
    assert.equal(
      (
        await search(
          { createdAt: { onOrAfter: "2026-01-01T00:00:00Z", before: "2026-01-02T00:00:00Z" } },
          "",
        )
      ).length,
      1,
    );
    assert.equal((await search({ createdAt: { before: "2026-01-01T00:00:00Z" } }, "")).length, 0);
    const ordered = await searchWorkspaceItems({
      workspaceId: w,
      userId: actor,
      query: "",
      sort: "created_asc",
      limit: 1,
    });
    assert.equal(ordered[0]?.id, child);
    assert.equal(ordered[0]?.verification?.state, "expired");
    assert.equal(ordered[0]?.createdAt, "2026-01-01T00:00:00.000Z");
    const host = randomUUID(),
      source = randomUUID();
    await db.insert(database).values({
      id: host,
      workspaceId: w,
      createdById: actor,
      name: "Container old",
      pageId: null,
    });
    await db.insert(dataSource).values({
      id: source,
      workspaceId: w,
      parentDatabaseId: host,
      createdById: actor,
      name: "Authoritative heading",
    });
    await db.insert(databaseDataSource).values({ databaseId: host, dataSourceId: source });
    await db.insert(databaseView).values({
      id: randomUUID(),
      databaseId: host,
      dataSourceId: source,
      name: "Hidden view name",
      type: "table",
    });
    assert.equal((await search({ titleOnly: true }, "Authoritative"))[0]?.id, host);
    assert.equal((await search({ titleOnly: true }, "Container")).length, 0);
    assert.equal((await search({ titleOnly: true }, "Hidden")).length, 0);
    assert.equal((await search({}, "Hidden"))[0]?.id, host);
    const plan = await db.execute(
      sql`explain (analyze,format json) ${keywordCandidateQuery({ workspaceId: w, userId: actor, query: "", filters: { createdByUserIds: ["me"] }, sort: "last_edited_desc", limit: 10 })}`,
    );
    assert.ok(plan.rows.length);
    const context = {
      authentication: { authMethod: "session", user: { id: actor } },
      pinnedWorkspaceId: w,
    } as ServerOperationContext;
    const lookup = (query: string, actorContext = context) =>
      searchWorkspaceUsersOperation(actorContext, {
        workspaceId: w,
        request: { queryType: "user", query },
      });
    assert.equal((await lookup(actor + "@TEST.INVALID")).users[0]?.id, actor);
    assert.equal((await lookup("Ada")).users[0]?.id, actor);
    const guest = randomUUID(),
      outsider = randomUUID(),
      expired = randomUUID();
    await db.execute(
      sql`insert into "user"(id,name,email) values(${guest},'Directory Guest',${guest + "@test.invalid"}),(${outsider},'Directory Outsider',${outsider + "@test.invalid"}),(${expired},'Directory Expired',${expired + "@test.invalid"})`,
    );
    await db.execute(
      sql`insert into workspace_guest(id,workspace_id,user_id) values(${randomUUID()},${w},${guest})`,
    );
    await db.execute(
      sql`insert into member(id,workspace_id,user_id,role,access_expires_at) values(${randomUUID()},${w},${expired},'temporary',now()-interval '1 day')`,
    );
    assert.deepEqual(
      (await lookup("Directory")).users.map((u) => u.id),
      [guest],
    );
    assert.equal(
      (
        await lookup("Directory", {
          ...context,
          authentication: { ...context.authentication, user: { id: other } as never },
        })
      ).users.length,
      0,
    );
    await assert.rejects(
      lookup("Ada", {
        ...context,
        authentication: {
          ...context.authentication,
          authMethod: "oauth",
          oauthScopes: ["search.read"],
        },
      }),
      { status: 403 },
    );
    assert.equal(
      (
        await lookup("Ada", {
          ...context,
          authentication: {
            ...context.authentication,
            authMethod: "oauth",
            oauthScopes: ["users.read"],
          },
        })
      ).users[0]?.id,
      actor,
    );
    console.info(
      "PASS workspace directory, guest privileges, temporary expiry, isolated OAuth scope",
    );
    console.info(
      "PASS title-only, date boundaries, expiry, sorting, live source headings, query plan",
    );
    console.info("PASS location, people, me, inaccessible candidates, and editor migration");
  });
} finally {
  await fixture.client.end();
}
