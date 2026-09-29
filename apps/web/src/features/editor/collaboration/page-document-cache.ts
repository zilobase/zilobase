import Dexie, { type EntityTable } from "dexie";
import * as Y from "yjs";

type CachedPage = {
  key: string;
  userId: string;
  pageId: string;
  workspaceId: string | null;
  detail: unknown | null;
  updatedAt: number;
  bytes: number;
  locallyChanged: boolean;
};

type CachedUpdate = { id?: number; key: string; update: Uint8Array };

class PageCacheDatabase extends Dexie {
  pages!: EntityTable<CachedPage, "key">;
  updates!: EntityTable<CachedUpdate, "id">;

  constructor() {
    super("zilobase-page-cache-v1");
    this.version(1).stores({ pages: "key,userId,updatedAt", updates: "++id,key" });
  }
}

export type PageDocumentEntry = {
  document: Y.Doc;
  pageId: string;
  userId: string;
  key: string;
  detail: unknown | null;
  hasPersistedState: boolean;
  locallyChanged: boolean;
  pendingWrites: number;
  references: number;
  lastUsedAt: number;
  persistenceError: Error | null;
  flush: () => Promise<void>;
};

const MEMORY_LIMIT = 5;
const db = new PageCacheDatabase();
const entries = new Map<string, PageDocumentEntry>();
const opening = new Map<string, Promise<PageDocumentEntry>>();
const writeTails = new Map<string, Promise<void>>();

function cacheKey(userId: string, pageId: string) {
  const deployment = typeof window === "undefined" ? "server" : window.location.origin;
  return `${deployment}:${userId}:${pageId}`;
}

function queueWrite(entry: PageDocumentEntry, work: () => Promise<void>) {
  entry.pendingWrites += 1;
  const previous = writeTails.get(entry.key) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(work)
    .catch((reason: unknown) => {
      entry.persistenceError =
        reason instanceof Error ? reason : new Error("Page cache write failed");
    })
    .finally(() => {
      entry.pendingWrites -= 1;
    });
  writeTails.set(entry.key, next);
  return next;
}

async function createEntry(userId: string, pageId: string, key: string) {
  const [saved, updates] = await Promise.all([
    db.pages.get(key),
    db.updates.where("key").equals(key).sortBy("id"),
  ]);
  const document = new Y.Doc();
  for (const record of updates) Y.applyUpdate(document, record.update, "page-cache-hydration");
  const entry: PageDocumentEntry = {
    document,
    pageId,
    userId,
    key,
    detail: saved?.detail ?? null,
    hasPersistedState: updates.length > 0,
    locallyChanged: saved?.locallyChanged ?? false,
    pendingWrites: 0,
    references: 0,
    lastUsedAt: Date.now(),
    persistenceError: null,
    flush: () => writeTails.get(key) ?? Promise.resolve(),
  };
  document.on("update", (update: Uint8Array, origin: unknown) => {
    entry.hasPersistedState = true;
    const local = origin !== "page-cache-hydration" && origin !== "page-bootstrap";
    if (local) entry.locallyChanged = true;
    void queueWrite(entry, async () => {
      await db.transaction("rw", db.pages, db.updates, async () => {
        await db.updates.add({ key, update: new Uint8Array(update) });
        const previous = await db.pages.get(key);
        await db.pages.put({
          key,
          userId,
          pageId,
          workspaceId: previous?.workspaceId ?? null,
          detail: previous?.detail ?? null,
          updatedAt: Date.now(),
          bytes: (previous?.bytes ?? 0) + update.byteLength,
          locallyChanged: entry.locallyChanged,
        });
      });
    });
  });
  entries.set(key, entry);
  return entry;
}

export async function acquirePageDocument(userId: string, pageId: string) {
  const key = cacheKey(userId, pageId);
  let entry = entries.get(key);
  if (!entry) {
    let promise = opening.get(key);
    if (!promise) {
      promise = createEntry(userId, pageId, key);
      opening.set(key, promise);
      void promise.then(
        () => opening.delete(key),
        () => opening.delete(key),
      );
    }
    entry = await promise;
  }
  entry.references += 1;
  entry.lastUsedAt = Date.now();
  return entry;
}

export function releasePageDocument(entry: PageDocumentEntry) {
  entry.references = Math.max(0, entry.references - 1);
  entry.lastUsedAt = Date.now();
  void trimMemoryCache();
}

export async function rememberPageDetail(
  entry: PageDocumentEntry,
  detail: unknown,
  workspaceId: string | null,
) {
  entry.detail = detail;
  await queueWrite(entry, async () => {
    const previous = await db.pages.get(entry.key);
    await db.pages.put({
      key: entry.key,
      userId: entry.userId,
      pageId: entry.pageId,
      workspaceId,
      detail,
      updatedAt: Date.now(),
      bytes: previous?.bytes ?? 0,
      locallyChanged: entry.locallyChanged,
    });
  });
}

export async function clearPageCacheForUser(userId: string) {
  const keys = await db.pages.where("userId").equals(userId).primaryKeys();
  for (const key of keys) {
    const entry = entries.get(key);
    if (entry) {
      await entry.flush();
      entry.document.destroy();
      entries.delete(key);
    }
  }
  await db.transaction("rw", db.pages, db.updates, async () => {
    await db.updates.where("key").anyOf(keys).delete();
    await db.pages.bulkDelete(keys);
  });
}

async function trimMemoryCache() {
  if (entries.size <= MEMORY_LIMIT) return;
  const candidates = [...entries.values()]
    .filter((entry) => entry.references === 0 && !entry.locallyChanged)
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  while (entries.size > MEMORY_LIMIT && candidates.length) {
    const entry = candidates.shift()!;
    await entry.flush();
    if (entry.references || entry.pendingWrites) continue;
    entry.document.destroy();
    entries.delete(entry.key);
  }
}
