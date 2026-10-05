# Shared packages

## Interface and flow

Shared feature modules contain contracts, pure transformations, client queries and React bindings. Page-context supplies structural page/markdown conversion; html-to-page converts sanitized webpage HTML into Tiptap JSON for clips; the splitter and comment extension retain focused editor responsibilities.

Start at the [entrypoint](../../packages/features/package.json); follow the [implementation](../../packages/features/src), [page-context](../../packages/page-context/src) and [html-to-page](../../packages/html-to-page/src).

## Invariants and failure handling

Package export maps are published interfaces. The package root owns only the provider and query-client bootstrap. Feature roots expose contracts and pure query builders; React hooks are exported through explicit feature `/react` entrypoints. Server callers use contracts and pure entrypoints without importing React bindings.

## Verification

See [tests or test configuration](../../packages/page-context/package.json) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).

## Contracts and React bindings

Canonical data declarations live in each feature's contracts module. Query modules export query keys/options rather than redeclaring or re-exporting contracts. Feature roots expose those contracts and pure helpers, while the `/react` entrypoints own hooks. The former mixed feature/root barrels and duplicate page-mutation barrel are removed.

Query option factories keep each key beside its fetcher and forward TanStack Query's cancellation signal through provider transports when the request lifetime is owned entirely by observers. Session, workspace-list, page-detail and page-navigation queries are also awaited imperatively by router guards, so they intentionally do not consume an observer-owned signal; detaching the last React observer must not cancel the router's shared promise. Mutation lifecycle callbacks return their cache invalidation promises when callers must remain pending until server-backed views converge; explicitly best-effort realtime, navigation and already-committed embed refreshes retain fire-and-forget handling with local failure policy.

Authentication client declarations live in shared/auth-client; the React provider re-exports their type.

Web TypeScript and Vite resolve shared feature subpaths through the package export map. They no longer assume every subpath names a directory with index.ts; explicit contract and React entrypoints resolve consistently in typechecking and production builds.

See [page-context and editor utility ownership](page-context-and-editor-utilities.md) for conversion invariants, structural content, splitter behavior and comment anchors.

The `@zilobase/features/databases/appearance` entrypoint provides pure stored-config decisions for database lock state, emoji and cover. Navigation/library models can consume appearance without React bindings.
The database feature root likewise exports data contracts, query builders and pure model helpers; its session provider and hooks belong to `@zilobase/features/databases/react`.

## Shared data preparation

The [data entrypoint](../../packages/features/src/data/index.ts) exposes an
uninstalled session/collection foundation. Its [React entrypoint](../../packages/features/src/data/react.ts)
subscribes to key-specific coherent session publications. Domain fixture schemas
remain in pages and database schema modules. No application consumer imports the
foundation yet, so QueryClient/controller ownership above remains active.

[DataSession](../../packages/features/src/data/session.ts) uses a TanStack DB client
transaction scope per deployment/viewer/workspace session and disposes registered
collections. [EntityCollection](../../packages/features/src/data/collection.ts)
validates staged merges against the library's public authoritative `base` rows,
never optimistic rows. It commits prepared inputs using the supported custom-sync
writer. Immediate commits are used for direct authoritative ingestion; this
adapter does not implement a subset loader. Unexpected deferred commit receipts
fail the synchronous publication proof instead of accessing library internals.

The [clock contract](../../packages/features/src/data/clock.ts) compares only the
same entity, source, host or actor lane. Per-field coverage and removal barriers
live in the supported sync metadata API. Batch preparation uses transient drafts
to combine repeated identities before any writes; it rechecks current base rows
when applying staged responses. Domain-declared partial objects preserve covered
metadata fields. Session snapshots reject reads during publication.

[Database normalization](../../packages/features/src/databases/cache.ts) separates
hosts, sources, source links, definitions, bindings, persisted value pairs and
record references. Bootstrap/window returns contain ordered IDs and server counts,
hashes and snapshots. Known source grants come from authorized bootstrap reads;
unknown socket sources request another authorized read. These adapters remain
uninstalled, so they do not yet own Query results in the application.

[Publication](../../packages/features/src/data/publication.ts) batches key callbacks
across collection commits without storing confirmed entity values. Feature owners
may access collections for supported transactions; feature UI uses hooks/actions.
The [foundation proofs](../../packages/features/src/data/collection.test.ts) exercise
partial/empty inputs, authoritative base isolation, rollback, acknowledgement,
conflicting preview retirement and session disposal. The [mounted browser fixture](../../scripts/data/test-cache-browser.mjs) proves three
React consumers and a page/property join see completed publications. These isolated
proofs do not establish migrated application timing or network behavior.

The `@zilobase/features/calendar-layout` [entrypoint](../../packages/features/src/calendar-layout/index.ts) exposes provider-independent date, timezone and layout functions. The Calendar entrypoint re-exports the subset used by provider-aware consumers directly from that implementation.
The layout index preserves day-array identity for unchanged memberships, normalizes immutable timing through weak references, and uses heap-based timed overlap placement. Its pure tests cover DST, exclusive boundaries and dense overlap inputs.
