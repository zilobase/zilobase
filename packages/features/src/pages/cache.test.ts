import assert from "node:assert/strict";
import { test } from "node:test";
import { createMutationTestRuntime } from "../shared/mutation-runtime.test";
import { useUpdatePage } from "./content-mutations";
import { TestQueryClient } from "../data/testing";
import {
  cachePageDetail,
  resolvePageDetailReference,
  resolveNavigationReference,
  type PageDetailReference,
  type PageNavigationReference,
} from "./cache";
import { pageQueryKey, pagesQueryKey, pagesQueryOptions } from "./queries";
import { sharedClient } from "../data/client";
import type { Page } from "./contracts";
import type { ApiFetcher } from "../shared/api-fetcher";

const stamp = (n: number) => `2026-10-05T00:00:00.${String(n).padStart(3, "0")}Z`;
const page: Page = {
  id: "page",
  workspaceId: "workspace",
  name: "Original",
  type: "pageblock",
  url: "#",
  createdAt: stamp(1),
  updatedAt: stamp(1),
  content: { body: "Yjs snapshot" },
  metadata: { emoji: "📚", cover: "cover" },
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function resolved(client: TestQueryClient) {
  return resolvePageDetailReference(
    client,
    client.getQueryData<PageDetailReference>(pageQueryKey(page.id)),
  )!.page;
}

test("page metadata acknowledgement updates all references with one write and no full reads", async () => {
  const requests: string[] = [];
  const { mutation, queryClient } = createMutationTestRuntime(
    useUpdatePage,
    async <T>(path: string, init?: RequestInit) => {
      requests.push(`${init?.method} ${path}`);
      return { page: { ...page, name: "Confirmed", updatedAt: stamp(2) } } as T;
    },
  );
  try {
    cachePageDetail(queryClient, { page, accessLevel: "full", databaseIds: ["host"] });
    const reference = queryClient.getQueryData<PageDetailReference>(pageQueryKey(page.id))!.page;
    queryClient.setQueryData(pagesQueryKey(page.workspaceId), {
      pages: [reference],
      databases: [],
      placements: [],
    });
    await mutation.mutateAsync({ id: page.id, name: "Draft" });
    assert.equal(resolved(queryClient).name, "Confirmed");
    const nav = queryClient.getQueryData<PageNavigationReference>(pagesQueryKey(page.workspaceId))!;
    assert.equal(resolveNavigationReference(queryClient, nav).pages[0]!.name, "Confirmed");
    assert.equal(
      "name" in nav.pages[0]!,
      false,
      "Query stores references rather than metadata snapshots",
    );
    assert.deepEqual(requests, ["PATCH /pages/page"]);
  } finally {
    queryClient.clear();
  }
});

test("delayed partial navigation and empty results preserve newer page metadata and body context", async () => {
  const client = new TestQueryClient();
  const response = Promise.withResolvers<{ pages: Page[] }>();
  try {
    cachePageDetail(client, { page, accessLevel: "full", databaseIds: [] });
    const read = client.fetchQuery(
      pagesQueryOptions((async () => response.promise) as ApiFetcher, page.workspaceId),
    );
    cachePageDetail(client, {
      page: { ...page, name: "Newer", updatedAt: stamp(3) },
      accessLevel: "full",
      databaseIds: [],
    });
    response.resolve({ pages: [{ ...page, content: undefined, metadata: { emoji: "📚" } }] });
    const reference = await read;
    assert.equal(resolveNavigationReference(client, reference).pages[0]!.name, "Newer");
    assert.deepEqual(resolved(client).metadata, { emoji: "📚", cover: "cover" });
    assert.deepEqual(resolved(client).content, page.content);
    await client.fetchQuery(
      pagesQueryOptions((async () => ({ pages: [] })) as ApiFetcher, page.workspaceId),
    );
    assert.equal(resolved(client).name, "Newer");
  } finally {
    client.clear();
  }
});

test("same-page edits serialize supported previews and a rejection preserves collaborator fields", async () => {
  const client = new TestQueryClient();
  try {
    cachePageDetail(client, { page, accessLevel: "full", databaseIds: [] });
    const owner = sharedClient(client).resolve(sharedClient(client).capture(), page.workspaceId);
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const calls: string[] = [];
    const rejected = owner.session.commands.run(
      owner.pages,
      page.id,
      (draft) => {
        draft.name = "Rejected";
      },
      async () => {
        calls.push("first");
        await first.promise;
      },
    );
    const failure = assert.rejects(rejected, /Denied/);
    const queued = owner.session.commands.run(
      owner.pages,
      page.id,
      (draft) => {
        draft.metadata = { ...draft.metadata, emoji: "✅" };
      },
      async () => {
        calls.push("second");
        await second.promise;
        owner.session.ingest([
          owner.pages.stage([{ id: page.id, metadata: { emoji: "✅" }, updatedAt: stamp(4) }]),
        ]);
      },
    );
    await tick();
    assert.deepEqual(calls, ["first"]);
    assert.equal(resolved(client).name, "Rejected");
    owner.session.ingest([
      owner.pages.stage([
        {
          id: page.id,
          name: "Collaborator",
          metadata: { cover: "new cover" },
          updatedAt: stamp(3),
        },
      ]),
    ]);
    assert.equal(resolved(client).name, "Collaborator", "authority retires whole-row previews");
    first.reject(new Error("Denied"));
    await failure;
    await tick();
    assert.deepEqual(calls, ["first", "second"]);
    assert.deepEqual(resolved(client).metadata, { cover: "new cover", emoji: "✅" });
    second.resolve();
    await queued;
    assert.equal(resolved(client).name, "Collaborator");
    assert.equal(resolved(client).metadata!.cover, "new cover");
  } finally {
    client.clear();
  }
});
