import assert from "node:assert/strict";
import { test } from "node:test";
import { TestQueryClient } from "../data/testing";
import { sharedClient } from "../data/client";
import type { ApiFetcher } from "../shared/api-fetcher";
import {
  changeContentVerification,
  reconcileContentVerification,
  contentVerificationQueryKey,
  contentVerificationQueryOptions,
} from "./verification";
const resource = { workspaceId: "w", type: "page" as const, id: "p" };
const response = (revision = "2026-01-01T00:00:00.000Z") => ({
  ...resource,
  canManage: true,
  verification: {
    state: "verified" as const,
    verifiedAt: revision,
    verifiedById: "u",
    expiresAt: null,
    revision,
  },
});
test("verification queries reject mismatched scopes and late identities", async () => {
  const client = new TestQueryClient();
  const api = (async () => ({ ...response(), workspaceId: "other" })) as ApiFetcher;
  await assert.rejects(
    client.fetchQuery(contentVerificationQueryOptions(api, resource)),
    /scope mismatch/,
  );
  client.clear();
});
test("verification mutation acknowledgement cannot enter another identity", async () => {
  const client = new TestQueryClient();
  let resolve!: (value: unknown) => void, started!: () => void;
  const requested = new Promise<void>((r) => (started = r));
  const api = (async () => {
    started();
    return new Promise<unknown>((r) => (resolve = r));
  }) as ApiFetcher;
  const pending = changeContentVerification(client, api, resource, { expiresAt: null });
  await requested;
  sharedClient(client).clear();
  resolve(response());
  await assert.rejects(pending, /expired identity/);
  assert.equal(client.getQueryData(contentVerificationQueryKey(resource)), undefined);
  client.clear();
});
test("out-of-order verification writes retain the newest acknowledgement", async () => {
  const client = new TestQueryClient();
  const older = await changeContentVerification(
    client,
    (async () => response()) as ApiFetcher,
    resource,
    { expiresAt: null },
  );
  const newer = await changeContentVerification(
    client,
    (async () => response("2026-02-01T00:00:00.000Z")) as ApiFetcher,
    resource,
    { expiresAt: null },
  );
  await reconcileContentVerification(client, newer);
  await reconcileContentVerification(client, older);
  assert.equal(
    client.getQueryData<{ verification: { revision: string } }>(
      contentVerificationQueryKey(resource),
    )?.verification.revision,
    "2026-02-01T00:00:00.000Z",
  );
  sharedClient(client).clear();
  client.removeQueries({ queryKey: contentVerificationQueryKey(resource) });
  await reconcileContentVerification(client, newer);
  assert.equal(client.getQueryData(contentVerificationQueryKey(resource)), undefined);
  client.clear();
});
test("verification uses dedicated endpoints and explicit removal", async () => {
  const client = new TestQueryClient(),
    calls: RequestInit[] = [];
  const api = (async (path: string, init: RequestInit) => {
    assert.equal(path, "/pages/p/verification");
    calls.push(init);
    return response();
  }) as ApiFetcher;
  await changeContentVerification(client, api, resource, { expiresAt: null });
  await changeContentVerification(client, api, resource, { remove: true });
  assert.equal(calls[0].method, "PUT");
  assert.deepEqual(JSON.parse(calls[0].body as string), { expiresAt: null });
  assert.equal(calls[1].method, "DELETE");
  client.clear();
});

test("verification refreshes page metadata and database windows after the acknowledgement", async () => {
  const client = new TestQueryClient();
  const metadata = ["page", "p", "properties"];
  const database = ["db", "session", "host", "window", "source", "query", false];
  client.setQueryData(metadata, {});
  client.setQueryData(database, {});
  const result = await changeContentVerification(
    client,
    (async () => response()) as ApiFetcher,
    resource,
    { expiresAt: null },
  );
  await reconcileContentVerification(client, result);
  assert.equal(client.getQueryState(metadata)?.isInvalidated, true);
  assert.equal(client.getQueryState(database)?.isInvalidated, true);
  client.clear();
});
