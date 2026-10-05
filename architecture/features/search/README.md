# Search

## Owning modules and interface

- [apps/server/src/features/search](../../../apps/server/src/features/search)
- [packages/features/src/search](../../../packages/features/src/search)
- [apps/web/src/features/search/app-search.tsx](../../../apps/web/src/features/search/app-search.tsx)

## Main flow

searchWorkspaceItems normalizes a query and searches indexed content, returning page/database navigation results and excerpts. Shared queries connect the [search feature interface](../../../apps/web/src/features/search/index.ts) to server routes. App composition mounts the search provider; the sidebar consumes only its open-search command. The provider keeps its 250ms debounce, shortcut, dialog and query lifecycle. A [pure result model](../../../apps/web/src/features/search/search-results.ts) combines matching agents before server results and resolves page/database/agent destinations, including clearing a database view selection. Search presentation does not own persistence. After permission checks the server reads current page/host metadata with storage clocks; index ranking and excerpts remain unchanged. The [reference normalizer](../../../packages/features/src/search/references.ts) validates the entire authorized result before publication. Query stores destinations, snippets and ordered references; mounted search and picker hooks resolve canonical titles and icons.

## Authorization and persistence

Search documents are persisted in Postgres. The implementation filters accessible pages and database results using membership and resource access; search must not disclose inaccessible titles or excerpts.

## Side effects, failures and recovery

Query limits and excerpt marker handling are part of the result interface. Empty/normalized queries and stale or removed content must preserve current behavior.

## Verification and change points

[Search result tests](../../../apps/web/test/features/search/search-results.test.mjs) cover agent filtering/order and destinations. Start with [the existing tests or model](../../../apps/server/src/features/search/workspace-search.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
