import { searchCounter, searchHistogram } from "./metrics";
import {
  annSearchCandidates,
  searchEligibleChunkCount,
  SEARCH_EXACT_THRESHOLD,
  SEARCH_ANN_CANDIDATE_LIMIT,
} from "./ann";
import { sql } from "drizzle-orm";
import { db, runWithDb, type Database } from "../../infrastructure/database";
import { getBackgroundCellId } from "../../infrastructure/background/contracts";
import type { RuntimeEnv } from "../../shared/config/config";
import {
  authorizedSearchChunks,
  withSearchRead,
  authorizedSearchIdentities,
  freshSearchChunk,
  searchVectorAccessCtes,
  liveSearchChunkAllowed,
  readAuthorizedSearchChunks,
} from "./eligibility";
import { embedSearchQuery, SearchBudgetDeferred } from "./embedding-usage";
import { SearchEmbeddingError, validateSearchVector } from "./gemini";
import {
  SEARCH_PROFILE,
  type SearchEmbeddingProvider,
  type SearchPurpose,
} from "./vector-contracts";
import type { WorkspaceSearchInput, WorkspaceSearchResult } from "./workspace-search";

export type { SearchMetadata } from "@zilobase/features/search";
import type { SearchMetadata } from "@zilobase/features/search";
export type VectorCandidate = { id: string; page_id: string; distance: number };

export async function exactSearchCandidates(
  workspaceId: string,
  userId: string,
  vector: number[],
  limit = 2000,
): Promise<VectorCandidate[]> {
  const value = JSON.stringify(validateSearchVector(vector));
  return (
    await db.execute<VectorCandidate>(
      sql`${searchVectorAccessCtes(workspaceId, userId)}, exact_search_chunks as materialized(select c.id,c.page_id,c.embedding from search_chunk c where ${freshSearchChunk(workspaceId)} and ${liveSearchChunkAllowed(workspaceId)}) select id,page_id,distance from (select distinct on(page_id) id,page_id,(embedding <=> ${value}::vector) as distance from exact_search_chunks order by page_id,embedding <=> ${value}::vector,id) best_chunks order by distance,page_id,id limit ${limit}`,
    )
  ).rows;
}

function plainExcerpt(markdown: string) {
  return markdown
    .replace(/<[^>]*>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

export async function hydrateVectorResults(
  workspaceId: string,
  userId: string,
  candidates: readonly VectorCandidate[],
): Promise<WorkspaceSearchResult[]> {
  const chunks = await readAuthorizedSearchChunks(
    workspaceId,
    userId,
    candidates.map((c) => c.id),
  );
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const results: WorkspaceSearchResult[] = [];
  for (const candidate of candidates) {
    const c = byId.get(candidate.id);
    if (!c || seen.has(c.page_id)) continue;
    seen.add(c.page_id);
    const updatedAt = new Date(c.updated_at);
    const emoji = typeof c.page_metadata?.emoji === "string" ? c.page_metadata.emoji : null;
    results.push({
      id: c.page_id,
      type: "page",
      title: c.name,
      path: c.name,
      emoji,
      updatedAt,
      excerpt: plainExcerpt(c.content_markdown),
      entity: {
        id: c.page_id,
        name: c.name,
        workspaceId,
        metadata: c.page_metadata,
        updatedAt,
        deletedAt: null,
      },
      match: {
        chunkId: c.id,
        pageId: c.page_id,
        kind: c.chunk_kind,
        headingPath: c.metadata.headingPath ?? [],
        ...(c.metadata.blockId ? { blockId: c.metadata.blockId } : {}),
        ...(c.metadata.blockIndex !== undefined ? { blockIndex: c.metadata.blockIndex } : {}),
        ...(c.metadata.propertyId && c.database_id && c.data_source_id
          ? {
              propertyId: c.metadata.propertyId,
              databaseId: c.database_id,
              dataSourceId: c.data_source_id,
              ...(c.record_id ? { recordId: c.record_id } : {}),
            }
          : {}),
      },
    });
  }
  return results;
}

async function recheckResults(input: WorkspaceSearchInput, results: WorkspaceSearchResult[]) {
  if (!results.length) return [];
  return withSearchRead(() => recheckSearchRead(input, results));
}
async function recheckSearchRead(input: WorkspaceSearchInput, results: WorkspaceSearchResult[]) {
  const allowed = await authorizedSearchIdentities(
    input.workspaceId,
    input.userId,
    results.filter((r) => r.type === "page").map((r) => r.id),
    results.flatMap((r) =>
      r.type === "database"
        ? [r.id, ...(r.titleSource ? [r.titleSource.parentDatabaseId] : [])]
        : [],
    ),
  );
  const matches = await authorizedSearchChunks(
    input.workspaceId,
    input.userId,
    results.flatMap((r) => (r.match ? [r.match.chunkId] : [])),
  );
  return results.flatMap((r) => {
    if (!(r.type === "page" ? allowed.pages.has(r.id) : allowed.databases.has(r.id))) return [];
    if (r.match && !matches.has(r.match.chunkId)) return [];
    if (r.titleSource && !allowed.databases.has(r.titleSource.parentDatabaseId))
      return [{ ...r, title: (r.entity as { name: string }).name, titleSource: null, emoji: null }];
    return [r];
  });
}

export async function semanticSearchWorkspace(
  input: WorkspaceSearchInput,
  env: RuntimeEnv,
  options: { purpose?: SearchPurpose; provider?: SearchEmbeddingProvider } = {},
) {
  const started = Date.now();
  let metadata: SearchMetadata = {
    mode: "semantic",
    indexAvailability: "disabled",
    degradationReason: "configuration",
  };
  const finish = (results: WorkspaceSearchResult[]) => {
    searchCounter(env, "retrieval", metadata.degradationReason ?? metadata.mode);
    searchHistogram(env, "request_ms", metadata.mode, Date.now() - started);
    return { results, metadata };
  };
  const unavailable = () => finish([]);
  if (env.SEARCH_EMBEDDINGS_ENABLED !== "true" || (!options.provider && !env.GEMINI_API_KEY))
    return unavailable();
  const settings = (
    await withSearchRead(
      async () =>
        await db.execute<{ enabled: boolean; ready: boolean }>(
          sql`select s.enabled,exists(select 1 from search_chunk c where ${freshSearchChunk(input.workspaceId)} limit 1) as ready from workspace_search_settings s where s.workspace_id=${input.workspaceId} and s.cell_id=${getBackgroundCellId(env)} and s.profile_id=${SEARCH_PROFILE.id}`,
        ),
    )
  ).rows[0];
  if (!settings?.enabled) {
    metadata = { ...metadata, degradationReason: "workspace_disabled" };
    return unavailable();
  }
  if (!settings.ready) {
    metadata = { ...metadata, indexAvailability: "building", degradationReason: "index_building" };
    return unavailable();
  }
  metadata = { mode: "semantic", indexAvailability: "ready" };
  if (!/[\p{L}\p{N}]/u.test(input.query) || (input.types && !input.types.includes("page"))) {
    metadata.degradationReason = "query_empty";
    return unavailable();
  }
  const cancellation = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          cancellation.abort();
          reject(new SearchEmbeddingError("SEARCH_QUERY_TIMEOUT", true));
        },
        Math.max(1, Math.min(1800, 2500 - (Date.now() - started))),
      );
    });
    const vector = await Promise.race([
      embedSearchQuery(
        env,
        {
          workspaceId: input.workspaceId,
          userId: input.userId,
          query: input.query,
          purpose: options.purpose ?? "search",
          signal: cancellation.signal,
        },
        options.provider,
      ),
      timeout,
    ]);
    clearTimeout(timer);
    if (Date.now() - started > 2200) {
      metadata.degradationReason = "retrieval_budget";
      return unavailable();
    }
    const databaseStarted = Date.now();
    const vectorResults = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('statement_timeout',${String(Math.max(1, 2200 - (Date.now() - started)))},true),set_config('jit','off',true)`,
      );
      // Database context remains this transaction for bounded retrieval and access checks.
      return runWithDb(tx as unknown as Database, async () => {
        const count = await searchEligibleChunkCount(input.workspaceId, input.userId);
        if (count <= SEARCH_EXACT_THRESHOLD)
          return hydrateVectorResults(
            input.workspaceId,
            input.userId,
            await exactSearchCandidates(input.workspaceId, input.userId, vector),
          );
        // Fetch one bounded pool: repeating the workspace ACL CTE for each
        // window exhausted the interactive budget at one million chunks.
        const remaining = 2200 - (Date.now() - started);
        if (remaining < 100) {
          metadata.degradationReason = "retrieval_budget";
          return [];
        }
        await db.execute(sql`select set_config('statement_timeout',${String(remaining)},true)`);
        const candidates = await annSearchCandidates(
          input.workspaceId,
          input.userId,
          vector,
          SEARCH_ANN_CANDIDATE_LIMIT,
        );
        searchCounter(env, "refill", "query");
        return hydrateVectorResults(input.workspaceId, input.userId, candidates);
      });
    });
    searchHistogram(env, "database_ms", "completed", Date.now() - databaseStarted);
    const results = vectorResults.slice(0, input.limit ?? 50);
    metadata = {
      ...metadata,
      mode: "semantic",
      indexAvailability: "ready",
    };
    const checked = await recheckResults(input, results);
    searchCounter(env, "authorization_rejection", "query", results.length - checked.length);
    return finish(checked);
  } catch (error) {
    metadata = {
      mode: "semantic",
      indexAvailability: "ready",
      degradationReason:
        Date.now() - started >= 2100
          ? "retrieval_budget"
          : error instanceof SearchBudgetDeferred
            ? "capacity"
            : error instanceof SearchEmbeddingError &&
                ["SEARCH_QUERY_TIMEOUT", "SEARCH_PROVIDER_TIMEOUT"].includes(error.code)
              ? "provider_timeout"
              : "provider_unavailable",
    };
    return unavailable();
  } finally {
    clearTimeout(timer);
    cancellation.abort();
  }
}
