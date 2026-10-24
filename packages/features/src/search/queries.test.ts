import assert from "node:assert/strict";
import { test } from "node:test";
import { TestQueryClient } from "../data/testing";
import { sharedClient } from "../data/client";
import { appSearchQueryKey, appSearchQueryOptions } from "./queries";
import { reindexWorkspaceSearch, updateWorkspaceSearchSettings } from "./settings";
import type { ApiFetcher } from "../shared/api-fetcher";

test("search mode and workspace isolate cached responses and are sent explicitly", async () => {
  const client = new TestQueryClient({ defaultOptions: { queries: { retry: false } } });
  const paths: string[] = [];
  const api = (async (path: string) => {
    paths.push(path);
    return {
      results: [],
      metadata: {
        mode: path.includes("semantic") ? "semantic" : "keyword",
        indexAvailability: "ready",
      },
    };
  }) as ApiFetcher;
  try {
    const keyword = await client.fetchQuery(
      appSearchQueryOptions(api, "workspace", "Login", true, ["page"], "keyword"),
    );
    const semantic = await client.fetchQuery(
      appSearchQueryOptions(api, "workspace", "Login", true, ["page"], "semantic"),
    );
    assert.deepEqual(keyword.results, []);
    assert.equal(keyword.metadata?.mode, "keyword");
    assert.equal(semantic.metadata?.mode, "semantic");
    assert.notDeepEqual(
      appSearchQueryKey("workspace", "Login", undefined, "keyword"),
      appSearchQueryKey("workspace", "Login", undefined, "semantic"),
    );
    assert.notDeepEqual(
      appSearchQueryKey("workspace", "Login"),
      appSearchQueryKey("another", "Login"),
    );
    assert.equal(paths.length, 2);
    assert.ok(paths[0].includes("mode=keyword"));
    assert.ok(paths[1].includes("mode=semantic"));
  } finally {
    client.clear();
  }
});
test("a response arriving after session invalidation cannot publish search data", async () => {
  const client = new TestQueryClient();
  let resolve!: (value: unknown) => void, started!: () => void;
  const requested = new Promise<void>((r) => (started = r));
  const api = (async () => {
    started();
    return new Promise<unknown>((r) => (resolve = r));
  }) as ApiFetcher;
  const options = appSearchQueryOptions(api, "workspace", "query", true, undefined, "semantic");
  const pending = options.queryFn!({ client, signal: new AbortController().signal } as never);
  await requested;
  sharedClient(client).clear();
  resolve({ results: [] });
  await assert.rejects(Promise.resolve(pending));
  client.clear();
});
test("workspace search mutations use scoped endpoints and explicit JSON opt-in", async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const api = (async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return {};
  }) as ApiFetcher;
  await updateWorkspaceSearchSettings(api, "workspace", true);
  await reindexWorkspaceSearch(api, "workspace");
  assert.equal(calls[0].path, "/workspaces/workspace/search/settings");
  assert.equal(calls[0].init?.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].init?.body as string), { enabled: true });
  assert.equal(calls[1].path, "/workspaces/workspace/search/reindex");
  assert.equal(calls[1].init?.method, "POST");
});
