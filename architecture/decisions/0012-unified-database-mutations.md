# Unified database mutation ownership

Status: accepted; implementation cutover in progress. Extends ADR 0011 to all database writes.

## Decision

One session-owned controller owns submission, dependency scheduling, pending state,
receipt retry and reconciliation for records, metadata, lifecycle and access actions.
Domain handlers remain separate. QueryClient stores server snapshots; speculative
effects are projected outside the cache. Configuration intentions change individual
paths rather than replace unrelated fields. The canonical configuration operations
and exhaustive command policy live in the shared database interactions module.

Reliable previews are immediate. Permission changes and server-derived transformations
remain pending until confirmed. Unknown delivery is not rejection; retry preserves the
command ID and body. The client remains online-only, without persisted pending writes.

## Alternatives and consequences

Separate metadata queues and cache rollback snapshots can regress newer edits and
cannot coordinate schema changes with records. A single global FIFO unnecessarily
blocks unrelated databases. A replicated offline database introduces conflict semantics
outside this product's requirements. The controller instead coordinates affected scopes
and reconciles each consumer against its own confirmed revision.

The client and server ship together. No fallback controller, dual-write path or obsolete
write contract is retained. Existing persisted user data is preserved.
