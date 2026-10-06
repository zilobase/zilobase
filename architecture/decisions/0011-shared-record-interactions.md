# Shared database record interactions

Status: accepted. Supersedes the row-edit ownership in ADR 0005.

Entity preview/confirmation ownership is superseded by
[ADR 0014](0014-shared-client-entity-cache.md). The installed controller retains
source scheduling, coalescing, temporary placement, identity remapping and receipt
recovery; canonical fields and their optimistic transactions live in collections.
The decision below records the earlier projection model.

## Decision

All views submit sparse record intentions to a session-owned interaction store.
The pure [projection model](../../packages/features/src/databases/interactions/model.ts)
replays position, field, title, hierarchy, insertion and removal effects over
unmodified QueryClient record windows, before view evaluation. Rejection removes
only that intention; it never restores a whole-cache snapshot over later edits.
An acknowledgement retires an effect only for windows at its committed source
version. Source clocks also reconcile linked hosts without exposing other hosts.

The implementation is online-only: no durable browser queue or event journal.
Geometry and pointer previews remain view-local; persistence and post-drop state
do not. Atomic record changes and page placements replace staged drag writes.
Client and server contracts ship together without legacy endpoints or adapters.

## Alternatives and consequences

Per-view drafts caused different latency and rollback behavior. Cache patches
mixed server snapshots with speculation and could be overwritten by refetches.
A full replicated collection would introduce offline conflict semantics that
are not required. Sparse intentions preserve responsive interaction without
making the client another database. Tests must exercise stale sibling windows,
rapid edits, rejected writes, unconfirmed delivery and cross-source placement.
