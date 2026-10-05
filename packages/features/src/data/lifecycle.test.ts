import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryObserver } from "@tanstack/react-query";
import { TestQueryClient } from "./testing";
import { installSharedClient, sharedClient } from "./client";
import { stageAuthorizedPages, resolvePageReference, updatePageContexts } from "../pages/cache";
import { pageQueryOptions } from "../pages/queries";
import type { ApiFetcher } from "../shared/api-fetcher";

const page = {
  id: "page",
  workspaceId: "workspace",
  name: "Private",
  type: "pageblock",
  url: "#",
  createdAt: "2026-10-05T00:00:00.001Z",
  updatedAt: "2026-10-05T00:00:00.001Z",
};
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("deployment/account changes invalidate captured reads and clear scoped collections", async () => {
  const client = new TestQueryClient();
  let deployment = "one";
  let account = "one";
  const cache = installSharedClient(client, () => ({
    deployment,
    viewer: { kind: "account", accountId: account, actorId: account, sessionId: account },
  }));
  const read = cache.capture();
  const [ref] = stageAuthorizedPages(client, read, "workspace", [page]);
  deployment = "two";
  assert.equal(resolvePageReference(client, ref!), null);
  assert.throws(() => stageAuthorizedPages(client, read, "workspace", [page]), /expired/);
  const next = cache.capture();
  stageAuthorizedPages(client, next, "workspace", [page]);
  account = "two";
  assert.throws(() => cache.resolve(next, "workspace"), /expired/);
  client.clear();
});

test("capabilities and workspaces isolate entities and private preferences", () => {
  const client = new TestQueryClient();
  const cache = sharedClient(client);
  const [account] = stageAuthorizedPages(client, cache.capture(), "workspace", [
    { ...page, isFavorite: true },
  ]);
  const [guest] = stageAuthorizedPages(
    client,
    cache.capture(),
    "workspace",
    [{ ...page, isFavorite: false }],
    { kind: "guest", id: "page" },
  );
  const [publicRef] = stageAuthorizedPages(client, cache.capture(), "workspace", [page], {
    kind: "public",
    id: "page",
  });
  const read = { ...cache.capture(), scopeId: guest!.cacheId };
  updatePageContexts(client, "page", { isFavorite: true }, read);
  assert.equal(resolvePageReference(client, publicRef!)?.isFavorite, undefined);
  assert.equal(resolvePageReference(client, account!)?.isFavorite, true);
  assert.equal(resolvePageReference(client, guest!)?.isFavorite, true);
  assert.notEqual(cache.resolve(cache.capture(), "other").session.id, account!.cacheId);
  client.clear();
});

test("denied recovery removes the known scope and rejects late responses", async () => {
  const client = new TestQueryClient({ defaultOptions: { queries: { retry: false } } });
  const cache = sharedClient(client);
  const [ref] = stageAuthorizedPages(client, cache.capture(), "workspace", [page]);
  client.setQueryData(["page", "page"], { page: ref });
  const late = cache.capture();
  const result = await client.fetchQuery({
    ...pageQueryOptions(
      (async () => {
        throw { status: 403 };
      }) as ApiFetcher,
      "page",
    ),
    staleTime: 0,
  });
  assert.equal(result, null);
  assert.equal(resolvePageReference(client, ref!), null);
  assert.throws(() => stageAuthorizedPages(client, late, "workspace", [page]), /expired/);
  const [reauthorized] = stageAuthorizedPages(client, cache.capture(), "workspace", [page]);
  assert.notEqual(reauthorized!.cacheId, ref!.cacheId);
  client.clear();
});

test("Query retention, mounted readers and pending writes protect collection interests", async () => {
  const client = new TestQueryClient({ defaultOptions: { queries: { gcTime: 30 } } });
  const cache = sharedClient(client);
  const [ref] = stageAuthorizedPages(client, cache.capture(), "workspace", [page]);
  const owner = cache.get(ref!.cacheId)!;
  const key = ["page", "page"];
  client.setQueryData(key, { page: ref });
  const observer = new QueryObserver(client, { queryKey: key, enabled: false });
  const stopObserver = observer.subscribe(() => {});
  const stopMounted = owner.pages.subscribe("page", () => {});
  const receipt = Promise.withResolvers<void>();
  const pending = owner.session.commands.run(
    owner.pages,
    "page",
    (draft) => {
      draft.name = "Preview";
    },
    async () => receipt.promise,
  );
  await tick();
  stopObserver();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(client.getQueryData(key), undefined);
  assert.equal(owner.pages.get("page")?.name, "Preview");
  stopMounted();
  await tick();
  assert.equal(
    cache.get(ref!.cacheId),
    owner,
    "pending receipt retains its session after Query GC",
  );
  receipt.resolve();
  await pending;
  await tick();
  assert.equal(cache.get(ref!.cacheId), undefined);
  assert.equal(owner.pages.collection.size, 0);
  client.clear();
});

test("an expired family cleans up and restarts through an authorized read while metadata stays mounted", async () => {
  const client = new TestQueryClient();
  const cache = sharedClient(client);
  const [ref] = stageAuthorizedPages(client, cache.capture(), "workspace", [page]);
  const owner = cache.get(ref!.cacheId)!;
  owner.session.ingest([
    owner.databases.values.stage([
      {
        id: JSON.stringify(["page", "property"]),
        valueId: "value",
        pageId: "page",
        propertyId: "property",
        value: "Original",
        updatedAt: page.updatedAt,
        createdAt: page.updatedAt,
      },
    ]),
  ]);
  client.setQueryData(["page", "page"], { page: ref });
  client.setQueryData(["page", "page", "properties"], {
    cacheId: ref!.cacheId,
    propertyIds: [],
    pageId: "page",
    valuePropertyIds: ["property"],
  });
  await tick();
  client.removeQueries({ queryKey: ["page", "page", "properties"], exact: true });
  await tick();
  assert.equal(owner.databases.values.collection.size, 0);
  assert.equal(owner.pages.get("page")?.name, "Private");
  await cache.captureRead(owner.session.id);
  owner.session.ingest([
    owner.databases.values.stage([
      {
        id: JSON.stringify(["page", "property"]),
        valueId: "value",
        pageId: "page",
        propertyId: "property",
        value: "Reauthorized",
        updatedAt: page.updatedAt,
        createdAt: page.updatedAt,
      },
    ]),
  ]);
  assert.equal(owner.databases.values.collection.size, 1);
  client.clear();
});
