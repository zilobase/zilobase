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
    console.info("PASS location, people, me, inaccessible candidates, and editor migration");
  });
} finally {
  await fixture.client.end();
}
