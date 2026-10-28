import { contentVerificationOperation } from "../../apps/server/src/services/pages/verification";
import * as Y from "yjs";
import { encodePageContentAsYjs } from "../../apps/server/src/services/collaboration/documents/document-codec";
import { documentNameForPage } from "../../apps/server/src/services/collaboration/documents/documents";
import { storeDocument } from "../../apps/server/src/services/collaboration/persistence/document-persistence";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchWorkspaceUsersOperation } from "../../apps/server/src/services/search/users";
import type { ServerOperationContext } from "../../apps/server/src/services/operations/context";
import {
  database,
  dataSource,
  databaseDataSource,
  databaseView,
  databaseRow,
  pageProperty,
  databaseProperty,
  teamspace,
  teamspacePrincipal,
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
  const upgradeFolder = await mkdtemp(join(tmpdir(), "zilobase-search-upgrade-"));
  try {
    await cp(CORE_MIGRATION_SET.migrationsFolder, upgradeFolder, { recursive: true });
    const journalFile = join(upgradeFolder, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalFile, "utf8"));
    const allEntries = journal.entries;
    journal.entries = journal.entries.filter((entry) => entry.when < 1792800000000);
    await writeFile(journalFile, JSON.stringify(journal));
    await runMigrationSets(fixture.db, [
      { ...CORE_MIGRATION_SET, migrationsFolder: upgradeFolder },
    ]);
    await fixture.client.query(
      "insert into workspace(id,name,slug) values('legacy-controls','Legacy','legacy-controls')",
    );
    await fixture.client.query(
      "insert into page(id,workspace_id,name,created_at,updated_at) values('legacy-controls-page','legacy-controls','Legacy','2020-01-01','2020-02-01')",
    );
    journal.entries = allEntries.filter((entry) => entry.when < 1792800000004);
    await writeFile(journalFile, JSON.stringify(journal));
    await runMigrationSets(fixture.db, [
      { ...CORE_MIGRATION_SET, migrationsFolder: upgradeFolder },
    ]);
    const legacy = (
      await fixture.client.query(
        "select updated_at,last_edited_at,last_edited_by_id,verified_at from page where id='legacy-controls-page'",
      )
    ).rows[0];
    assert.equal(legacy.last_edited_at.toISOString(), "2020-02-01T00:00:00.000Z");
    assert.equal(legacy.updated_at.toISOString(), "2020-02-01T00:00:00.000Z");
    assert.equal(legacy.last_edited_by_id, null);
    assert.equal(legacy.verified_at, null);
    // Emulate the original applied 0119/0122: their journal entries exist, but
    // metadata-only page updates still advance the document confirmation clock.
    await fixture.client.query(`
      CREATE OR REPLACE FUNCTION zilobase_stamp_entity_update() RETURNS trigger AS $$
      BEGIN
        NEW.updated_at := GREATEST(
          date_trunc('milliseconds', clock_timestamp()),
          date_trunc('milliseconds', OLD.updated_at) + interval '1 millisecond'
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await runMigrationSets(fixture.db, [CORE_MIGRATION_SET]);
    const metadataOnly = (
      await fixture.client.query(
        "update page set verified_at=now(),verification_updated_at=now(),last_edited_at=now() where id='legacy-controls-page' returning updated_at",
      )
    ).rows[0];
    assert.equal(metadataOnly.updated_at.toISOString(), "2020-02-01T00:00:00.000Z");
    const contentEdit = (
      await fixture.client.query(
        "update page set name='Edited legacy' where id='legacy-controls-page' returning updated_at,verified_at",
      )
    ).rows[0];
    assert.ok(contentEdit.updated_at > metadataOnly.updated_at);
    assert.ok(contentEdit.verified_at);
    await runMigrationSets(fixture.db, [CORE_MIGRATION_SET]);
    await fixture.client.query("delete from workspace where id='legacy-controls'");
    console.info(
      "PASS upgrade migration, legacy clocks, unknown editor, applied-migration clock repair, repeat migration",
    );
  } finally {
    await rm(upgradeFolder, { recursive: true, force: true });
  }
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
    await db
      .insert(databaseRow)
      .values({ id: randomUUID(), dataSourceId: source, pageId: child, orderKey: "1" });
    assert.deepEqual(
      (await search({ dataSourceIds: [source] }, "")).map((r) => r.id),
      [child],
    );
    const privateHost = randomUUID(),
      privateSource = randomUUID();
    await db
      .insert(database)
      .values({ id: privateHost, workspaceId: w, createdById: other, name: "Private host" });
    await db.insert(dataSource).values({
      id: privateSource,
      workspaceId: w,
      parentDatabaseId: privateHost,
      createdById: other,
      name: "Confidential source",
    });
    await db.insert(databaseDataSource).values({ databaseId: host, dataSourceId: privateSource });
    await db.insert(databaseView).values({
      id: randomUUID(),
      databaseId: host,
      dataSourceId: privateSource,
      name: "Secret view",
      type: "table",
    });
    await db
      .insert(databaseRow)
      .values({ id: randomUUID(), dataSourceId: privateSource, pageId: child, orderKey: "1" });
    assert.equal((await search({}, "Confidential")).length, 0);
    assert.equal((await search({}, "Secret")).length, 0);
    assert.equal((await search({ dataSourceIds: [privateSource] }, "")).length, 0);
    const property = randomUUID();
    await db
      .insert(pageProperty)
      .values({ id: property, workspaceId: w, name: "Old property", type: "text" });
    await db
      .insert(databaseProperty)
      .values({ id: randomUUID(), dataSourceId: source, propertyId: property });
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('zilobase.content_actor',${other},true)`);
      await tx.execute(sql`update page_property set name='Renamed property' where id=${property}`);
    });
    assert.equal((await search({ editedByUserIds: [other] }, "Authoritative"))[0]?.id, host);
    const ts1 = randomUUID(),
      ts2 = randomUUID();
    await db.insert(teamspace).values([
      { id: ts1, workspaceId: w, name: "Team One" },
      { id: ts2, workspaceId: w, name: "Team Two" },
    ]);
    await db.insert(teamspacePrincipal).values(
      [ts1, ts2].map((id) => ({
        id: randomUUID(),
        teamspaceId: id,
        principalType: "user",
        principalId: actor,
        role: "owner",
      })),
    );
    await db.execute(sql`update page set teamspace_id=${ts1} where id=${child}`);
    await db.execute(sql`update page set teamspace_id=${ts2} where id=${linked}`);
    assert.equal((await search({ teamspaceIds: [ts1, ts2] }, "")).length, 2);
    await db.execute(sql`update page set teamspace_id=${ts2} where id=${child}`);
    assert.equal((await search({ teamspaceIds: [ts1] }, "")).length, 0);
    console.info(
      "PASS data-source rows, hidden linked sources/views, property attribution, multiple teamspaces and moves",
    );
    const plan = await db.execute(
      sql`explain (analyze,format json) ${keywordCandidateQuery({ workspaceId: w, userId: actor, query: "", filters: { createdByUserIds: ["me"] }, sort: "last_edited_desc", limit: 10 })}`,
    );
    assert.ok(plan.rows.length);
    const context = {
      authentication: { authMethod: "session", user: { id: actor } },
      pinnedWorkspaceId: w,
    } as ServerOperationContext;
    const databaseVerification = await contentVerificationOperation(context, {
      type: "database",
      id: host,
      action: "verify",
      body: { expiresAt: null },
    });
    assert.equal(databaseVerification.verification.state, "verified");
    assert.equal(
      (await search({ contentStatus: ["verified"] }, "Authoritative"))[0]?.verification?.state,
      "verified",
    );
    await contentVerificationOperation(context, { type: "database", id: host, action: "remove" });
    assert.equal(
      (await contentVerificationOperation(context, { type: "database", id: host, action: "read" }))
        .verification.state,
      "unverified",
    );
    console.info("PASS database verification lifecycle and search metadata");
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
    await db.execute(
      sql`insert into page(id,workspace_id,name,created_by_id,created_at,updated_at) select ${w}||'-scale-'||n,${w},'Controls scale '||n,${actor},now(),now() from generate_series(1,10000) n`,
    );
    await db.execute(
      sql`analyze page,search_document,page_item_placement,database_row,database,data_source`,
    );
    const collaborationPage = randomUUID();
    const created = await db.execute<{ last_edited_at: Date }>(
      sql`insert into page(id,workspace_id,name,created_by_id,created_at,updated_at) values(${collaborationPage},${w},'Collaboration attribution',${actor},now(),now()) returning last_edited_at`,
    );
    const baseline = new Date(created.rows[0].last_edited_at).getTime();
    const firstEdit = new Date(baseline + 10),
      secondEdit = new Date(baseline + 20);
    const store = async (text: string, userId: string, occurredAt: Date) => {
      const doc = new Y.Doc();
      Y.applyUpdate(
        doc,
        encodePageContentAsYjs({
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        }),
      );
      await storeDocument(
        documentNameForPage(collaborationPage),
        doc,
        Y.encodeStateAsUpdate(doc),
        { DATABASE_URL: url },
        { userId, occurredAt },
      );
      doc.getMap("commentThreads").set("thread", "comment only");
      await storeDocument(documentNameForPage(collaborationPage), doc, Y.encodeStateAsUpdate(doc), {
        DATABASE_URL: url,
      });
      doc.destroy();
    };
    await store("First edit", actor, firstEdit);
    await store("Second edit", other, secondEdit);
    await store("Delayed earlier edit", actor, firstEdit);
    const attribution = (
      await db.execute<{ last_edited_by_id: string; last_edited_at: Date }>(
        sql`select last_edited_by_id,last_edited_at from page where id=${collaborationPage}`,
      )
    ).rows[0];
    assert.equal(attribution.last_edited_by_id, other);
    assert.equal(new Date(attribution.last_edited_at).toISOString(), secondEdit.toISOString());
    console.info("PASS two-editor persistence, comment-only saves, delayed attribution guard");
    const scale = [];
    for (const sort of ["created_desc", "last_edited_desc", "title_asc"] as const) {
      const started = performance.now();
      const found = await searchWorkspaceItems({
        workspaceId: w,
        userId: actor,
        query: "Controls scale",
        filters: { createdByUserIds: ["me"], titleOnly: true },
        sort,
        limit: 50,
      });
      assert.equal(found.length, 50);
      scale.push({ sort, milliseconds: Math.round(performance.now() - started) });
    }
    const recursiveStart = performance.now();
    assert.equal((await search({ pageIds: [root] }, "")).length, 2);
    console.info(
      "PASS 10k keyword scale and bounded recursive locations",
      JSON.stringify({ scale, recursiveMs: Math.round(performance.now() - recursiveStart) }),
    );
    console.info("PASS location, people, me, inaccessible candidates, and editor migration");
  });
} finally {
  await fixture.client.end();
}
