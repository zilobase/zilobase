import type { QueryClient } from "@tanstack/react-query";
import {
  databaseBootstrapResponseSchema,
  databaseRecordWindowResponseSchema,
} from "@zilobase/features/databases";

import {
  deletePageSnapshots,
  readPageSnapshots,
  rememberPageSnapshot,
  type CachedPageSnapshot,
} from "@/features/editor/collaboration/page-document-cache";

const SESSION_KEY = "$session";

type ReadSnapshot = {
  scope: string;
  queryKey: unknown[];
  data: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function snapshotOf(
  queryKey: readonly unknown[],
  data: unknown,
  sessionId: string,
): ReadSnapshot | null {
  const key = [...queryKey];
  if (key[0] === "meetings" && key[1] === "list" && typeof key[2] === "string") {
    if (!isObject(data) || !Array.isArray(data.meetings)) return null;
    return { scope: `workspace:${key[2]}`, queryKey: key, data };
  }
  if (key[0] === "user-settings" && key.length === 1) {
    if (!isObject(data)) return null;
    return { scope: "user", queryKey: key, data };
  }
  if (
    key[0] === "page-layouts" &&
    key[1] === "resolved" &&
    typeof key[2] === "string" &&
    key[2] !== "none"
  ) {
    if (!isObject(data) || !isObject(data.config) || data.pageId !== key[2]) return null;
    return { scope: `page:${key[2]}`, queryKey: key, data };
  }
  if (key[0] === "page" && typeof key[1] === "string" && key[1] !== "none") {
    if (
      key[2] === "properties" &&
      isObject(data) &&
      Array.isArray(data.properties) &&
      Array.isArray(data.values)
    ) {
      return { scope: `page:${key[1]}`, queryKey: key, data };
    }
    if (
      key[2] === "access-targets" &&
      isObject(data) &&
      Array.isArray(data.guests) &&
      Array.isArray(data.members)
    ) {
      return { scope: `page:${key[1]}`, queryKey: key, data };
    }
  }
  if (key[0] !== "db" || key[1] !== sessionId || typeof key[2] !== "string") return null;
  if (key[3] === "bootstrap") {
    const parsed = databaseBootstrapResponseSchema.safeParse(data);
    if (!parsed.success || parsed.data.database.id !== key[2]) return null;
  } else if (key[3] === "window") {
    if (!isObject(data) || !Array.isArray(data.pages) || !Array.isArray(data.pageParams))
      return null;
    const first = databaseRecordWindowResponseSchema.safeParse(data.pages[0]);
    if (!first.success || first.data.queryHash !== key[5]) return null;
    // Persist only the first bounded window; continuation pages remain live reads.
    data = { pages: [first.data], pageParams: [data.pageParams[0]] };
  } else {
    return null;
  }
  key[1] = SESSION_KEY;
  return { scope: `database:${key[2]}`, queryKey: key, data };
}

function restoredKey(snapshot: CachedPageSnapshot, sessionId: string): unknown[] | null {
  const key = snapshot.queryKey;
  if (!Array.isArray(key)) return null;
  if (key[0] !== "db") return key;
  if (key[1] !== SESSION_KEY) return null;
  return [key[0], sessionId, ...key.slice(2)];
}

export async function hydratePageReadCache(input: {
  queryClient: QueryClient;
  userId: string;
  sessionId: string;
  pageId: string;
  workspaceId: string | null;
  databaseIds: string[];
}) {
  const { queryClient, userId, sessionId, pageId, workspaceId, databaseIds } = input;
  const scopes = ["user", `page:${pageId}`, ...databaseIds.map((id) => `database:${id}`)];
  if (workspaceId) scopes.push(`workspace:${workspaceId}`);
  const snapshots = await readPageSnapshots(userId, scopes);
  for (const snapshot of snapshots) {
    const key = restoredKey(snapshot, sessionId);
    if (!key || !snapshotOf(key, snapshot.data, sessionId)) continue;
    const existing = queryClient.getQueryState(key);
    if (existing?.dataUpdatedAt && existing.dataUpdatedAt >= snapshot.updatedAt) continue;
    queryClient.setQueryData(key, snapshot.data, { updatedAt: snapshot.updatedAt });
    void queryClient.invalidateQueries({ queryKey: key, exact: true, refetchType: "none" });
  }
}

export function subscribePageReadCache(
  queryClient: QueryClient,
  userId: string,
  sessionId: string,
) {
  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    if (event.action.type === "error") {
      const error = event.action.error;
      const status = isObject(error) ? error.status : null;
      if (status !== 401 && status !== 403 && status !== 404) return;
      const key = event.query.queryKey;
      const scope =
        key[0] === "db" && key[1] === sessionId && typeof key[2] === "string"
          ? `database:${key[2]}`
          : key[0] === "page" && typeof key[1] === "string"
            ? `page:${key[1]}`
            : null;
      if (!scope) return;
      void deletePageSnapshots(userId, [scope]).catch(() => undefined);
      queryClient.removeQueries({ queryKey: key, exact: true });
      return;
    }
    if (event.action.type !== "success" || event.action.manual) return;
    const { queryKey, state } = event.query;
    const snapshot = snapshotOf(queryKey, state.data, sessionId);
    if (!snapshot) return;
    void rememberPageSnapshot(
      userId,
      snapshot.scope,
      snapshot.queryKey,
      snapshot.data,
      state.dataUpdatedAt,
    ).catch(() => undefined);
  });
}
