# React Query Optimization And Optimistic UI Plan

## Summary

Optimize TanStack Query usage across Notelab by standardizing query-client defaults, routing cache operations through query-key factories, making high-traffic mutations optimistic with rollback, and tuning freshness/prefetch behavior by data domain.

## Implementation Phases

1. Shared QueryClient policy
   - Use a single `createNotelabQueryClient()` helper for web and mobile.
   - Default queries to `staleTime: 30_000`, `gcTime: 300_000`, `refetchOnWindowFocus: false`.
   - Retry transient failures once, but never retry 4xx API errors.
   - Keep mutation retry disabled.

2. Query-key hygiene
   - Keep product query keys behind domain factories.
   - Use root/partial-key helpers for broad invalidation and cache scans.
   - Remove raw keys from cache writes and invalidations outside query modules.
   - Normalize missing ids to stable sentinel values.

3. Optimistic UI
   - Cancel affected queries before every optimistic write.
   - Snapshot all touched caches.
   - Roll back every touched cache on error.
   - Reconcile with the server response on success.
   - Prefer targeted invalidation only when server-side cascades cannot be derived locally.

4. Cache contracts
   - Consolidate page nav/detail cache writes behind helpers.
   - Consolidate database payload writes behind helpers.
   - Document each mutation as optimistic write, direct reconciliation, targeted invalidation, or query removal.

5. Freshness and performance
   - Tune stale times by domain: auth/session, page nav/detail, database full/schema, comments, chat, search, integrations, settings.
   - Add intent prefetching for sidebar items, search results, and database links.
   - Use `select` for consumers that only need small slices of large payloads.

6. Database pagination
   - Remove fake infinite-query fields from `useDatabase`, or replace them with a real `useInfiniteQuery`.
   - Default to removing the fake API first unless large-row database requirements make infinite loading necessary immediately.

7. Error handling
   - Centralize API error classification.
   - Preserve intentional auth/permission fallbacks.
   - Throw unexpected server errors into query error boundaries.

## Test Plan

- Query-key tests for stable full and partial keys.
- Cache-helper tests for page nav/detail updates.
- Cache-helper tests for database payload updates.
- Optimistic mutation tests for success reconciliation and error rollback.
- Manual regression scenarios for page create/update/favorite/delete, database create/update/favorite/row edits, comments/reactions, org switch, and sign in/out.

## Assumptions

- No backend API changes are required for the first pass.
- Correct rollback is more important than avoiding every refetch.
- Large database infinite loading is deferred until the API/UI contract is explicit.
