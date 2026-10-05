import assert from "node:assert/strict";
import { test } from "node:test";
import { DataSession } from "./session";
import { createPageCollection } from "../pages/cache";
import { entityTimestamp } from "./clock";

const timestamp = (revision: number) => `2026-10-05T00:00:00.${String(revision).padStart(3, "0")}Z`;
function fixture() {
  const session = new DataSession({
    deployment: "fixture",
    workspaceId: "workspace",
    viewer: { kind: "public", capabilityId: "fixture" },
  });
  const pages = createPageCollection(session);
  session.ingest([
    pages.stage([
      {
        id: "page",
        workspaceId: "workspace",
        name: "Initial",
        updatedAt: timestamp(1),
        metadata: { cover: "Cover", emoji: "📚" },
      },
    ]),
  ]);
  return { session, pages };
}

test("delayed reads merge covered fields without regressing newer confirmations", async () => {
  const { session, pages } = fixture();
  const delayed = pages.stage([
    { id: "page", name: "Old read", updatedAt: timestamp(2), hasContent: true },
  ]);
  session.ingest([
    pages.stage([{ id: "page", name: "New confirmation", updatedAt: timestamp(3) }]),
  ]);
  session.ingest([delayed]);
  assert.equal(pages.get("page")!.name, "New confirmation");
  assert.equal(pages.get("page")!.updatedAt, timestamp(3));
  assert.equal(
    pages.get("page")!.hasContent,
    true,
    "an uncovered field may be filled by a partial read",
  );
  await session.dispose();
});

test("partial metadata summaries preserve richer fields and their independent clocks", async () => {
  const { session, pages } = fixture();
  session.ingest([
    pages.stage([{ id: "page", metadata: { emoji: "✅" }, updatedAt: timestamp(3) }]),
  ]);
  session.ingest([
    pages.stage([
      { id: "page", metadata: { emoji: "Old", cover: "Changed cover" }, updatedAt: timestamp(2) },
    ]),
  ]);
  assert.deepEqual(pages.get("page")!.metadata, { cover: "Changed cover", emoji: "✅" });
  session.ingest([pages.stage([{ id: "page", metadata: null, updatedAt: timestamp(2) }])]);
  assert.equal(
    pages.get("page")!.metadata?.emoji,
    "✅",
    "older whole-object clear cannot erase a confirmed child",
  );
  session.ingest([pages.stage([{ id: "page", metadata: null, updatedAt: timestamp(4) }])]);
  session.ingest([
    pages.stage([{ id: "page", metadata: { emoji: "Old" }, updatedAt: timestamp(3) }]),
  ]);
  assert.equal(pages.get("page")!.metadata, null);
  await session.dispose();
});

test("duplicate and reversed confirmations converge for both ack/socket orders", async () => {
  for (const order of [
    [2, 3, 2, 3],
    [3, 2, 3, 2],
  ]) {
    const { session, pages } = fixture();
    for (const revision of order)
      session.ingest([
        pages.stage([{ id: "page", name: String(revision), updatedAt: timestamp(revision) }]),
      ]);
    assert.equal(pages.get("page")!.name, "3");
    await session.dispose();
  }
});

test("duplicate identities in one publication compose sparse fields", async () => {
  const { session, pages } = fixture();
  session.ingest([
    pages.stage([{ id: "page", name: "Renamed", updatedAt: timestamp(2) }]),
    pages.stage([{ id: "page", hasContent: true, updatedAt: timestamp(3) }]),
  ]);
  assert.equal(pages.get("page")!.name, "Renamed");
  assert.equal(pages.get("page")!.hasContent, true);
  await session.dispose();
});

test("lifecycle tombstones survive stale reads and are restored by newer stamps", async () => {
  const { session, pages } = fixture();
  session.ingest([pages.stage([{ id: "page", deletedAt: timestamp(3), updatedAt: timestamp(3) }])]);
  session.ingest([pages.stage([{ id: "page", deletedAt: null, updatedAt: timestamp(2) }])]);
  assert.equal(pages.get("page")!.deletedAt, timestamp(3));
  session.ingest([pages.stage([{ id: "page", deletedAt: null, updatedAt: timestamp(4) }])]);
  assert.equal(pages.get("page")!.deletedAt, null);
  await session.dispose();
});

test("explicit hard deletion blocks delayed resurrection while empty results preserve entities", async () => {
  const { session, pages } = fixture();
  const delayed = pages.stage([
    { id: "page", workspaceId: "workspace", name: "Delayed", updatedAt: timestamp(2) },
  ]);
  session.ingest([pages.stage([])]);
  assert.equal(pages.collection.size, 1);
  session.ingest([
    pages.stageRemoval("page", "hard-delete", entityTimestamp("page", timestamp(3))),
  ]);
  session.ingest([delayed]);
  assert.equal(pages.get("page"), undefined);
  session.ingest([
    pages.stage([
      {
        id: "page",
        workspaceId: "workspace",
        name: "Authorized new entity",
        updatedAt: timestamp(4),
      },
    ]),
  ]);
  assert.equal(pages.get("page")!.name, "Authorized new entity");
  await session.dispose();
});

test("unrelated host clocks reject the whole batch before publication", async () => {
  const { session, pages } = fixture();
  assert.throws(
    () =>
      session.ingest([
        pages.stage([{ id: "page", name: "Wrong host", updatedAt: timestamp(9) }], {
          scope: "host",
          id: "other-host",
          revision: 999,
        }),
      ]),
    /Unrelated/,
  );
  assert.equal(pages.get("page")!.name, "Initial");
  await session.dispose();
});

test("context snapshots are gated during collection commits", async () => {
  const { session, pages } = fixture();
  let blocked = false;
  const subscription = pages.collection.subscribeChanges(() => {
    assert.throws(() => session.snapshot(() => pages.get("page")), /in progress/);
    blocked = true;
  });
  session.ingest([pages.stage([{ id: "page", name: "Published", updatedAt: timestamp(2) }])]);
  assert(blocked);
  assert.equal(session.snapshot(() => pages.get("page")!.name).value, "Published");
  subscription.unsubscribe();
  await session.dispose();
});
