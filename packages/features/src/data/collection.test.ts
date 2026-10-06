import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToString } from "react-dom/server";
import { createElement } from "react";

import { DataSession, type DataSessionScope } from "./session";
import { useSharedEntity } from "./react";
import { pageCacheEntitySchema } from "../pages/cache-entities";
import { propertyCacheEntitySchema } from "../databases/schema/cache-entities";

const scope: DataSessionScope = {
  deployment: "https://local.zilobase.test",
  workspaceId: "workspace",
  viewer: { kind: "account", accountId: "account", actorId: "actor", sessionId: "auth-session" },
};
const timestamp = "2026-10-05T00:00:00.000Z";

function fixture() {
  const session = new DataSession(scope);
  const pages = session.register({ name: "pages", schema: pageCacheEntitySchema });
  const properties = session.register({ name: "properties", schema: propertyCacheEntitySchema });
  session.ingest([
    pages.stage([
      {
        id: "page",
        name: "Original",
        workspaceId: "workspace",
        updatedAt: timestamp,
        metadata: { emoji: "📚", cover: "cover" },
      },
    ]),
    properties.stage([
      {
        id: "property",
        name: "Status",
        workspaceId: "workspace",
        type: "select",
        updatedAt: timestamp,
        config: { options: [{ label: "Open" }] },
      },
    ]),
  ]);
  return { session, pages, properties };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, failed) => {
    resolve = done;
    reject = failed;
  });
  return { promise, resolve, reject };
}

test("two reactive consumers and both React bindings resolve one page", async () => {
  const { session, pages } = fixture();
  const first: string[] = [],
    second: string[] = [];
  const release1 = pages.subscribe("page", () => first.push(pages.get("page")!.name));
  const release2 = pages.subscribe("page", () => second.push(pages.get("page")!.name));
  session.ingest([pages.stage([{ id: "page", name: "Shared" }])]);
  assert.deepEqual(first, ["Shared"]);
  assert.deepEqual(second, first);
  function Consumer() {
    return createElement("span", null, useSharedEntity(pages, "page")!.name);
  }
  assert.equal(renderToString(createElement(Consumer)), "<span>Shared</span>");
  assert.equal(renderToString(createElement(Consumer)), "<span>Shared</span>");
  release1();
  release2();
  await session.dispose();
});

test("partial endpoints and explicit null preserve or clear only supplied fields", async () => {
  const { session, pages, properties } = fixture();
  session.ingest([
    pages.stage([{ id: "page", name: "Sidebar" }]),
    properties.stage([{ id: "property", name: "State", config: undefined }]),
  ]);
  assert.deepEqual(pages.get("page")!.metadata, { emoji: "📚", cover: "cover" });
  assert.deepEqual(properties.get("property")!.config, { options: [{ label: "Open" }] });
  session.ingest([pages.stage([{ id: "page", metadata: null }])]);
  assert.equal(pages.get("page")!.metadata, null);
  session.ingest([pages.stage([])]);
  assert.equal(pages.collection.size, 1, "empty result is not collection replacement");
  await session.dispose();
});

test("multi-collection notification exposes only the completed batch", async () => {
  const { session, pages, properties } = fixture();
  const observed: Array<[string, string]> = [];
  const notify = () => observed.push([pages.get("page")!.name, properties.get("property")!.name]);
  pages.subscribe("page", notify);
  properties.subscribe("property", notify);
  session.ingest([
    pages.stage([{ id: "page", name: "New page" }]),
    properties.stage([{ id: "property", name: "New property" }]),
  ]);
  assert.deepEqual(observed, [["New page", "New property"]]);
  await session.dispose();
});

test("invalid domain input prevents the entire prepared batch from writing", async () => {
  const { session, pages, properties } = fixture();
  assert.throws(
    () =>
      session.ingest([
        pages.stage([{ id: "page", name: "Must not publish" }]),
        properties.stage([{ id: "property", updatedAt: "invalid" }]),
      ]),
    /Invalid/,
  );
  assert.equal(pages.get("page")!.name, "Original");
  await session.dispose();
});

test("supported transaction commits authoritative acknowledgement without a refetch", async () => {
  const { session, pages } = fixture();
  const response = deferred<string>();
  let posts = 0;
  const transaction = session.client.createTransaction({
    autoCommit: false,
    mutationFn: async () => {
      posts += 1;
      const name = await response.promise;
      session.ingest([pages.stage([{ id: "page", name }])]);
    },
  });
  transaction.mutate(() =>
    pages.collection.update("page", (draft) => {
      draft.name = "Draft";
    }),
  );
  assert.equal(pages.get("page")!.name, "Draft");
  assert.equal(pages.collection.base.get("page")!.name, "Original");
  const saved = transaction.commit();
  response.resolve("Confirmed");
  await saved;
  await transaction.when("settled");
  assert.equal(posts, 1);
  assert.equal(pages.get("page")!.name, "Confirmed");
  await session.dispose();
});

test("partial read merges authoritative base rather than copying an optimistic field", async () => {
  const { session, pages } = fixture();
  const transaction = session.client.createTransaction({
    autoCommit: false,
    mutationFn: async () => {},
  });
  const settled = transaction.when("settled").catch(() => undefined);
  transaction.mutate(() =>
    pages.collection.update("page", (draft) => {
      draft.name = "Draft";
    }),
  );
  session.ingest([pages.stage([{ id: "page", hasContent: true }])]);
  assert.equal(pages.collection.base.get("page")!.name, "Original");
  transaction.rollback();
  await settled;
  assert.equal(pages.get("page")!.name, "Original");
  assert.equal(pages.get("page")!.hasContent, true);
  await session.dispose();
});

test("rejection rolls back one intention without erasing another entity's update", async () => {
  const { session, pages, properties } = fixture();
  const failure = new Error("Denied");
  const transaction = session.client.createTransaction({
    autoCommit: false,
    mutationFn: async () => {
      throw failure;
    },
  });
  const settled = transaction.when("settled").catch((error) => error);
  transaction.mutate(() =>
    pages.collection.update("page", (draft) => {
      draft.name = "Rejected";
    }),
  );
  session.ingest([properties.stage([{ id: "property", name: "Collaborator" }])]);
  await assert.rejects(transaction.commit(), /Denied/);
  assert.equal(await settled, failure);
  assert.equal(pages.get("page")!.name, "Original");
  assert.equal(properties.get("property")!.name, "Collaborator");
  await session.dispose();
});

test("retiring conflicting optimism preserves later fields and does not abort HTTP acknowledgement", async () => {
  const { session, pages } = fixture();
  const response = deferred<void>();
  let acknowledged = false;
  const transaction = session.client.createTransaction({
    autoCommit: false,
    mutationFn: async () => {
      await response.promise;
      acknowledged = true;
    },
  });
  const settled = transaction.when("settled").catch(() => undefined);
  transaction.mutate(() =>
    pages.collection.update("page", (draft) => {
      draft.name = "Older edit";
    }),
  );
  const command = transaction.commit();
  session.batch(() => {
    transaction.rollback();
    session.ingest([
      pages.stage([{ id: "page", name: "Collaborator", metadata: { emoji: "✅" } }]),
    ]);
  });
  assert.equal(pages.get("page")!.name, "Collaborator");
  assert.deepEqual(pages.get("page")!.metadata, { emoji: "✅" });
  response.resolve();
  await command;
  await settled;
  assert.equal(acknowledged, true);
  assert.equal(pages.get("page")!.name, "Collaborator");
  await session.dispose();
});

test("session client scopes isolate equal IDs and disposal rejects late ingestion", async () => {
  const first = fixture(),
    second = fixture();
  first.session.ingest([first.pages.stage([{ id: "page", name: "Private" }])]);
  assert.equal(second.pages.get("page")!.name, "Original");
  const late = first.pages.stage([{ id: "page", name: "Late" }]);
  await first.session.dispose();
  assert.throws(() => first.session.ingest([late]), /disposed/);
  assert.throws(() => late.apply(), /disposed/);
  await first.session.dispose();
  await second.session.dispose();
});

test("public cleanup and preload restart a custom collection without internal APIs", async () => {
  const { session, pages } = fixture();
  await pages.collection.cleanup();
  assert.equal(pages.collection.size, 0);
  await pages.collection.preload();
  session.ingest([
    pages.stage([
      { id: "page", name: "Reauthorized", workspaceId: "workspace", updatedAt: timestamp },
    ]),
  ]);
  assert.equal(pages.get("page")?.name, "Reauthorized");
  await session.dispose();
});
