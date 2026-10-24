import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { sql } from "drizzle-orm";
import {
  createDbClientForUrl,
  createDbClient,
  db,
  runWithDbEnv,
} from "../../apps/server/src/infrastructure/database";
import { runMigrationSets } from "@zilobase/runtime-adapter/node";
import { CORE_MIGRATION_SET } from "../../apps/server/src/public/node-adapter-api";
import { SEARCH_PROFILE } from "../../apps/server/src/services/search/vector-contracts";
import {
  annSearchCandidates,
  searchEligibleChunkCount,
} from "../../apps/server/src/services/search/ann";
import {
  exactSearchCandidates,
  hydrateVectorResults,
  semanticSearchWorkspace,
} from "../../apps/server/src/services/search/retrieval";
const url = process.env.ZILOBASE_BACKGROUND_VERIFY_URL!;
assert.equal(new URL(url).hostname, "127.0.0.1");
assert.equal(new URL(url).pathname, "/zilobase_background_verify");
const sizes = (process.env.ZILOBASE_SEARCH_BENCHMARK_SIZES ?? "10000,100000,1000000")
  .split(",")
  .map(Number);
assert.ok(sizes.every((n) => [10000, 100000, 1000000].includes(n)));
const fixture = createDbClientForUrl(url);
await fixture.client.connect();
const prefix = `bench-${randomUUID()}`,
  user = randomUUID(),
  other = randomUUID(),
  selective = randomUUID();
const env = { DATABASE_URL: url };
const reports = [];
const work = <T,>(fn: () => Promise<T>) => runWithDbEnv(env, fn);
const timed = async (fn) => {
  const start = performance.now();
  const value = await fn();
  return { ms: performance.now() - start, value };
};
try {
  assert.equal(
    (
      await fixture.client.query(
        "select count(*)::int n from information_schema.tables where table_schema='public'",
      )
    ).rows[0].n,
    0,
  );
  await runMigrationSets(fixture.db, [CORE_MIGRATION_SET]);
  await fixture.client.query("set maintenance_work_mem='2GB'");
  await fixture.client.query("set jit=off");
  await fixture.client.query("set max_parallel_maintenance_workers=2");
  for (const id of [user, other, selective])
    await fixture.client.query("insert into \"user\"(id,name,email) values($1,'Benchmark',$2)", [
      id,
      `${id}@example.test`,
    ]);
  await fixture.client.query(
    `create function search_benchmark_vector(n bigint) returns vector immutable language sql as $$ select (array(select (sin((n/10)*0.071*i+0.337*i)+0.001*sin(n*0.113*i))::real from generate_series(1,32) i)||array_fill(0::real,array[1504]))::vector $$`,
  );
  for (const size of sizes) {
    const pages = Math.ceil(size / 10),
      start = performance.now();
    await fixture.client.query("drop index if exists search_chunk_active_cosine_hnsw");
    await fixture.client.query(
      "truncate search_chunk,page_search_index,search_document,workspace_search_settings,page,workspace cascade",
    );
    await fixture.client.query(
      `insert into workspace(id,name,slug) select $1||'-w'||n,'Benchmark workspace '||n,$1||'-w'||n from generate_series(0,64)n`,
      [prefix],
    );
    await fixture.client.query(
      `insert into workspace_search_settings(workspace_id,cell_id,enabled,profile_id,backfill_completed_at) select id,'benchmark',false,$2,now() from workspace where id like $1||'%'`,
      [prefix, SEARCH_PROFILE.id],
    );
    await fixture.client.query(
      `insert into member(id,workspace_id,user_id) select gen_random_uuid()::text,w.id,u.id from workspace w cross join "user" u`,
      [],
    );
    // 80% in a dominant workspace; the remainder spread across 64 workspaces.
    await fixture.client.query(
      `insert into page(id,workspace_id,name,created_by_id,created_at,updated_at) select $1||'-p'||p,$1||'-w'||case when p%5<4 then 0 else 1+(p/5)%64 end,'Page '||p,case when p%3=0 then $2 else $3 end,now(),now() from generate_series(0,$4::int-1)p`,
      [prefix, user, other, pages],
    );
    await fixture.client.query(
      `insert into page_access(id,workspace_id,page_id,target_type,target_id,access_level,created_at,updated_at) select gen_random_uuid()::text,p.workspace_id,p.id,'user',$1,'view',now(),now() from page p where substring(p.id from '-p([0-9]+)$')::int%101=0`,
      [selective],
    );
    await fixture.client.query(
      `insert into page_search_index(workspace_id,page_id,profile_id,index_epoch,requested_revision,indexed_revision,status,active_generation_id) select workspace_id,id,$1,1,1,1,'ready',md5(id)::uuid from page`,
      [SEARCH_PROFILE.id],
    );
    for (let at = 0; at < size; at += 10000) {
      // Every 100,000 chunks contains one 1,000-chunk page to exercise uneven sizes.
      await fixture.client.query(
        `insert into search_chunk(workspace_id,page_id,profile_id,index_epoch,generation_id,source_revision,chunk_kind,source_key,chunk_index,content_markdown,embedding_input_hash,embedding,is_active,byte_count,metadata)
    select p.workspace_id,p.id,$2,1,md5(p.id)::uuid,1,'body','body',n,'Synthetic benchmark passage',md5(n::text),search_benchmark_vector(n),true,27,'{"headingPath":[]}'::jsonb
    from generate_series($3::int,$4::int)n join page p on p.id=$1||'-p'||case when n%100000<1000 then (n/100000)*10000 else n/10 end`,
        [prefix, SEARCH_PROFILE.id, at, Math.min(size - 1, at + 9999)],
      );
      if (at % 100000 === 0) console.info(`Seed ${size}: ${Math.min(size, at + 10000)} chunks`);
    }
    const ingestionMs = performance.now() - start;
    console.info(`Building ${size}-chunk HNSW indexes`);
    const index = await timed(() =>
      fixture.client.query(
        "create index search_chunk_active_cosine_hnsw on search_chunk using hnsw(embedding vector_cosine_ops) with(m=16,ef_construction=64) where is_active and embedding is not null",
      ),
    );
    console.info(
      JSON.stringify({
        event: "benchmark_setup",
        chunks: size,
        ingestionMs,
        indexBuildMs: index.ms,
      }),
    );
    await fixture.client.query("update workspace_search_settings set enabled=true");
    for (const table of ["search_chunk", "page_search_index", "page", "page_access", "member"])
      await fixture.client.query(`analyze ${table}`);
    const storage = (
      await fixture.client.query(
        "select sum(pg_total_relation_size(relid))::text bytes from pg_partition_tree('search_chunk') where isleaf",
      )
    ).rows[0];
    const metrics = [];
    for (const [workspace, actor, label] of [
      [`${prefix}-w0`, user, "dominant"],
      [`${prefix}-w1`, user, "small-workspace"],
      [`${prefix}-w0`, selective, "selective-access"],
    ]) {
      const target = (
        await fixture.client.query(
          "select embedding::text vector from search_chunk where workspace_id=$1 and embedding is not null order by chunk_index,id limit 1",
          [workspace],
        )
      ).rows[0];
      if (!target) continue;
      const vector = JSON.parse(target.vector);
      const interactive = await timed(() =>
        work(() =>
          semanticSearchWorkspace(
            {
              workspaceId: workspace,
              userId: actor,
              query: `semantic benchmark ${size} ${label}`,
              membershipVerified: true,
              limit: 50,
            },
            { ...env, SEARCH_EMBEDDINGS_ENABLED: "true", ZILOBASE_CELL_ID: "benchmark" },
            {
              provider: {
                embedDocuments: async () => ({ embeddings: [] }),
                embedQuery: async () => ({ embeddings: [vector], inputTokens: 1 }),
              },
            },
          ),
        ),
      );
      await work(async () => {
        await db.transaction(async (tx) => {
          const { runWithDb } = await import("../../apps/server/src/infrastructure/database");
          await tx.execute(sql`set local jit=off`);
          await tx.execute(sql`set local statement_timeout='120s'`);
          await runWithDb(tx as never, async () => {
            const count = await timed(() => searchEligibleChunkCount(workspace, actor));
            const exact = await timed(async () =>
              hydrateVectorResults(
                workspace,
                actor,
                await exactSearchCandidates(workspace, actor, vector, 2000),
              ),
            );
            const nearest = exact.value.slice(0, 20);
            let found = [],
              window = 0;
            const ann = await timed(async () => {
              for (const n of [2000]) {
                window = n;
                found = await hydrateVectorResults(
                  workspace,
                  actor,
                  await annSearchCandidates(workspace, actor, vector, n),
                );
                if (found.length >= 20) break;
              }
              return found.slice(0, 20);
            });
            const expected = new Set(nearest.map((x) => x.id));
            const recall = expected.size
              ? ann.value.filter((x) => expected.has(x.id)).length / expected.size
              : 1;
            const plan = (
              await tx.execute(
                sql`explain(format json) select id from search_chunk where workspace_id=${workspace}`,
              )
            ).rows[0]["QUERY PLAN"];
            const partitions = new Set(
              [...JSON.stringify(plan).matchAll(/"Relation Name":"(search_chunk_p\d+)"/g)].map(
                (x) => x[1],
              ),
            );
            metrics.push({
              label,
              interactiveMs: interactive.ms,
              interactiveMode: interactive.value.metadata.mode,
              interactiveDegradation: interactive.value.metadata.degradationReason ?? null,
              interactiveResults: interactive.value.results.length,
              eligibleCountCapped: count.value,
              countMs: count.ms,
              exactMs: exact.ms,
              annMs: ann.ms,
              annWindow: window,
              exactPages: nearest.length,
              annPages: ann.value.length,
              annRecallAt20: recall,
              selectedStrategy: count.value <= 10000 ? "exact" : "ann",
              selectedRecallAt20: count.value <= 10000 ? 1 : recall,
              prunedPartitions: partitions.size,
            });
            console.info(JSON.stringify({ size, ...metrics.at(-1) }));
          });
        });
      });
    }
    reports.push({
      chunks: size,
      pages,
      workspaces: 65,
      ingestionMs,
      indexBuildMs: index.ms,
      chunksPerSecond: size / (ingestionMs / 1000),
      storageBytes: storage.bytes,
      metrics,
    });
    await mkdir(".test-results/search", { recursive: true });
    await writeFile(
      ".test-results/search/scale.json",
      JSON.stringify(
        {
          machine: {
            platform: os.platform(),
            arch: os.arch(),
            hostMemoryBytes: os.totalmem(),
            cpu: os.cpus()[0].model,
            node: process.version,
          },
          reports,
        },
        null,
        2,
      ),
    );
  }
  assert.ok(
    reports.every((r) =>
      r.metrics.every(
        (m) => m.selectedRecallAt20 >= 0.95 && m.prunedPartitions === 1 && m.interactiveMs < 2500,
      ),
    ),
    "Selected retrieval recall/partition/interactive-budget gates failed; retain scale report",
  );
} finally {
  await fixture.client.end();
  await createDbClient(env).client.end();
}
