# Shared client entity cache

Status: accepted; consumer migration is not yet implemented.

## Context

Page detail, navigation, database bootstrap/windows and persisted page-read
snapshots independently contain mutable copies of the same entities. Page writes
patch whole Query snapshots and restore them on rejection. Database writes keep
sparse intentions over each snapshot and refetch after acknowledgement. Neither
flow provides one confirmed client owner across page and database surfaces.

## Decision

One deployment/account/workspace/capability-scoped session owns typed TanStack DB
collections. Query owns HTTP orchestration and authoritative result references,
counts, continuation state and contextual derived data. Domain schemas and
actions stay beside their features; collection lifecycle, validated ingestion,
publication and command confirmation belong in `packages/features/src/data`.
The foundation remains uninstalled until coherent consumer cutovers are ready.

Reuse existing command routes, receipts, PostgreSQL entities, database rooms and
Yjs. There is no new backend synchronization architecture, global clock,
offline entity persistence or production provider. Writes remain online-only.
Library-supported optimistic transactions replace custom entity projections;
command identity and uncertain-delivery coordination remain application concerns.
Validated acknowledgement ends saving, independently of synchronization health.

Normalize property definitions by page-property ID, bindings by database-property
ID, and values by the persisted unique page/property pair. Separate host-specific
source-link position from shared source metadata. Relations resolve canonical
references; select values retain their current persistence convention.

Partial input cannot erase omitted fields. Tombstones, query exclusion, source
unlinking and access loss are distinct operations. Use host/source/actor clocks
only inside their actual scope. Where no shared clock applies, existing entity
timestamps must be made strictly increasing at the writer before stale-read
protection is claimed. Arrival time is never authoritative ordering.

Retire the workspace navigation socket, its event producers and Node/ticket flow.
The writer updates every mounted reference through the shared entities. Database
collaborators remain live on existing database sockets. Other clients' page,
hierarchy and access changes recover on focus/reopen/explicit authorized reads.
Keep the Cloudflare class export and migration declarations until a separately
requested release cleanup; no deployment is authorized by this decision.

## Alternatives

Independent Query patches require updating and rolling back every response shape.
An eager Query Collection combining partial endpoints can interpret one result
as the entire collection. A custom confirmed entity map duplicates TanStack DB.
A new journal/provider/live-query service expands a client ownership change into
backend synchronization. These alternatives are rejected.

## Consequences

Filtered results still require targeted authoritative reads when membership,
counts, ordering or replacement rows can change. A partially loaded collection
cannot determine a complete server result. Socket payload admission must respect
source/facet authorization, not merely host membership. Rich text and presence
retain separate owners. Breaking client/server payload updates are acceptable;
production data resets and deployment remain outside this task.

The [ownership inventory and acceptance contract](../../docs/data/shared-client-cache.md)
records migration destinations, proof gates and the local baseline. Existing
[database ownership](../features/databases/README.md) remains active until cutover.
