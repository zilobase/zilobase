import { checkControlsHttp } from "./controls-http.mts";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import {
  createDbClientForUrl,
  createDbClient,
  runWithDbEnv,
  db,
} from "../../apps/server/src/infrastructure/database";
import { CORE_MIGRATION_SET } from "../../apps/server/src/public/node-adapter-api";
import { runMigrationSets } from "@zilobase/runtime-adapter/node";
import { CookieJar, createApiClient } from "../selfhost/api-conformance.mjs";
import { startSearchRuntime } from "./runtime.mts";
import { startEmbeddingFixture } from "./providers.mts";
const kind = process.env.ZILOBASE_SEARCH_TEST_RUNTIME!;
const url = process.env.ZILOBASE_BACKGROUND_VERIFY_URL!;
assert.equal(new URL(url).hostname, "127.0.0.1");
assert.equal(new URL(url).pathname, "/zilobase_background_verify");
let fixture = createDbClientForUrl(url);
const provider = await startEmbeddingFixture();
const env = {
  DATABASE_URL: url,
  QUEUE_REDIS_URL: process.env.ZILOBASE_QUEUE_VERIFY_URL!,
  ZILOBASE_CELL_ID: `search-${randomUUID()}`,
  ZILOBASE_EDITION: "community",
  SEARCH_EMBEDDINGS_ENABLED: "true",
  GEMINI_API_KEY: "fixture-only-no-credentials",
  SEARCH_EMBEDDING_RPM: "10000",
  SEARCH_EMBEDDING_TPM: "100000000",
  SEARCH_EMBEDDING_DAILY_TOKENS: "100000000",
  SEARCH_EMBEDDING_WORKSPACE_DAILY_TOKENS: "100000000",
  BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
  BETTER_AUTH_URL: "http://127.0.0.1",
  CLIENT_URL: "http://127.0.0.1",
  ZILOBASE_BOOTSTRAP_TOKEN: randomUUID(),
};
const checks = [];
let runtime;
let workspace;
const jar = new CookieJar();
const content = (text) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const query = (text, values = []) => fixture.client.query(text, values);
async function check(name, work) {
  if (
    process.env.ZILOBASE_SEARCH_BROWSER_ONLY === "true" &&
    ![
      "authenticated fresh-schema bootstrap",
      "workspace opt-in backfills existing pages and semantic discovery",
      "body edits and title changes replace complete generations",
      "browser search and settings",
    ].includes(name)
  )
    return;
  const start = Date.now();
  try {
    await work();
    checks.push({ name, status: "passed", durationMs: Date.now() - start });
    console.info(`PASS [${kind}] ${name}`);
  } catch (error) {
    checks.push({
      name,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
async function until(read, ready, timeout = 30000) {
  const end = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (ready(value)) return value;
    await sleep(100);
  } while (Date.now() < end);
  throw new Error(`Search fixture timed out: ${JSON.stringify(value)}`);
}
async function request(path, method = "GET", body?, expected = 200) {
  const response = await fetch(`${runtime.origin}${path}`, {
    method,
    headers: {
      cookie: jar.header(),
      origin: runtime.origin,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(value)}`);
  return value;
}
const state = async (page) =>
  (
    await query(
      "select i.*,s.index_epoch as current_epoch from page_search_index i join workspace_search_settings s on s.workspace_id=i.workspace_id where i.workspace_id=$1 and i.page_id=$2",
      [workspace, page],
    )
  ).rows[0];
async function ready(page) {
  await runtime.maintenance();
  return until(
    async () => {
      await runtime.maintenance();
      return state(page);
    },
    (s) =>
      s?.status === "ready" &&
      s.indexed_revision === s.requested_revision &&
      s.index_epoch === s.current_epoch,
  );
}
async function createPage(name, text) {
  const result = await request(
    "/pages",
    "POST",
    { workspaceId: workspace, name, content: content(text) },
    201,
  );
  return result.page?.id ?? result.id;
}
let space, sea;
try {
  await fixture.client.connect();
  assert.equal(
    (
      await query(
        "select count(*)::int n from information_schema.tables where table_schema='public'",
      )
    ).rows[0].n,
    0,
  );
  await runMigrationSets(fixture.db, [CORE_MIGRATION_SET]);
  runtime = await startSearchRuntime(kind, env, provider.origin);
  await check("authenticated fresh-schema bootstrap", async () => {
    const api = createApiClient({ internalOrigin: runtime.origin });
    const email = "search@example.test",
      password = randomUUID() + "Aa1!";
    await api.bootstrapInstance({
      bootstrapToken: env.ZILOBASE_BOOTSTRAP_TOKEN,
      email,
      password,
      name: "Search fixture",
      workspaceName: "Search",
    });
    await api.signIn({ email, password, jar });
    workspace = (await query("select id from workspace limit 1")).rows[0].id;
  });
  await check("structured search controls and verification across HTTP", async () =>
    checkControlsHttp({ request, query, workspace }),
  );
  await check("workspace opt-in backfills existing pages and semantic discovery", async () => {
    space = await createPage(
      "Flight notes",
      "A satellite circles a distant planet in a stable orbit.",
    );
    sea = await createPage("Diving notes", "Coral and marine animals thrive in the deep ocean.");
    await request(`/workspaces/${workspace}/search/settings`, "PATCH", { enabled: true });
    await ready(space);
    await ready(sea);
    const result = await request(
      `/search?workspaceId=${workspace}&mode=semantic&q=celestial%20exploration`,
    );
    assert.equal(result.metadata.mode, "semantic");
    assert.equal(result.results[0].id, space);
    assert.ok(result.results[0].match.chunkId);
    const parity = {
      topTitle: result.results[0].title,
      chunks: (
        await query(
          "select p.name,c.chunk_kind,c.chunk_index,c.embedding_input_hash,c.content_markdown,c.metadata,c.embedding::text as vector from search_chunk c join page p on p.id=c.page_id where c.workspace_id=$1 and c.is_active order by p.name,c.chunk_kind,c.chunk_index",
          [workspace],
        )
      ).rows.map(({ vector, ...row }) => ({
        ...row,
        vectorHash: createHash("sha256").update(vector).digest("hex"),
      })),
    };
    await mkdir(".test-results/search", { recursive: true });
    await writeFile(`.test-results/search/${kind}-parity.json`, JSON.stringify(parity, null, 2));
    try {
      const other = JSON.parse(
        await readFile(
          `.test-results/search/${kind === "node" ? "worker" : "node"}-parity.json`,
          "utf8",
        ),
      );
      assert.deepEqual(parity, other);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const calls = provider.state.calls;
    await request(`/search?workspaceId=${workspace}&mode=keyword&q=Flight`);
    assert.equal(provider.state.calls, calls);
  });
  await check(
    "page completions drain a bounded backfill without repeated maintenance",
    async () => {
      const ids = Array.from({ length: 12 }, () => randomUUID());
      await runtime.pause();
      await query(
        "insert into page(id,workspace_id,name,content,created_at,updated_at) select id,$1,'Pipeline '||n,$3::jsonb,now(),now() from unnest($2::text[]) with ordinality as pages(id,n)",
        [workspace, ids, JSON.stringify(content("Pipeline scheduling fixture."))],
      );
      await query("update page_search_index set not_before=now() where page_id=any($1::text[])", [
        ids,
      ]);
      // One initial kick; no maintenance calls while the consumers drain all 12.
      await runtime.maintenance();
      const admitted = await query(
        "select count(*)::int n from page_search_index where page_id=any($1::text[]) and pending_task_id is not null",
        [ids],
      );
      assert.equal(admitted.rows[0].n, 5);
      await runtime.resume();
      await until(
        async () => ({
          pages: (
            await query(
              "select status,last_error_code,count(*)::int n from page_search_index where page_id=any($1::text[]) group by status,last_error_code",
              [ids],
            )
          ).rows,
          dispatch: (
            await query(
              "select status,error_code,count(*)::int n,min(available_at) first_due,min(next_publication_at) first_publication from background_dispatch where resource_id=any($1::text[]) group by status,error_code",
              [ids],
            )
          ).rows,
        }),
        (value) => value.pages.some((row) => row.status === "ready" && row.n === ids.length),
        45000,
      );
    },
  );
  await check("body edits and title changes replace complete generations", async () => {
    const first = await state(space);
    await runtime.pause();
    await request(`/pages/${space}/content`, "PATCH", {
      content: content("A submarine explores aquatic habitats in the sea."),
    });
    await until(
      () => state(space),
      (s) => s.requested_revision !== first.requested_revision,
    );
    const stale = await request(
      `/search?workspaceId=${workspace}&mode=semantic&q=celestial%20exploration`,
    );
    assert.ok(stale.results.every((r) => r.id !== space || !r.match));
    await runtime.resume();
    await ready(space);
    assert.notEqual((await state(space)).active_generation_id, first.active_generation_id);
    await request(`/pages/${space}`, "PATCH", { name: "Underwater expedition" });
    await ready(space);
    const found = await request(
      `/search?workspaceId=${workspace}&mode=semantic&q=aquatic%20research`,
    );
    assert.ok(found.results.some((r) => r.id === space && r.title === "Underwater expedition"));
  });
  await check("duplicate broker delivery preserves one active generation", async () => {
    const current = await state(space);
    const task = (
      await query(
        "select task from background_dispatch where resource_id=$1 and kind='search.page_index' order by created_at desc limit 1",
        [space],
      )
    ).rows[0].task;
    await runtime.deliver(task);
    await runtime.deliver(task);
    await sleep(250);
    assert.equal((await state(space)).active_generation_id, current.active_generation_id);
    assert.equal(
      (
        await query(
          "select count(distinct generation_id)::int n from search_chunk where workspace_id=$1 and page_id=$2 and is_active",
          [workspace, space],
        )
      ).rows[0].n,
      1,
    );
  });
  await check("page deletion and restore obey live eligibility", async () => {
    await request(`/pages/${space}`, "DELETE");
    let result = await request(
      `/search?workspaceId=${workspace}&mode=semantic&q=aquatic%20research`,
    );
    assert.ok(result.results.every((r) => r.id !== space));
    await request(`/pages/${space}/restore`, "POST");
    await ready(space);
    result = await request(`/search?workspaceId=${workspace}&mode=semantic&q=aquatic%20research`);
    assert.ok(result.results.some((r) => r.id === space));
  });
  await check(
    "stored property updates, option labels and source removal flow through queues",
    async () => {
      const command = async (path, command) =>
        (
          await request(
            path,
            "POST",
            { protocolVersion: 2, commandId: randomUUID(), command },
            path === "/databases/commands" ? 201 : 200,
          )
        ).result;
      const created = await command("/databases/commands", {
        type: "database.create",
        workspaceId: workspace,
        name: "Ledger",
        standalone: true,
      });
      const host = created.database.id,
        source = created.activeDataSource.id,
        path = `/databases/${host}/data-sources/${source}/commands`;
      const column = await command(path, {
        type: "property.create",
        name: "Category",
        propertyType: "select",
        config: { options: [{ id: "invoice", name: "Invoice", color: "blue" }] },
        afterPropertyId: null,
        beforePropertyId: null,
      });
      const columnId = column.id,
        definitionId = column.property.id;
      const record = await command(path, {
        type: "row.place",
        title: "Entry",
        afterRowId: null,
        beforeRowId: null,
        parentRowId: null,
        valuesByPropertyId: { [definitionId]: "Invoice" },
      });
      await ready(record.pageId);
      const found = await request(
        `/search?workspaceId=${workspace}&mode=semantic&q=receipt%20reconciliation`,
      );
      const match = found.results.find((r) => r.id === record.pageId);
      assert.equal(match.match.kind, "property");
      assert.equal(match.match.propertyId, definitionId);
      assert.equal(match.match.recordId, record.id);
      // Exercise the stored-ID representation too: option label changes must
      // resolve the ID against the current definition instead of embedding it.
      await request(`/pages/${record.pageId}/properties/${definitionId}/value`, "PUT", {
        value: "invoice",
      });
      await ready(record.pageId);
      const revision = (await state(record.pageId)).requested_revision;
      await command(path, {
        type: "property.update",
        propertyId: columnId,
        patch: {
          name: "Transaction class",
          configuration: [
            {
              operation: "set",
              path: ["options"],
              value: [{ id: "invoice", name: "Payment", color: "blue" }],
            },
          ],
        },
      });
      await until(
        async () => {
          await runtime.maintenance();
          return state(record.pageId);
        },
        (s) => s.requested_revision !== revision,
      );
      await ready(record.pageId);
      const chunks = async () =>
        (
          await query(
            "select content_markdown,metadata from search_chunk where workspace_id=$1 and page_id=$2 and chunk_kind='property' and is_active",
            [workspace, record.pageId],
          )
        ).rows;
      assert.ok((await chunks())[0].content_markdown.includes("Transaction class"));
      assert.ok((await chunks())[0].content_markdown.includes("Payment"));
      assert.ok(!(await chunks())[0].content_markdown.includes("Invoice"));
      await request(`/pages/${record.pageId}/properties/${definitionId}/value`, "PUT", {
        value: null,
      });
      await ready(record.pageId);
      assert.equal((await chunks()).length, 0);
      await request(`/pages/${record.pageId}/properties/${definitionId}/value`, "PUT", {
        value: "invoice",
      });
      await ready(record.pageId);
      assert.equal((await chunks()).length, 1);
      await command(path, { type: "row.archive", rowId: record.id });
      const removed = await request(
        `/search?workspaceId=${workspace}&mode=semantic&q=receipt%20reconciliation`,
      );
      assert.ok(
        removed.results.every((r) => r.id !== record.pageId || r.match?.kind !== "property"),
      );
    },
  );

  await check(
    "provider delay reports semantic unavailability within the interactive budget",
    async () => {
      provider.state.delayMs = 4000;
      const start = Date.now();
      const result = await request(`/search?workspaceId=${workspace}&mode=semantic&q=Underwater`);
      provider.state.delayMs = 0;
      assert.equal(result.metadata.mode, "semantic");
      assert.equal(result.metadata.degradationReason, "provider_timeout");
      assert.ok(Date.now() - start < 2500);
      assert.deepEqual(result.results, []);
    },
  );
  if (kind === "node") {
    await check("worker SIGKILL during provider resumes from durable state", async () => {
      provider.state.holdAt = provider.state.calls + 1;
      const page = await createPage("Crash scenario", "An astronaut studies celestial bodies.");
      await runtime.maintenance();
      await until(
        async () => {
          await runtime.maintenance();
          return provider.state.held;
        },
        (n) => n === provider.state.holdAt,
      );
      const before = await state(page);
      assert.equal(before.status, "running");
      await runtime.crash();
      provider.release();
      await query(
        "update page_search_index set lease_expires_at=now()-interval '1 second' where workspace_id=$1 and page_id=$2",
        [workspace, page],
      );
      await runtime.maintenance();
      await runtime.resume();
      await ready(page);
      assert.ok(Number((await state(page)).lease_fence) > Number(before.lease_fence));
    });
    await check("worker SIGKILL after checkpoint reuses staged embeddings", async () => {
      await runtime.pause();
      provider.state.holdAt = provider.state.calls + 2;
      const page = await createPage(
        "Checkpoint scenario",
        "Satellite orbit observations. ".repeat(4000),
      );
      await runtime.maintenance();
      await runtime.resume();
      await until(
        async () => {
          await runtime.maintenance();
          return provider.state.held;
        },
        (n) => n === provider.state.holdAt,
      );
      const partial = await state(page);
      assert.equal(partial.completed_chunk_count, 16);
      assert.equal(partial.indexed_revision, "0");
      const generation = partial.staged_generation_id;
      await runtime.crash();
      provider.release();
      await query(
        "update page_search_index set lease_expires_at=now()-interval '1 second' where workspace_id=$1 and page_id=$2",
        [workspace, page],
      );
      await runtime.maintenance();
      await runtime.resume();
      await ready(page);
      assert.equal((await state(page)).active_generation_id, generation);
    });
    await check("broker outage preserves dirty state and recovery republishes", async () => {
      await runtime.pause();
      await runtime.setQueueAvailable(false);
      let page;
      try {
        page = await createPage(
          "Broker recovery",
          "An invoice records payment and billing details.",
        );
        assert.ok((await state(page)).requested_revision > 0);
      } finally {
        await runtime.setQueueAvailable(true);
      }
      await sleep(1500);
      await runtime.resume();
      await ready(page);
    });
  }
  if (kind === "node") {
    await check("API restart retains sessions and vectors", async () => {
      await runtime.close();
      runtime = await startSearchRuntime(kind, env, provider.origin);
      const result = await request(
        `/search?workspaceId=${workspace}&mode=semantic&q=aquatic%20research`,
      );
      assert.ok(result.results.some((r) => r.id === space));
    });
    await check("database and broker restart retain durable generations", async () => {
      const database = process.env.ZILOBASE_DATABASE_VERIFY_CONTAINER!,
        broker = process.env.ZILOBASE_QUEUE_VERIFY_CONTAINER!;
      assert.ok(database.startsWith("zilobase-background-test-"));
      assert.equal(broker, `${database}-queue`);
      await runtime.pause();
      const generation = (await state(space)).active_generation_id;
      await fixture.client.end();
      await promisify(execFile)("docker", ["restart", database]);
      await until(
        async () => {
          try {
            await promisify(execFile)("docker", ["exec", database, "pg_isready", "-U", "postgres"]);
            return true;
          } catch {
            return false;
          }
        },
        (x) => x,
      );
      fixture = createDbClientForUrl(url);
      await fixture.client.connect();
      assert.equal((await state(space)).active_generation_id, generation);
      await promisify(execFile)("docker", ["restart", broker]);
      await sleep(1500);
      await runtime.resume();
      await ready(space);
      assert.equal((await state(space)).active_generation_id, generation);
    });
  }
  if (kind === "worker")
    await check("Worker interruption preserves checkpoint and cron resumes staging", async () => {
      provider.state.holdAt = provider.state.calls + 2;
      const page = await createPage(
        "Worker checkpoint",
        "Satellite orbit observations. ".repeat(4000),
      );
      await until(
        async () => {
          await runtime.maintenance();
          return provider.state.held;
        },
        (n) => n === provider.state.holdAt,
      );
      const partial = await state(page);
      assert.equal(partial.completed_chunk_count, 16);
      assert.equal(partial.indexed_revision, "0");
      await runtime.interrupt();
      provider.release();
      await query(
        "update page_search_index set lease_expires_at=now()-interval '1 second' where workspace_id=$1 and page_id=$2",
        [workspace, page],
      );
      await ready(page);
      assert.equal((await state(page)).active_generation_id, partial.staged_generation_id);
    });
  await check("disablement fences an in-flight provider call and cleanup", async () => {
    provider.state.holdAt = provider.state.calls + 1;
    const page = await createPage("Disable scenario", "Astronaut mission orbit.");
    await runtime.maintenance();
    await until(
      async () => {
        await runtime.maintenance();
        return provider.state.held;
      },
      (n) => n === provider.state.holdAt,
    );
    await request(`/workspaces/${workspace}/search/settings`, "PATCH", { enabled: false });
    provider.release();
    await sleep(300);
    assert.ok(
      (
        await query(
          "select count(*)::int n from search_chunk c join workspace_search_settings s on s.workspace_id=c.workspace_id where c.workspace_id=$1 and c.index_epoch=s.index_epoch and c.is_active",
          [workspace],
        )
      ).rows[0].n === 0,
    );
    const calls = provider.state.calls;
    const result = await request(`/search?workspaceId=${workspace}&mode=semantic&q=Underwater`);
    assert.equal(result.metadata.mode, "semantic");
    assert.equal(provider.state.calls, calls);
    assert.deepEqual(result.results, []);
    await runtime.maintenance();
    assert.equal(
      (await query("select count(*)::int n from search_chunk where workspace_id=$1", [workspace]))
        .rows[0].n,
      0,
    );
  });
  await check("disable then re-enable reconstructs current page contents", async () => {
    await request(`/workspaces/${workspace}/search/settings`, "PATCH", { enabled: true });
    await ready(space);
    assert.ok((await state(space)).active_generation_id);
  });
  if (process.env.ZILOBASE_SEARCH_BROWSER === "true")
    await check("browser search and settings", async () => {
      const { runSearchBrowser } = await import("./browser.mts");
      await runSearchBrowser({
        runtime,
        env,
        jar,
        workspace,
        pageId: space,
        backgroundPageId: sea,
        ready,
      });
    });
  if (kind === "node")
    await check("backup and restore preserve vectors and HNSW partitions", async () => {
      await runtime.pause();
      const database = process.env.ZILOBASE_DATABASE_VERIFY_CONTAINER!;
      assert.ok(database.startsWith("zilobase-background-test-"));
      const count = (
        await query("select count(*)::int n from search_chunk where embedding is not null")
      ).rows[0].n;
      assert.ok(count > 0);
      const dump = spawnSync(
        "docker",
        ["exec", database, "pg_dump", "-U", "postgres", "-Fc", "zilobase_background_verify"],
        { maxBuffer: 64 * 1024 * 1024 },
      );
      assert.equal(dump.status, 0, dump.stderr?.toString());
      await promisify(execFile)("docker", [
        "exec",
        database,
        "createdb",
        "-U",
        "postgres",
        "zilobase_search_restore_verify",
      ]);
      const restored = spawnSync(
        "docker",
        [
          "exec",
          "-i",
          database,
          "pg_restore",
          "-U",
          "postgres",
          "--exit-on-error",
          "-d",
          "zilobase_search_restore_verify",
        ],
        { input: dump.stdout, maxBuffer: 64 * 1024 * 1024 },
      );
      assert.equal(restored.status, 0, restored.stderr?.toString());
      const copyUrl = new URL(url);
      copyUrl.pathname = "/zilobase_search_restore_verify";
      const copy = createDbClientForUrl(copyUrl.href);
      try {
        await copy.client.connect();
        assert.equal(
          (
            await copy.client.query(
              "select count(*)::int n from search_chunk where embedding is not null and vector_dims(embedding)=1536",
            )
          ).rows[0].n,
          count,
        );
        assert.equal(
          (
            await copy.client.query(
              "select count(*)::int n from pg_indexes where indexname ~ '^search_chunk_p[0-9]+_embedding_idx$'",
            )
          ).rows[0].n,
          32,
        );
      } finally {
        await copy.client.end();
      }
      await runtime.resume();
    });
  console.info(`Search ${kind} acceptance passed (${checks.length} scenarios).`);
} finally {
  provider.release();
  await runtime?.close();
  await provider.close();
  await fixture.client.end();
  await createDbClient({ DATABASE_URL: url }).client.end();
  await mkdir(".test-results/search", { recursive: true });
  await writeFile(
    `.test-results/search/${kind}${process.env.ZILOBASE_SEARCH_BROWSER_ONLY === "true" ? "-browser" : ""}-acceptance.json`,
    JSON.stringify({ runtime: kind, checks, providerCalls: provider.state.calls }, null, 2),
  );
}
