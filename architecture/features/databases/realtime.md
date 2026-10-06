# Database mutation and realtime flow

The shared feature package publishes the runtime-validated [protocol-v2 database contracts](../../../packages/features/src/databases/core/entities.ts) for entity bootstrap, bounded record windows, idempotent commands, complete-entity changesets, and typed protocol conflicts. Command traffic and internal producers—including automations, imports, templates, and relation-driven writes—journal the same v2 event shape. Linked-host events share the originating command ID while retaining a contiguous version per host.

[Realtime persistence and outbox](../../../apps/server/src/features/databases/realtime) coordinate committed mutations with eventual publication. Outbox rows reference the canonical journal event and contain delivery and lease state, not a duplicate event payload. Oversized changes become `requiresReset`; producers otherwise emit complete typed entities, never partial patches. Node and Cloudflare delivery publish protocol v2 only. The [Node attachment](../../../packages/runtime-adapter/src/node/features/database-realtime/database-realtime-runtime.ts) owns websocket handling and always publishes local-first through the required shared Redis/Valkey bus; its instance ID suppresses the process's Redis echo.

After the database transaction commits, command and internal mutation paths enqueue only `realtime.database` background tasks. They never call Redis, a Durable Object, or a WebSocket broadcaster directly. Queue/notification failure does not reject an acknowledged mutation: the undelivered outbox reference remains available to the normal recovery sweep.

Command and internal events now include source revisions in their existing
`changes` JSON. [Source-clock projection](../../../apps/server/src/features/databases/core/source-clocks.ts)
includes only lanes represented in that event, so a transfer's other reserved
lanes are not disclosed. The existing journal and outbox retain these clocks.
Property confirmations carry definition lifecycle state; archive excludes the
binding from results while retaining its canonical definition tombstone.

Database tickets include source IDs authorized through the same linked-source
filter as bootstrap reads. Both [Node delivery](../../../packages/runtime-adapter/src/node/features/database-realtime/database-realtime-runtime.ts)
and the existing [Worker room](../../../packages/runtime-adapter/src/worker/features/database-realtime/database-collaboration-room.ts)
apply the shared [delivery scope guard](../../../packages/features/src/databases/realtime/room-protocol.ts)
per peer. A mutation representing a source outside the ticket scope becomes an
empty `requiresReset` hint with no source identity or entity payload. Ticket
refresh reevaluates source grants. This changes the signed ticket contract and
requires coordinated server/runtime rollout; no new room or provider is added.
The installed collection normalizer requires authorized source reads before
admitting entities. All database layouts and page labels resolve ingested records;
targeted recovery reads preserve server-owned result membership and ordering.

The [mutation history service](../../../apps/server/src/features/databases/history/service.ts) remains server-only: it serves contiguous events after a client version in pages of at most 500, but the installed client never calls `GET /mutations`. A missing version, malformed event, future client version, expired history, or journal reset marker returns `resetRequired` without applying a partial sequence. Cleanup retains all events from the last seven days and at least the newest 10,000 events per database, and removes expired command receipts. Client recovery uses existing authorized bootstrap, window, property and export reads.

Every database websocket server frame uses protocol version `2`, including
`realtime.ready`, `presence.update`, `presence.clear`, and
`database.mutation`. The ready frame exposes `databaseVersion`, which the
client treats as a poke: when it exceeds the minimum cached version for that
host, the client invalidates the host `["db", …]` queries plus matching
page-properties and the context export, then refetches. The ticket HTTP
`version` is ignored for resync and never suppresses a poke. Clients close and
reconnect when a known database frame has another protocol version instead of
silently accepting presence while dropping mutations. Reconnect backoff resets
only after a valid `realtime.ready` frame. Receiving an HTTP ticket does not
prove that its WebSocket endpoint accepted the ticket; repeated upgrade
failures continue backing off rather than restarting the shortest retry delay.

Validated `database.mutation` facets are ingested into the shared collections
within proven host/source scope. Unknown-source payloads and resets require
recovery reads. Known record content and definition updates publish without a host poke.

[Confirmed publication](../../../packages/features/src/databases/cache-publication.ts)
also reaches existing same-workspace capability owners that have established host
interest. Each owner independently validates source, row and property admission;
one scope cannot borrow another scope's authorization. A narrower scope that
cannot admit an event uses its own authorized recovery reads. Cross-scope
publication shares the React publication gate, while private receipts and page
preferences stay in their captured scope. Page metadata confirmations propagate
only to already-admitted page references in other capability owners.
Dependent filter/sort/formula windows refresh selectively; structural record membership
changes recover through affected server reads. Known presentation fields and
source/binding/view references update within their cache scope; unknown-source
membership needs an authorized bootstrap.
A page-property read admits only its specific rows and exposed definitions; it
does not authorize other source rows. Presence only touches in-memory collaborators
and `cellPresenceByKey`. The [title dependency refresh](../../../packages/features/src/databases/queries/page-membership.ts)
restricts acknowledged title-only edits to window reads whose filters/sorts use
names or potentially dependent computed properties; ordinary title acknowledgements
need no page/navigation/bootstrap refetch.

[Database overview](README.md). [Operations and troubleshooting](../../../docs/databases/operations.md).

Transport exhaustion marks the delivery outbox failed through the [feature hook](../../../apps/server/src/features/databases/realtime/background.ts). Drains ignore failed rows. The committed mutation journal and acknowledged domain writes remain unchanged; replay requires an explicit eligible operator action.
