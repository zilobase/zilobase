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

Server mail code imports the published contracts, organization and predicate modules directly, so pure mail operations do not load React Query through the mail entrypoint. Authentication client declarations live in shared/auth-client; the React provider re-exports their type. Query keys, query options, polling and invalidation behavior are unchanged.

Web TypeScript and Vite resolve shared feature subpaths through the package export map. They no longer assume every subpath names a directory with index.ts; explicit contract and React entrypoints resolve consistently in typechecking and production builds.

See [page-context and editor utility ownership](page-context-and-editor-utilities.md) for conversion invariants, structural content, splitter behavior and comment anchors.

The `@zilobase/features/databases/appearance` entrypoint provides pure stored-config decisions for database lock state, emoji and cover. Navigation/library models can consume appearance without React bindings.

The `@zilobase/features/calendar-layout` [entrypoint](../../packages/features/src/calendar-layout/index.ts) exposes provider-independent date, timezone and layout functions. The Calendar entrypoint re-exports the subset used by provider-aware consumers directly from that implementation.
The layout index preserves day-array identity for unchanged memberships, normalizes immutable timing through weak references, and uses heap-based timed overlap placement. Its pure tests cover DST, exclusive boundaries and dense overlap inputs.
