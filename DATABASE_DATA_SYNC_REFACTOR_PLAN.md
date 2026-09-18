# Database / Data-Sync — Implementation Plan (Poke-and-Refetch, Breaking)

**Breaking changes are allowed and expected.** This app has **no users** and the database is being **reset entirely**. Do not keep compatibility shims, dual clients, feature flags, old collection stack, migration paths, or “just in case” fallbacks. Delete the old client. Replace it. Update architecture docs in the same change.

**Mental model for the agent — memorize this:**

```
Postgres = notebook (only truth). Clock = database HOST version (integer).

QueryClient = photocopy of notebook (last successful GET). Never truth.

UI shows: draft ?? photocopy.

Write: UI -> useMutation -> POST /databases/:id/commands -> ack -> invalidate -> GET.

Realtime WS = doorbell only. Frame says { databaseId, version }.
  If version > what you already have cached -> invalidate + GET.
  Never apply frame.changes to cache.

Presence WS = who-is-looking (rowId, columnKey, viewId). Memory only. Not data.
```

This document is the **only spec**. Implement it literally. Do not invent extra stores, journals, overlays, `records.byId`, client `/mutations` catch-up, or command lanes. If something is underspecified below, pick the simplest poke-and-refetch behavior, not a new subsystem.

---

## 0. Agent rules (hard constraints)

1. **DELETE, don’t preserve:** `SessionDatabaseClient`, `createDatabaseClient`, `DatabaseClient`, TanStack DB collections (`bootstrap-collections`, `record-collections`), `useLiveQuery` / `useLiveInfiniteQuery`, `command-lanes`, `optimistic-commands`, `event-ingestion`, `snapshot-watermark`, `realtime-client-binding`, `client-lifecycle`, `command-state`, `command-transport`, `pending-navigation`, `database-realtime-cache`, `row-page-properties`.
2. **Do NOT change server protocol:** HTTP paths, `protocolVersion: 2`, ack shape `{ commandId, event, result }`, `database.mutation` frames, `presence.update` / `presence.clear` frames, ticket endpoint, `WINDOW_STALE` / `COMMAND_ID_REUSED` / `ROW_MOVE_CONFLICT` codes. Client only changes how it *uses* them.
3. **Do NOT touch:** mail, calendar, Yjs, nav realtime, Dexie, offline documents.
4. **Do NOT add:** overlay maps, `records.byId` index, client `GET /mutations` catch-up, generic command-lane framework, offline outbox/queue.
5. **Allowed new modules only:** `queries/keys.ts`, `queries/bootstrap.ts`, `queries/records.ts`, `mutations/execute.ts`, `mutations/invalidate.ts`, `mutations/serialize.ts`, `mutations/pending.ts`, `realtime/realtime.ts` (rewrite). Nothing else new without deleting something.
6. **No optimistic cache writes.** No `setQueryData` into `["db", …]` except the `prefer-newest` guard in the queryFn itself (see §3.5). Display own edit via local `draft` state until POST+GET finishes.
7. **One PR, no flag.** Same PR must: delete §8 files, uninstall §9 packages, update call sites §10, add tests §11, update arch docs §12. Do not land with `database-client-v2` or `@tanstack/react-db` still imported.
8. Run §15 verification. Do not claim done if red.

---

## 1. Sources of truth

| Layer | Role | Unsaved data? |
|---|---|---|
| **Postgres** | Only truth. Host `database.version` is the clock. | n/a |
| **QueryClient `["db", …]`** | Last successful `GET /bootstrap` + `GET /records`. | **No** — never write unsaved values here |
| **UI local state** | Cell draft text, drag preview, `isPending` spinner, coalesced queued value | Yes, until POST ack + refetch |
| **Presence memory** | `collaborators`, `cellPresenceByKey` from socket | n/a — not data |

**ID rule (critical):**
- Query root, poke comparison, and invalidate use **database HOST id**.
- `dataSourceId` is only for: window query key segment, `POST …/data-sources/:dataSourceId/commands`, and per-source serialization key. Never as invalidate root.

**Displayed cell rule:**
```tsx
const displayed = draft ?? queryRecord?.valuesByPropertyId?.[propertyId] ?? null;
```
`draft` is `useState` in the cell editor, cleared on POST success + refetch success. No global draft store.

---

## 2. Public contracts (keep hook NAMES, break internals)

UI already imports these names. Keep names + return shapes. Rewrite bodies.

### 2.1 `useDatabaseBootstrap(scope | null)`

Scope type (keep):
```ts
type DatabaseScope = { databaseId: string; includeDeleted?: boolean; viewId?: string | null };
```

Return (keep exactly):
```ts
{
  data?: DatabaseBootstrapResponse;
  error: Error | null;
  refetch: () => Promise<unknown>;
  scope: DatabaseScope | null;
  status: "idle" | "loading" | "success" | "error";
}
```

Implementation:
- `scope === null` → return `{ data: undefined, error: null, refetch: async()=>undefined, scope: null, status: "idle" }`, query `enabled: false`.
- Else `useQuery(databaseBootstrapQueryOptions(apiFetch, sessionId, scope))`.
- `sessionId` from `useDatabaseSessionId()` (see §7). `"public"` when logged out.
- `refetch` = `queryClient.refetchQueries({ exact: true, queryKey })`.
- No `useLiveQuery`. No collection. Validate response with `databaseBootstrapResponseSchema.parse`.

### 2.2 `useDatabaseRecords(scope | null)`

Scope type (keep):
```ts
type DatabaseViewScope = DatabaseScope & { dataSourceId: string; viewId: string };
```

Return (keep exactly):
```ts
{
  error: Error | null;
  fetchNextPage: () => Promise<void>;
  hasMore: boolean;
  isFetchingNextPage: boolean;
  pageSize: 10 | 25 | 50 | 100;
  records: DatabaseRecordEntity[];
  scope: DatabaseViewScope | null;
  status: "idle" | "loading" | "success" | "error";
  totalCount: number;
}
```

Implementation — growing window, same as today’s public path:
- `scope === null` → idle shape with `records: []`, `pageSize: 50`, `hasMore: false`.
- Else `useInfiniteQuery`:
  ```ts
  queryKey = ["db", sessionId, databaseId, "window", dataSourceId, viewId, includeDeleted===true]
  initialPageParam = { limit: pageSize, snapshot: undefined }
  queryFn({ pageParam }) => GET /databases/:databaseId/data-sources/:dataSourceId/records?offset=0&limit={limit}&viewId={viewId}[&includeDeleted=1][&snapshot=...]
    - parse with databaseRecordWindowResponseSchema
    - on 409 WINDOW_STALE (status 409 + body.code === "WINDOW_STALE" or code === "WINDOW_STALE"): retry ONCE with snapshot cleared. If second fails, throw.
    - prefer-newest guard (§3.5): if incoming.databaseVersion < currently cached max for this key, return cached last page instead of regressing (prevents out-of-order GET overwrite).
  getNextPageParam(last) => last.hasMore ? { limit: last.records.length + pageSize, snapshot: last.snapshot } : undefined
  ```
- `pageSize`: read from cached bootstrap for same host+view (`views.find(v=>v.id===viewId)?.config` via `getDatabaseInitialPageSize`), fallback `50`. If bootstrap loads later and pageSize changes, the window key MUST include pageSize? No — keep key stable, use first resolved pageSize for this hook instance. Document: changing view pageSize requires remount / view switch.
- Derive: `latest = data?.pages.at(-1)`, `records = latest?.records ?? []`, `hasMore = latest?.hasMore ?? false`, `totalCount = latest?.totalCount ?? 0`, `fetchNextPage = async()=>{ await fetchNextPage() }`.
- `staleTime: 30_000`. Do not set `refetchOnWindowFocus: true` for windows (avoid storm); leave default.
- Accept over-fetch: invalidating this key refetches all pages. `latest` already contains full window, so extra pages are wasteful but correct. Do NOT optimize now. Future: switch to `useQuery` with `limit=loadedCount`.

### 2.3 Mutation hooks (keep ALL names)

List (every one must be rewritten):
`useAddDatabaseRow`, `useMoveDatabaseRow`, `useUpdateDatabasePropertyValue`, `useArchiveDatabaseRow`, `useRestoreDatabaseRow`, `useAddDatabaseView`, `useUpdateDatabaseView`, `useDeleteDatabaseView`, `useAddDatabaseProperty`, `useUpdateDatabaseProperty`, `useDeleteDatabaseProperty`, `useDuplicateDatabaseProperty`, `useApplyDatabaseTemplate`, template create/update/archive/restore, database create/update, data-source link/create/unlink/update.

Pattern for EVERY hook:
```ts
export function useUpdateDatabasePropertyValue() {
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const sessionId = useDatabaseSessionId();
  return useMutation({
    mutationFn: async (input: { databaseId: string; hostDatabaseId?: string; propertyId: string; ... }) => {
      const scope = await resolveDataSourceCommandScope(queryClient, apiFetch, input.databaseId, input.hostDatabaseId);
      // serialize per key (see §4.4), then:
      const ack = await executeDatabaseCommand(apiFetch, {
        databaseId: scope.hostDatabaseId,
        dataSourceId: scope.dataSourceId, // omit for host-only commands
        command: { type: "...", ... },
      });
      return { ack, scope };
    },
    onSuccess: ({ scope }) => {
      invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
      // row.create with pageId: also invalidate ["pages"] in background, never reject commit (see §10)
    },
  });
}
```
- No `useDatabaseClient`. No `client.execute`.
- Host-only commands (`database.update`, `dataSource.create/link/unlink`, `view.*`): `dataSourceId` omitted, POST to `/databases/:host/commands`.
- Source commands: POST to `/databases/:host/data-sources/:source/commands`.
- After success ALWAYS `invalidateDatabaseQueries`. No ack-patch to cache.

### 2.4 `useDatabaseRealtime(databaseId, { enabled, presence, publishPresence })`

Keep signature + return `{ collaborators, cellPresenceByKey, status }`.

- Data plane: poke-only. On `database.mutation` read `event.databaseId + event.version`. On `realtime.ready` read `message.databaseId + message.databaseVersion`. If `version > cachedVersion(queryClient, sessionId, hostId)` → `invalidateDatabaseQueries` + invalidate matching page-properties (see §3.4). Else ignore. **Ignore `event.changes`, `event.areas`, `requiresReset` payload — version bump already covers it.**
- Ticket HTTP `version`: ignore for resync. Never suppress poke because of ticket.
- Presence plane: unchanged. `presence.update` / `presence.clear` only touch in-memory `collaborators` / `cellPresenceByKey`. Never QueryClient.
- `enabled === false` or `databaseId == null` → return offline snapshot, no socket.

### 2.5 `useDatabaseEntityCommandState(target)`

Target (keep): `{ hostDatabaseId?: string; dataSourceId?: string; viewId?: string; rowId?: string; propertyId?: string }`.

State (keep): `{ error: Error | null; isPending: boolean; pendingCount: number }`.

Implementation — **do NOT use `useMutationState`. Build tiny map:**
- New `mutations/pending.ts`: `Map<string, { pendingCount: number; error: Error | null }>` + `Set<listener>` per key. Key = `JSON.stringify([host,source,view,row,prop])`.
- `executeDatabaseCommand` wrapper (`mutations/execute.ts`) increments before POST, decrements on settle, stores last error per key. `useDatabaseEntityCommandState` subscribes via `useSyncExternalStore`.
- Must preserve 4 UI states in `database-save-status.tsx`: `Saving…` (pending), `Save failed` (error generic), `Save unconfirmed — reload to check` (`DatabaseCommandUnconfirmedError`), `Saved — reload to refresh` (`DatabaseReconciliationError` when ack succeeded but refetch failed — see §4.5).
- Failed stays visible until same target succeeds (clear error on next start for that key only, not globally).

### 2.6 `useDatabaseIdForRowPage(pageId, explicitDatabaseId?)`

- If `explicitDatabaseId` truthy → return it immediately.
- Else read page detail `["page", pageId]` → `databaseIds`, and page-properties `["page", pageId, "properties"]` → `databaseIds` + `presenceTargets[].databaseId`. Return first candidate or `null`. **Do NOT scan `["database-client-v2"]`.**
- Documented limitation: multi-homed row pages (linked sources, multiple hosts) REQUIRE `explicitDatabaseId` at call site. Best-effort `[0]` is only fallback. Page-metadata presence already subscribes to ALL `presenceTargets`, so presence still works. Command scope for multi-homed rows must use explicit host (see §10 layout-editor).

### 2.7 Delete these public APIs (breaking, no re-export)

- `useDatabaseClient`, `useOptionalDatabaseClient`
- `SessionDatabaseClient`, `createDatabaseClient`, `DatabaseClient` type
- `useUpdatePagePropertyValue` (`PUT /pages/:id/properties/:prop/value`). Replacement: `useUpdateDatabasePropertyValue` / `cell.set` with resolved host+source+row (see §10 page-metadata). Server PUT route may remain dead; do not call it.

---

## 3. Query keys + invalidation (exact)

```ts
// queries/keys.ts
export const databaseQueryRoot = "db" as const;
export const databaseBootstrapQueryKey = (sessionId: string, scope: { databaseId: string; viewId?: string|null; includeDeleted?: boolean }) =>
  ["db", sessionId, scope.databaseId, "bootstrap", scope.viewId ?? null, scope.includeDeleted === true] as const;

export const databaseWindowQueryKey = (sessionId: string, scope: { databaseId: string; dataSourceId: string; viewId: string; includeDeleted?: boolean }) =>
  ["db", sessionId, scope.databaseId, "window", scope.dataSourceId, scope.viewId, scope.includeDeleted === true] as const;

export const sessionIdForQueries = (authSessionId: string | null | undefined) => authSessionId ?? "public";
```

### 3.1 `invalidateDatabaseQueries(queryClient, sessionId, hostDatabaseId)`

```ts
// mutations/invalidate.ts
export function invalidateDatabaseQueries(queryClient: QueryClient, sessionId: string, hostDatabaseId: string) {
  queryClient.invalidateQueries({ queryKey: ["db", sessionId, hostDatabaseId] });
  // + page-properties whose payload.databaseIds includes host (see §3.4)
  // + context-export for host (see §3.4)
}
```
Host-scoped on purpose. Every `cell.set` refetches all bootstraps + windows for that host. Wasteful with linked sources / many views — **accepted for now** (no users). Do not narrow by area.

### 3.2 Session handling

- `sessionId = auth session id or "public"`. Thin provider (see §7) supplies it. Hooks never import auth directly.
- On session change (login/logout/rotation), provider effect MUST `queryClient.removeQueries({ queryKey: ["db", oldSessionId] })` to avoid cross-account leakage on shared QueryClient. New session starts cold (refetch on mount).

### 3.3 `cachedVersion(queryClient, sessionId, hostId): number`

**Use MIN, not max, not bootstrap-first:**
```ts
export function cachedVersion(queryClient, sessionId, hostId): number {
  const versions: number[] = [];
  for (const [, data] of queryClient.getQueriesData({ queryKey: ["db", sessionId, hostId] })) {
    // bootstrap shape { database: { version } }
    // window shape { databaseVersion } or { pages: [{ databaseVersion }] }
  }
  return versions.length ? Math.min(...versions) : -1;
}
```
Rationale in plain words: if one view is fresh (v10) but another is old (v8), a poke at v9 must still refetch. Max/bootstrap-first would miss it. Min never misses (at cost of extra refetch — fine).

### 3.4 Page-properties + export invalidation

In same `invalidateDatabaseQueries`:
- Scan `queryClient.getQueriesData({ queryKey: ["page"] })`, filter keys where `key[2]==="properties"`, payload `databaseIds?.includes(hostId)` → `invalidateQueries({ exact:true, queryKey })`. Do NOT `setQueryData`/version-patch.
- Also `invalidateQueries({ queryKey: ["database-context-export", hostId] })` (export cache would otherwise stay stale).

### 3.5 Stale-GET guard (prefer-newest, minimal)

Out-of-order GETs (two invalidates, older resolves last) must not regress cache. In `bootstrap.ts` and `records.ts` queryFn AFTER `parse`:
```ts
const cached = queryClient.getQueryData(queryKey);
const cachedV = cached ? versionOf(cached) : -1;
if (incomingVersion < cachedV) return cached; // keep newer, discard stale
return incoming;
```
This is NOT an overlay/ingest system — just a one-line “don’t go backwards” check. Keep it.

---

## 4. Write path (exact)

### 4.1 New `mutations/execute.ts`

```ts
export class DatabaseCommandUnconfirmedError extends Error { ... }
export class OfflineError extends Error { ... }

export async function executeDatabaseCommand(
  apiFetch: ApiFetcher,
  input: { databaseId: string; dataSourceId?: string | null; command: DatabaseCommand },
  opts?: { pendingTarget?: DatabaseCommandTarget; queryClient?: QueryClient }
): Promise<DatabaseCommandAck> {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    throw new OfflineError("You are offline. Reconnect and try your edit again.");

  const commandId = crypto.randomUUID();
  const endpoint = `/databases/${encodeURIComponent(input.databaseId)}` +
    (input.dataSourceId ? `/data-sources/${encodeURIComponent(input.dataSourceId)}/commands` : `/commands`);
  // Serialize ONCE — receipt replay requires identical ID + body
  const body = JSON.stringify({ command: input.command, commandId, protocolVersion: 2 });

  // pending map increment here if opts provided
  for (let attempt = 0; ; attempt++) {
    let raw: unknown;
    try {
      raw = await apiFetch(endpoint, { method: "POST", body });
    } catch (e) {
      if (!isRetryable(e)) throw e; // 4xx (except 408), COMMAND_ID_REUSED, ROW_MOVE_CONFLICT, offline
      if (attempt === 0 && (typeof navigator === "undefined" || navigator.onLine !== false)) continue; // retry once same body
      throw new DatabaseCommandUnconfirmedError(e); // committed-or-not unknown
    }
    try {
      const ack = databaseCommandAckSchema.parse(raw);
      if (ack.commandId !== commandId || ack.event.commandId !== commandId)
        throw new Error("ack id mismatch");
      if (ack.event.databaseId !== input.databaseId) throw new Error("ack scope mismatch");
      if (input.dataSourceId && ack.event.dataSourceId !== input.dataSourceId)
        throw new Error("ack scope mismatch");
      return ack;
    } catch (e) {
      throw new DatabaseCommandUnconfirmedError(e);
    }
  }
}
function isRetryable(e: unknown) {
  if (e instanceof TypeError) return true; // network down
  const s = (e as any)?.status;
  return s === 408 || (typeof s === "number" && s >= 500);
}
```
Rules:
- Retry exactly once, same `commandId` + same `body` string. Never regenerate ID on retry (idempotency).
- `409 COMMAND_ID_REUSED`, `409 ROW_MOVE_CONFLICT`, other 4xx: do NOT retry, throw as-is.
- `OFFLINE`: throw before POST, do not POST.
- Ack validation failures → `Unconfirmed` (server may have committed).

### 4.2 After success (caller job)

```ts
const { ack, scope } = await execute...;
invalidateDatabaseQueries(queryClient, sessionId, scope.hostDatabaseId);
```
- **No ack-patch to `["db"]` cache.** Pure invalidate → GET converges filters, sorts, formulas, grouping, counts. Own edit stays visible via local `draft` until refetch.
- On 4xx: cache untouched, surface error to caller (`notify.error`).
- On `ROW_MOVE_CONFLICT`: `invalidateDatabaseQueries(host)` + tell user “Order changed — try again”. Drop any queued move for that source.
- Row create with `pageId`: `queryClient.invalidateQueries({ queryKey: ["pages"] }).catch(()=>{})` in background — must never reject the already-committed row.

### 4.3 Scope resolution (rewrite `command-scope.ts` for new keys)

Keep function name `resolveDataSourceCommandScope(queryClient, apiFetch, databaseOrSourceId, explicitHostId?)`:
1. If `explicitHostId` → `{ hostDatabaseId: explicitHostId, dataSourceId: databaseOrSourceId }`.
2. Else scan `getQueriesData({ queryKey: ["db", sessionId] })` for bootstrap payloads where `dataSources.some(s=>s.id===databaseOrSourceId)` → host found. Or where `database.id===databaseOrSourceId` → use its `dataSources[0]`.
3. Else `GET /databases/:id/bootstrap` → parse → `dataSources[0]`. Throw if none.
4. For `cell.set` from page-metadata (no source in presenceTarget): first try cached windows for record `id===rowId` → `dataSourceId`; then bootstrap `dataSources[0]`; then throw. See §10.

### 4.4 Serialization (minimal, NOT old lanes)

New `mutations/serialize.ts` — tiny keyed queue, no framework:

```ts
const tails = new Map<string, Promise<void>>();
export function runSerialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const next = prev.catch(()=>{}).then(fn);
  tails.set(key, next.catch(()=>{}).then(()=>{ if (tails.get(key)===wrapped) tails.delete(key); }));
}
```
Keys:
- `cell:{source}:{row}:{prop}` → with coalesce: if one in flight, store latest value, send when done. Max 1 in flight + 1 queued. Different cells run parallel.
- `ordering:{source}` → `row.create/move/archive/restore` serialized per source (neighbor anchors depend on order).
- `view:{host}` → `view.*`, `database.update`, link/unlink serialized per host.
- `structural:{source}` → property/template commands serialized per source.

Implement coalesce ONLY for `cell.set` in a shared helper `saveCellValue(...)` used by BOTH `view-commands.ts` and `page-metadata.tsx` (not duplicated in web). Bulk edit / drag-fill call same helper in a loop (still per-cell keys).

### 4.5 Refresh failure (`DatabaseReconciliationError`)

In mutation `onSuccess`, `invalidateDatabaseQueries` is fire-and-forget. If the FOLLOWING refetch fails, the write already committed. Surface as `DatabaseReconciliationError("saved but view could not refresh")` via pending map for that host, so save-status shows “Saved — reload to refresh” instead of lying “saved”. Do not roll back cache.

### 4.6 Offline + beforeunload

- Offline: fail fast (§4.1). No outbox. Save-status shows “Offline — reconnect to save” via `navigator.onLine`.
- `beforeunload`: watch ONLY db pending map (`pendingCount>0` for any db key), not `queryClient.isMutating()`. Add/remove listener dynamically. Replace `pending-navigation.ts` with `mutations/beforeunload.ts`.

### 4.7 AI

Never `setQueryData` into `["db"]`. Page-upsert / nav-delta stay on page/nav keys. No other AI change.

---

## 5. Realtime (poke doorbell, exact)

Keep ONE socket per `(QueryClient, databaseId)`, ref-counted, StrictMode-safe (4s grace on unsubscribe, 60s idle eviction — keep today’s numbers).

| Frame | Action |
|---|---|
| `realtime.ready { databaseId, databaseVersion, peers, sessionId }` | `reconnectAttempt=0`, set collaborators, `status=connected`, start heartbeat, send presence. If `databaseVersion > cachedVersion(...)` → `invalidateDatabaseQueries(host)` + page-props/export |
| `database.mutation { databaseId, version }` | Poke only. If `version > cachedVersion(...)` → invalidate host. **Ignore `changes`, `areas`, `requiresReset` payload.** Never `setQueryData`. |
| `presence.update` / `presence.clear` | Update `collaborators` / `cellPresenceByKey` only |
| ticket `POST …/realtime-ticket → { version, websocketUrl, ... }` | Use URL/token only. `version` ignored for catch-up. 401/403/404 → `unavailable` (stop). Else → backoff retry |
| `GET /mutations` | **Never call.** Leave server route dead. |

Reconnect: `delay = floor(rand * min(30_000, 500*2^attempt))`, `attempt++` per failure, reset ONLY on valid `realtime.ready`. Online/offline + visibility pause/resume as today. Unknown `protocolVersion !== 2` → close socket + warn, reconnect (will get fresh ready).

After poke-invalidate, refetch errors:
- 404 on bootstrap → `removeQueries(["db", sessionId, hostId])` (deleted).
- 403 → keep old cache, surface error (access revoked).
- Else throw to retry on next poke/focus.

Do NOT touch Cloudflare DO / Node room protocol.

---

## 6. Presence (keep)

Shape `{ rowId, columnKey, viewId }`. Same socket, separate handler. Not a lock. Not saved. Not QueryClient. `publishPresence` only when editable + active cell. `cellPresenceByKey` key = `${rowId}:${columnKey}`, dedupe by `user.id`.

---

## 7. Target tree + provider (exact)

```
packages/features/src/databases/
  core/ schema/ views/ access/      # KEEP
  queries/
    keys.ts          # NEW — §3 key fns + cachedVersion + prefer-newest helper
    bootstrap.ts     # NEW — queryOptions + useDatabaseBootstrap
    records.ts       # NEW — useInfiniteQuery + useDatabaseRecords + WINDOW_STALE retry
    query-hooks.ts   # KEEP (access query)
  mutations/
    execute.ts       # NEW — §4.1 + Unconfirmed + Offline errors
    invalidate.ts    # NEW — §3.1 + page-props/export scan
    serialize.ts     # NEW — §4.4 runSerialized + cell coalesce
    pending.ts       # NEW — §2.5 pending/error map + useDatabaseEntityCommandState
    beforeunload.ts  # NEW — §4.6 guard
    rows.ts views.ts properties.ts databases.ts data-sources.ts templates.ts
                     # REWRITE — §2.3 pattern
    mutation-hooks.ts# KEEP barrel (re-export new hooks)
  realtime/
    realtime.ts      # REWRITE — §5 poke + presence, no ingest binding
  records/
    use-database-id-for-row-page.ts  # REWRITE — §2.6, no cache scan
    row-snapshot.ts  # KEEP if still imported, else delete
```

`DbProvider` — shrink to session-only (breaking):
```tsx
// Thin context, NO TanStack DB, NO SessionDatabaseClient
const DatabaseSessionContext = createContext<string|null>(null);
export function DbProvider({ sessionId, children }) {
  // sessionId = auth session id or null
  useEffect(() => { /* on sessionId change, removeQueries old ["db", oldId] */ }, [sessionId]);
  useEffect(() => { /* beforeunload via pending.ts map */ }, []);
  return <DatabaseSessionContext.Provider value={sessionId ?? "public"}>{children}</DatabaseSessionContext.Provider>;
}
export function useDatabaseSessionId(): string { return useContext(...) ?? "public"; }
```
Prefer keeping the `DbProvider` NAME so `app-providers.tsx` barely changes — body replaced. Must NOT construct a client, must NOT wrap in TanStack `DbProvider`.

---

## 8. Delete these files (exact, no leftovers)

```
packages/features/src/databases/client/bootstrap-collections.ts
packages/features/src/databases/client/bootstrap-collections.test.ts
packages/features/src/databases/client/bootstrap-hooks.ts
packages/features/src/databases/client/bootstrap-hooks.test.ts
packages/features/src/databases/client/record-collections.ts
packages/features/src/databases/client/record-collections.test.ts
packages/features/src/databases/client/record-hooks.ts
packages/features/src/databases/client/db-client.ts
packages/features/src/databases/client/db-client.test.ts
packages/features/src/databases/client/optimistic-commands.ts
packages/features/src/databases/client/command-lanes.ts
packages/features/src/databases/client/command-lanes.test.ts
packages/features/src/databases/client/ingestion.test.ts
packages/features/src/databases/client/tanstack-db-smoke.test.ts
packages/features/src/databases/client/realtime-client-binding.ts
packages/features/src/databases/client/realtime-client-binding.test.ts
packages/features/src/databases/client/client-lifecycle.ts
packages/features/src/databases/client/client-lifecycle.test.ts
packages/features/src/databases/client/sync/event-ingestion.ts
packages/features/src/databases/client/sync/event-ingestion.test.ts
packages/features/src/databases/client/sync/snapshot-watermark.ts
packages/features/src/databases/client/commands/command-state.ts
packages/features/src/databases/client/commands/command-state.test.ts
packages/features/src/databases/client/commands/command-transport.ts
packages/features/src/databases/client/commands/command-transport.test.ts
packages/features/src/databases/client/commands/pending-navigation.ts
packages/features/src/pages/database-realtime-cache.ts
packages/features/src/pages/database-realtime-cache.test.ts
packages/features/src/databases/records/row-page-properties.ts
```

After move: rewrite leftover `client/provider.tsx` → thin session provider above (or move to `queries/session.tsx` and delete `client/` dir if empty). Same for `client/command-scope.ts` → move logic to `mutations/scope.ts` with new `["db"]` scan. Delete `client/query-keys.ts`, `client/index.ts` when empty.

`mutations/cache.ts`: delete if only used for created-DB nav; nav refresh stays `invalidateQueries(["pages"])`.

---

## 9. Remove unused packages (exact)

After §8 + §10 have zero imports:

In `packages/features/package.json` remove:
- `@tanstack/react-db`
- `@tanstack/query-db-collection`

Then from repo root:
```
npm uninstall @tanstack/react-db @tanstack/query-db-collection -w @zilobase/features
```

Grep must be zero in app code (exclude `node_modules`, `package-lock.json`):
`@tanstack/react-db`, `@tanstack/query-db-collection`, `@tanstack/db`, `useLiveQuery`, `useLiveInfiniteQuery`, `createCollection`, `queryCollectionOptions`, `SessionDatabaseClient`, `database-client-v2`, `useUpdatePagePropertyValue`.

Keep `@tanstack/react-query`.

---

## 10. Call sites (agent checklist — do ALL)

| File | Exact change |
|---|---|
| `apps/web/src/app/providers/app-providers.tsx` | Keep `<DbProvider sessionId apiFetch queryClient>` JSX, body now thin session-only. No collections. |
| `apps/web/src/features/databases/access/page-metadata.tsx` | Delete `useUpdatePagePropertyValue`. Use shared `saveCellValue({ hostDatabaseId, rowId, propertyId, value })`. Resolve `hostDatabaseId` = `databaseId` prop ?? `presenceTargets[0].databaseId`. Resolve `dataSourceId` via §4.3 (cached window record → bootstrap `[0]`). Keep presence subscriptions for ALL targets. Keep `draftValues` cleared on success. If no target/source → disable edit + `notify.error`. |
| `apps/web/src/features/databases/records/view-commands.ts` | `savePropertyValue` calls shared `saveCellValue` (coalesced, serialized). No local lane. Keep `mutate` vs `mutateAsync` timing. |
| `apps/web/src/features/databases/views/components/database-save-status.tsx` | Keep `useDatabaseEntityCommandState({ hostDatabaseId })`. Render 4 states incl. `Unconfirmed` + `ReconciliationError`. No other change. |
| `packages/features/src/pages/content-mutations.ts` | Delete `useUpdatePagePropertyValue` + `databaseClient.ingest` bypass. Replace `patchDatabaseCachePage` (deleted file) with: after page title/content/metadata success, if `pageDetail.databaseIds.length>0` → `invalidateDatabaseQueries` for each host (via sessionId). Do NOT import `row-page-properties`. |
| `packages/features/src/pages/react.ts`, `mutation-hooks.ts` | Stop exporting `useUpdatePagePropertyValue`. |
| `packages/features/src/shared/item-action-cache.ts` | Replace `databaseClientQueryRoot` scan with `["db", …]` + `["database", …]`? Delete `database-client-v2` branch. Deleted DBs → `removeQueries` with predicate `key[0]==="db" && key.includes(databaseId)`. Keep nav invalidation. |
| `packages/features/src/shared/mutation-runtime.test.ts` | Wrap with thin `DbProvider` (sessionId `"test"`), not old client. |
| `apps/web/src/features/ai/conversations/effects/use-agent-live-effects.ts` | No writes to `["db"]`. Page-upsert / nav-delta stay. |
| `packages/features/src/databases/react.ts` | Export new `useDatabaseBootstrap`, `useDatabaseRecords`, `useDatabaseRealtime`, `useDatabaseEntityCommandState`, `useDatabaseIdForRowPage`, all mutation hooks. Drop `useDatabaseClient`, `useOptionalDatabaseClient`. |
| `apps/web/src/features/pages/layout/layout-editor.tsx` | Pass `explicitDatabaseId` to `useDatabaseIdForRowPage` when known. Else best-effort `[0]` documented. |

Table / kanban / list / gallery / timeline must compile against SAME return shapes (§2.1–2.2). No view-logic change except `savePropertyValue` path.

---

## 11. Tests to write (replace, don’t port)

Delete ingest gap/reset/overlay tests on purpose. New:

- `queries/bootstrap.test.ts` — fetch parses + validates, key includes session/host/view/deleted, `scope=null` → idle, 404 → error (and `removeQueries` path tested in invalidate).
- `queries/records.test.ts` — growing window (`limit` grows, `offset=0`), `pages.at(-1)` flatten, `hasMore/totalCount` from last page, `WINDOW_STALE` retry once without snapshot then throw, prefer-newest guard (stale incoming ignored).
- `mutations/execute.test.ts` — offline throws `OfflineError` without POST; retry-once uses SAME `commandId` + SAME body string on `TypeError`/408/5xx then `Unconfirmed`; 409 `COMMAND_ID_REUSED`/`ROW_MOVE_CONFLICT`/400 do NOT retry; ack id/scope mismatch → `Unconfirmed`.
- `mutations/invalidate.test.ts` — invalidates only `["db", session, host]`, not other host; also invalidates matching `["page", id, "properties"]` + export key.
- `mutations/serialize.test.ts` — same cell key coalesces (1 in flight + 1 queued latest); different cells parallel; ordering per-source serial; view per-host serial.
- `mutations/pending.test.ts` — per-target pendingCount, error sticks until same target succeeds, unrelated success doesn’t clear.
- `realtime/realtime.test.ts` — `version <= cached` → no invalidate; `>` → invalidate host; `database.mutation` never `setQueryData`; presence still builds `cellPresenceByKey`; ticket version ignored; backoff reset only on `realtime.ready`.
- Update `mutations/*.test.ts` helpers for new `["db"]` keys: each mutation POSTs correct endpoint/command + calls invalidate.

---

## 12. Architecture docs (same PR, replace — not append)

- `architecture/features/databases/README.md` — client is QueryClient + poke-and-refetch, not collections. Delete ingest/lane/watermark paragraphs.
- `architecture/features/databases/realtime.md` — WS is poke + presence. No journal catch-up on client. Server journal/outbox now write-only (note future cleanup).
- `architecture/decisions/` — new `0005-poke-and-refetch-database-client.md` superseding `0004`: server protocol stays, client drops TanStack DB. Follow decisions README format.
- `CONTEXT.md` — update `Database projection watermark` (deleted client-side), clarify `Database mutation journal` is server-only for now.
- Check `views-and-properties.md`, `table-interactions.md` for “optimistic rollback” sentences — replace with `draft + isPending + invalidate`.

State: no users, breaking, no dual stack.

---

## 13. Implementation order (do in order, one stack)

1. Add `queries/keys.ts`, `queries/bootstrap.ts`, `queries/records.ts`, `mutations/execute.ts`, `mutations/invalidate.ts`, `mutations/serialize.ts`, `mutations/pending.ts` + tests §11. No UI wiring yet.
2. Point `useDatabaseBootstrap` / `useDatabaseRecords` at new queries. Keep old client files still present but unused by these hooks. Run new tests.
3. Rewrite ALL mutation hooks to `execute + serialize + invalidate`. Delete `useDatabaseClient` imports. Run mutation tests.
4. Rewrite `realtime.ts` to poke/invalidate + presence. Delete ingest binding. Run realtime tests.
5. Page-metadata `cell.set` + shared `saveCellValue`; delete PUT hook export; replace `patchDatabaseCachePage` with host invalidates; delete `database-realtime-cache.ts`.
6. Rewrite save-status (pending map), beforeunload (db-only), `useDatabaseIdForRowPage`, scope (`mutations/scope.ts`), `item-action-cache.ts`.
7. Delete every file in §8. Shrink `DbProvider` to session-only.
8. Uninstall packages §9. Grep clean.
9. Arch docs §12.
10. Verification §15.

Do NOT land a PR importing `@tanstack/react-db`.

---

## 14. Out of scope (explicitly NOT doing)

- Server journal, receipts, outbox, `GET /mutations` route — may remain unused/dead. Future cleanup, not this PR.
- Cloudflare DO / Node room protocol changes.
- Mail, calendar, Yjs, nav sockets, Dexie.
- Full window payloads over WS (only if refetch proves slow later).
- Offline queue / durable browser queue. Online-only. Fail fast.

---

## 15. Verification (exact)

From `zilobase/`:
```
npm run test:databases -w @zilobase/features
npm test -w @zilobase/features -- src/pages
npm run typecheck -w @zilobase/features
npm run typecheck -w @zilobase/web
```

Web DB suites (run whatever exists, at minimum):
```
apps/web/test/features/databases/*.mjs
```

Grep must be empty in source (exclude `node_modules`, `package-lock.json`):
```
@tanstack/react-db
@tanstack/query-db-collection
SessionDatabaseClient
useLiveQuery
useLiveInfiniteQuery
createCollection
queryCollectionOptions
database-client-v2
useUpdatePagePropertyValue
```

---

## 16. Done when (acceptance)

- [ ] One QueryClient copy of bootstrap + windows under `["db", sessionId, hostId, …]`; zero collections
- [ ] One write path: `POST …/commands` via `executeDatabaseCommand` + host invalidate; no `client.execute`
- [ ] Realtime poke (`version > min-cached`) invalidates host; presence still shows cell editors; ticket version ignored; no `GET /mutations` from client
- [ ] Cell edits coalesced per `(source,row,prop)`; moves/views serialized; `ROW_MOVE_CONFLICT` invalidates + notifies; offline fails fast; reload guard is db-only
- [ ] `useUpdatePagePropertyValue` gone; page-metadata uses `cell.set` with resolved source; multi-homed rows require explicit host
- [ ] TanStack DB packages uninstalled; greps clean
- [ ] Arch guides + CONTEXT + new decision `0005` match code
- [ ] All §11 + §15 tests green
- [ ] No dual client, no flag, no shim, no overlay, no lane framework

*No users. DB reset. Break the old client. Do not ship a compatibility layer.*
