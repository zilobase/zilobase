# Query-hashed database windows

Status: accepted and implemented.

## Context

Record windows were keyed by `viewId`
(`packages/features/src/databases/queries/keys.ts`). Every view switch was a
new cache entry, a new `GET /records`, and a skeleton, even when the sibling
view evaluated the same rows (table vs. kanban with identical filters). The
server already evaluates filters/sorts before slicing
(`apps/server/src/features/databases/read/service.ts`), and the client
re-applies them for realtime coherence, so the per-view fetch bought no
correctness — only latency. There are no users, so the key change ships as a
clean break with no migration.

## Decision

A view config splits into query (normalized filters, sorts, deleted-rows
flag) and presentation (type, grouping, visibility, layout, colors). Cache
identity is `(host, dataSourceId, queryHash, includeDeleted)` via
`databaseViewQueryHash` (`packages/features/src/databases/views/query-hash.ts`);
`viewId` remains the server-side evaluation selector in `recordWindowPath` but
never the cache key. Sibling views with equal hashes share one window;
different data sources always fetch separately.

Switching views within one source keeps the previous window as placeholder
data (`selectSameSourcePlaceholder`); rows from another source are never
reused as placeholder. Tabs prefetch on hover/focus and same-source siblings
prefetch when idle (`prefetchDatabaseWindow`), skipping cached windows.
Invalidation, poke comparison, `WINDOW_STALE` retry, and prefer-newest guards
are unchanged — they operate on the `["db", sessionId, hostId]` prefix, which
is preserved.

## Alternatives

Keeping per-view keys preserves the skeleton on every switch. Full
client-side evaluation (fetch raw rows once, filter locally) gives wrong
pagination once the row set exceeds the window. A server `queryHash` parameter
would decouple fetch identity too but needs validation and versioning for no
v1 benefit.

## Consequences

Same-query view switches issue zero `/records` calls and show no skeleton.
New filter/sort combinations fetch once, then share. Large-database
pagination and `totalCount` stay server-evaluated and correct.

## Amendment: setup dialog waits for settled data

Unloaded and placeholder windows always compute `hasContent === false`, so
the automatic setup dialog (`shouldUseDatabaseSetupMode`) must wait for the
active hash's real result: bootstrap success plus record success without
placeholder data. Emptiness cannot be judged before load, and background
refetches keep settled (non-placeholder) data, so an already-correct dialog
never flickers. Explicitly user-opened data-source setup is unaffected.

See the [database architecture](../features/databases/README.md) and the
[record window queries](../../packages/features/src/databases/queries/records.ts).
