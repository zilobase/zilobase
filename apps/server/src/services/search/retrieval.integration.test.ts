import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, runWithDbEnv } from "../../infrastructure/database";
import { createBackgroundTask } from "../../infrastructure/background/contracts";
import { indexSearchPage } from "./indexing";
import { semanticSearchWorkspace, exactSearchCandidates } from "./retrieval";
import { searchWorkspaceItems } from "./workspace-search";
import { SEARCH_PROFILE } from "./vector-contracts";
import { fakeSearchProvider, fixtureEmbedding } from "./testing/fixtures";
import { SearchEmbeddingError } from "./gemini";

const url = process.env.ZILOBASE_SEARCH_TEST_DATABASE_URL;
describe.skipIf(!url)("authorized exact semantic search", () => {
  let w: string, u: string, other: string, auth: string, travel: string, hidden: string;
  const within = <T>(fn: () => Promise<T>) => runWithDbEnv({ DATABASE_URL: url }, fn);
  const env = () => ({
    SEARCH_EMBEDDINGS_ENABLED: "true",
    ZILOBASE_CELL_ID: "search-retrieval-test",
    SEARCH_EMBEDDING_QUOTA_SCOPE: w,
    SEARCH_EMBEDDING_RPM: "1000",
  });
  const provider = () =>
    fakeSearchProvider((text) => (/credential|authenticat|password/i.test(text) ? 0 : 1));
  const search = (
    q: string,
    options: Parameters<typeof semanticSearchWorkspace>[2] = { provider: provider() },
  ) =>
    semanticSearchWorkspace(
      { workspaceId: w, userId: u, query: q, membershipVerified: true, limit: 10 },
      env(),
      options,
    );
  beforeAll(() => {
    if (!["localhost", "127.0.0.1"].includes(new URL(url!).hostname))
      throw new Error("Isolated loopback database required");
  });
  beforeEach(async () =>
    within(async () => {
      w = randomUUID();
      u = randomUUID();
      other = randomUUID();
      auth = randomUUID();
      travel = randomUUID();
      hidden = randomUUID();
      await db.execute(sql`insert into workspace(id,name,slug) values(${w},'Retrieval test',${w})`);
      for (const id of [u, other])
        await db.execute(
          sql`insert into "user"(id,name,email) values(${id},'Test',${id + "@example.test"})`,
        );
      await db.execute(
        sql`insert into member(id,workspace_id,user_id) values(${randomUUID()},${w},${u})`,
      );
      await db.execute(
        sql`insert into workspace_search_settings(workspace_id,cell_id,enabled,profile_id,backfill_completed_at) values(${w},'search-retrieval-test',true,${SEARCH_PROFILE.id},now())`,
      );
      for (const [id, title, text, owner] of [
        [auth, "Access guide", "Credentials expire after an hour.", u],
        [travel, "Trip schedule", "The train leaves at noon.", u],
        [hidden, "Private authentication", "Private credential material", other],
      ]) {
        await db.execute(
          sql`insert into page(id,workspace_id,name,content,created_by_id,created_at,updated_at) values(${id},${w},${title},${JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })},${owner},now(),now())`,
        );
        const task = createBackgroundTask({
          env: env(),
          kind: "search.page_index",
          resourceId: id,
        });
        await db.execute(
          sql`update page_search_index set not_before=now(),pending_task_id=${task.taskId}::uuid where workspace_id=${w} and page_id=${id}`,
        );
        await indexSearchPage({ env: env(), task, workerId: "test" }, { provider: provider() });
      }
    }),
  );
  afterEach(async () =>
    within(async () => {
      await db.execute(sql`delete from workspace where id=${w}`);
      for (const id of [u, other]) await db.execute(sql`delete from "user" where id=${id}`);
      await db.execute(sql`delete from search_embedding_usage_bucket where quota_scope=${w}`);
    }),
  );
  it("finds a paraphrase, deduplicates pages and returns authorized plain-text provenance", async () =>
    within(async () => {
      const keyword = await searchWorkspaceItems({
        workspaceId: w,
        userId: u,
        query: "I must authenticate again",
        membershipVerified: true,
      });
      expect(keyword).toHaveLength(0);
      const pageCandidates = await exactSearchCandidates(w, u, fixtureEmbedding(0), 2);
      expect(new Set(pageCandidates.map((c) => c.page_id)).size).toBe(2);
      const response = await search("I must authenticate again");
      expect(response.metadata.mode).toBe("semantic");
      expect(response.results[0].id).toBe(auth);
      const wire = JSON.parse(JSON.stringify(response.results[0]));
      expect(wire.entity.updatedAt).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
      expect(wire.updatedAt).toBe(wire.entity.updatedAt);
      expect(response.results.map((r) => r.id)).not.toContain(hidden);
      expect(new Set(response.results.map((r) => r.id)).size).toBe(response.results.length);
      expect(response.results[0].match?.pageId).toBe(auth);
      expect(response.results[0].excerpt).not.toMatch(/<|__ZILOBASE/);
    }));
  it("ranks only by semantic similarity even when another page matches the title", async () =>
    within(async () => {
      const query = "Trip schedule";
      // Identical input: lexical search finds the title, while the query embedding favors credentials.
      expect(
        (
          await searchWorkspaceItems({
            workspaceId: w,
            userId: u,
            query,
            membershipVerified: true,
          })
        )[0].id,
      ).toBe(travel);
      const response = await search(query, { provider: fakeSearchProvider(() => 0) });
      expect(response.metadata.mode).toBe("semantic");
      expect(response.results[0].id).toBe(auth);
      expect(response.results.every((result) => result.match)).toBe(true);
    }));
  it("makes no query call and returns no keyword results for empty input or feature disablement", async () =>
    within(async () => {
      const fake = provider();
      fake.embedQuery = vi.fn(fake.embedQuery);
      expect((await search("!!!", { provider: fake })).results).toEqual([]);
      expect(fake.embedQuery).not.toHaveBeenCalled();
      const result = await semanticSearchWorkspace(
        { workspaceId: w, userId: u, query: "Credentials", membershipVerified: true },
        { ...env(), SEARCH_EMBEDDINGS_ENABLED: "false" },
        { provider: fake },
      );
      expect(result.metadata.mode).toBe("semantic");
      expect(result.results).toEqual([]);
      expect(fake.embedQuery).not.toHaveBeenCalled();
    }));
  it("excludes dirty and disabled vectors without keyword fallback", async () =>
    within(async () => {
      await db.execute(sql`update page set name='Access documentation' where id=${auth}`);
      expect((await search("I must authenticate again")).results.map((r) => r.id)).not.toContain(
        auth,
      );
      await db.execute(
        sql`update workspace_search_settings set enabled=false,index_epoch=index_epoch+1 where workspace_id=${w}`,
      );
      const result = await search("Credentials");
      expect(result.metadata.mode).toBe("semantic");
      expect(result.results).toEqual([]);
    }));
  it("reports unavailability on provider errors and respects the interactive timeout", async () =>
    within(async () => {
      const fake = provider();
      fake.embedQuery = async () => {
        throw new SearchEmbeddingError("SEARCH_PROVIDER_UNAVAILABLE", true);
      };
      expect((await search("Credentials", { provider: fake })).metadata.degradationReason).toBe(
        "provider_unavailable",
      );
      fake.embedQuery = () => new Promise(() => {});
      const start = Date.now();
      const result = await search("Trip", { provider: fake });
      expect(result.metadata.degradationReason).toBe("provider_timeout");
      expect(result.results).toEqual([]);
      expect(Date.now() - start).toBeLessThan(2500);
    }));
});
