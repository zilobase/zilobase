import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { config } from "@dotenvx/dotenvx";
import { db, runWithDbEnv, createDbClient } from "../../apps/server/src/infrastructure/database";
import { chunkPageMarkdown } from "../../apps/server/src/services/search/chunking";
import { chunkStoredProperties } from "../../apps/server/src/services/search/property-chunks";
import {
  embedSearchDocuments,
  embedSearchQuery,
  SearchBudgetDeferred,
  searchQuotaScope,
} from "../../apps/server/src/services/search/embedding-usage";
import {
  createGeminiEmbeddingProvider,
  SearchEmbeddingError,
} from "../../apps/server/src/services/search/gemini";
import {
  queryEmbeddingInput,
  SEARCH_PROFILE,
} from "../../apps/server/src/services/search/vector-contracts";
import { semanticSearchWorkspace } from "../../apps/server/src/services/search/retrieval";
import { searchWorkspaceItems } from "../../apps/server/src/services/search/workspace-search";
const credentials = {};
config({
  path: process.env.ZILOBASE_SEARCH_ENV_FILE ?? ".env.development",
  processEnv: credentials,
  quiet: true,
  noOps: true,
  overload: true,
});
const url = process.env.ZILOBASE_SEARCH_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (
  !url ||
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
  !new URL(url).pathname.includes("search")
)
  throw new Error("Use an isolated loopback search evaluation database");
if (!credentials.GEMINI_API_KEY && !process.env.GEMINI_API_KEY)
  throw new Error("Configure explicit test Gemini credentials");
const corpus = JSON.parse(
  await readFile(new URL("./relevance-corpus.json", import.meta.url), "utf8"),
);
assert.ok(
  corpus.documents.length <= 64 && corpus.queries.length <= 100,
  "Bounded live-provider evaluation only",
);
const w = randomUUID(),
  u = randomUUID(),
  host = randomUUID(),
  source = randomUUID();
const env = {
  DATABASE_URL: url,
  SEARCH_EMBEDDINGS_ENABLED: "true",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? credentials.GEMINI_API_KEY,
  ZILOBASE_CELL_ID: `search-evaluation-${w}`,
};
// Offline ranking evaluation allows the document HTTP budget for query prefill.
// The app still enforces its normal 1.8-second query / 2.5-second request budgets.
const baseProvider = createGeminiEmbeddingProvider(env.GEMINI_API_KEY);
const evaluationProvider = {
  ...baseProvider,
  embedQuery: (query, purpose, signal) =>
    baseProvider.embedDocuments([queryEmbeddingInput(query, purpose)], signal),
};
const output = {
  model: SEARCH_PROFILE.model,
  dimensions: 1536,
  queryPrefillTimeoutMs: 20000,
  corpusVersion: corpus.version,
  review: corpus.review,
  documents: corpus.documents.length,
  queries: [],
  metrics: {},
  usage: [],
  passed: false,
};
async function providerCall(work) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof SearchBudgetDeferred) {
        const delay = Math.max(1, Date.parse(error.availableAt) - Date.now() + 50);
        console.info(`Evaluation capacity wait ${Math.ceil(delay / 1000)}s`);
        await sleep(delay);
        continue;
      }
      if (error instanceof SearchEmbeddingError && error.retryable && attempt < 2) {
        await sleep(error.retryAfterMs ?? 2000);
        continue;
      }
      throw error;
    }
  }
}
try {
  await runWithDbEnv(env, async () => {
    await db.execute(
      sql`insert into workspace(id,name,slug) values(${w},'Synthetic search evaluation',${w})`,
    );
    await db.execute(
      sql`insert into "user"(id,name,email) values(${u},'Evaluation',${u + "@example.test"})`,
    );
    await db.execute(
      sql`insert into member(id,workspace_id,user_id) values(${randomUUID()},${w},${u})`,
    );
    await db.execute(
      sql`insert into workspace_search_settings(workspace_id,cell_id,enabled,profile_id,backfill_completed_at) values(${w},${env.ZILOBASE_CELL_ID},false,${SEARCH_PROFILE.id},now())`,
    );
    await db.execute(
      sql`insert into database(id,workspace_id,name,created_by_id,created_at,updated_at) values(${host},${w},'Evaluation records',${u},now(),now())`,
    );
    await db.execute(
      sql`insert into data_source(id,workspace_id,parent_database_id,name) values(${source},${w},${host},'Records')`,
    );
    const chunks = [];
    for (const doc of corpus.documents) {
      const page = `${w}-${doc.id}`,
        generation = randomUUID();
      const content = {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: doc.markdown }] }],
      };
      await db.execute(
        sql`insert into page(id,workspace_id,name,content,created_by_id,created_at,updated_at) values(${page},${w},${doc.title},${JSON.stringify(content)},${u},now(),now())`,
      );
      const prepared = chunkPageMarkdown(doc.title, content);
      if (doc.property) {
        const id = randomUUID();
        await db.execute(
          sql`insert into database_row(id,page_id,data_source_id,order_key,created_at,updated_at) values(${randomUUID()},${page},${source},${corpus.documents.indexOf(doc) + 1},now(),now())`,
        );
        await db.execute(
          sql`insert into page_property(id,workspace_id,name,type,created_at,updated_at) values(${id},${w},${doc.property.name},${doc.property.type},now(),now())`,
        );
        await db.execute(
          sql`insert into database_property(id,data_source_id,property_id,created_at,updated_at) values(${randomUUID()},${source},${id},now(),now())`,
        );
        await db.execute(
          sql`insert into page_property_value(id,page_id,property_id,value,created_at,updated_at) values(${randomUUID()},${page},${id},${JSON.stringify(doc.property.value)}::jsonb,now(),now())`,
        );
        prepared.push(
          ...chunkStoredProperties(doc.title, [
            { id, ...doc.property, config: null, definitionRevision: "1", valueRevision: "1" },
          ]),
        );
      }
      await db.execute(
        sql`insert into page_search_index(workspace_id,page_id,profile_id,index_epoch,requested_revision,indexed_revision,status,active_generation_id) values(${w},${page},${SEARCH_PROFILE.id},1,1,1,'ready',${generation}::uuid)`,
      );
      chunks.push(...prepared.map((chunk) => ({ page, generation, chunk })));
    }
    console.info(
      `Embedding ${chunks.length} independent document chunks for ${corpus.documents.length} synthetic pages.`,
    );
    for (let at = 0; at < chunks.length; at += 16) {
      const batch = chunks.slice(at, at + 16);
      const result = await providerCall(() =>
        embedSearchDocuments(
          env,
          w,
          batch.map((x) => x.chunk.input),
        ),
      );
      for (const [index, item] of batch.entries()) {
        const c = item.chunk;
        await db.execute(
          sql`insert into search_chunk(workspace_id,page_id,profile_id,index_epoch,generation_id,source_revision,chunk_kind,source_key,chunk_index,content_markdown,embedding_input_hash,embedding,is_active,byte_count,metadata) values(${w},${item.page},${SEARCH_PROFILE.id},1,${item.generation}::uuid,1,${c.kind},${c.sourceKey},${c.index},${c.markdown},${c.inputHash},${JSON.stringify(result.embeddings[index])}::vector,true,${c.byteCount},${JSON.stringify(c.metadata)}::jsonb)`,
        );
      }
    }
    await db.execute(
      sql`update workspace_search_settings set enabled=true where workspace_id=${w}`,
    );
    for (const [index, q] of corpus.queries.entries()) {
      const started = Date.now();
      await providerCall(() =>
        embedSearchQuery(
          env,
          { workspaceId: w, userId: u, query: q.text, purpose: "search" },
          evaluationProvider,
        ),
      );
      const embeddingMs = Date.now() - started;
      const input = {
        workspaceId: w,
        userId: u,
        query: q.text,
        membershipVerified: true,
        limit: 10,
      };
      const keyword = await searchWorkspaceItems(input);
      const semantic = await semanticSearchWorkspace(input, env);
      const ids = (list) => list.map((r) => r.id.replace(w + "-", ""));
      const expected = new Set(q.expected);
      const rank = (list) => list.findIndex((id) => expected.has(id)) + 1;
      const sr = rank(ids(semantic.results)),
        kr = rank(ids(keyword));
      output.queries.push({
        text: q.text,
        kind: q.kind,
        expected: q.expected,
        semanticRank: sr,
        keywordRank: kr,
        actualMode: semantic.metadata.mode,
        embeddingMs,
      });
      if (index % 10 === 0) console.info(`Evaluated ${index + 1}/${corpus.queries.length} queries`);
    }
    const semantic = output.queries.filter((q) => ["paraphrase", "property"].includes(q.kind)),
      paraphrase = semantic.filter((q) => q.kind === "paraphrase"),
      exact = output.queries.filter((q) => ["exact", "identifier"].includes(q.kind));
    const recall = (list, key) =>
      list.filter((q) => q[key] > 0 && q[key] <= 10).length / list.length;
    output.metrics = {
      semanticRecallAt10: recall(semantic, "semanticRank"),
      keywordParaphraseRecallAt10: recall(paraphrase, "keywordRank"),
      semanticParaphraseRecallAt10: recall(paraphrase, "semanticRank"),
      semanticExactTop1: exact.filter((q) => q.semanticRank === 1).length / exact.length,
      keywordExactTop1: exact.filter((q) => q.keywordRank === 1).length / exact.length,
    };
    output.metrics.paraphraseImprovement =
      output.metrics.semanticParaphraseRecallAt10 - output.metrics.keywordParaphraseRecallAt10;
    output.usage = (
      await db.execute(
        sql`select traffic_class,sum(requests)::int requests,sum(reserved_tokens)::text reserved_tokens,sum(reported_tokens)::text reported_tokens from search_embedding_usage_bucket where quota_scope=${searchQuotaScope(env)} and bucket_scope='deployment' and window_kind='minute' group by traffic_class`,
      )
    ).rows;
    output.passed =
      output.metrics.semanticRecallAt10 >= 0.9 &&
      output.metrics.paraphraseImprovement >= 0.15 &&
      output.metrics.keywordExactTop1 >= 0.95;
    console.info(
      JSON.stringify({ metrics: output.metrics, usage: output.usage, passed: output.passed }),
    );
    assert.ok(output.passed, "Live Gemini relevance gates failed; inspect the retained report");
  });
} finally {
  await mkdir(".test-results/search", { recursive: true });
  await writeFile(".test-results/search/live-relevance.json", JSON.stringify(output, null, 2));
  await runWithDbEnv(env, async () => {
    await db.execute(sql`delete from workspace where id=${w}`);
    await db.execute(sql`delete from "user" where id=${u}`);
    await db.execute(
      sql`delete from search_embedding_usage_bucket where quota_scope=${searchQuotaScope(env)}`,
    );
  });
  await createDbClient(env).client.end();
}
