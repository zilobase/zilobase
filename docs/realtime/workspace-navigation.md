# Workspace navigation realtime

Workspace navigation uses a deliberately small invalidation protocol. The HTTP
navigation endpoint remains authoritative and permission-filtered; realtime
messages never contain page, database, teamspace, hierarchy, or access-rule
data.

## Ownership

- The workspace navigation socket announces structural sidebar changes.
- Database sockets continue to own database rows, cells, schema, views, and
  presence. Navigation also invalidates when a view changes how the database is
  represented in the sidebar.
- Yjs continues to own page document content.
- The AI stream reports progress and patches the initiating client's cache. It
  is not a cross-client consistency channel.

Each authenticated client opens one socket for its active workspace. A server
event contains only `eventId`, `workspaceId`, `committedAt`, `protocolVersion`,
and the `navigation.invalidate` type. The client deduplicates event IDs,
debounces bursts, and invalidates `pagesNavRootQueryKey(workspaceId)`. It also
invalidates after every `navigation.ready`, browser focus, and network recovery,
which repairs messages missed while disconnected.

## Durability and failure behavior

Structural mutations insert `navigation_realtime_outbox` in the same database
transaction as the domain write. The request then attempts immediate delivery.
A failed publication does not fail the HTTP mutation; the outbox records the
attempt and the scheduled drainer retries with bounded exponential backoff.
Delivery is at least once, so duplicate and reordered invalidations are safe.

Node keeps only rooms for workspaces with connected clients. Redis/Valkey is
used for cross-process fanout when configured. Without that bus, realtime is
single-process and reconnect reconciliation remains the safety net.

Hosted transports are supplied by deployment adapters outside this repository.
They preserve the same authenticated workspace-room contract and generic
invalidation payload as the Node transport.

## Event policy

Publish for shared structural changes: page/database creation, sidebar name or
icon changes, move/nest/link/unlink, delete/restore, teamspace changes,
visibility/access changes, and navigation-visible database view changes.

Do not publish for favorites, recents/item visits, ordinary rows or cells, page
body edits, or presence. The initiating client can still patch these local
responses through their existing cache paths.

## Rollout and rollback

1. Apply migration `0064_navigation_realtime_outbox.sql`.
2. Deploy producers and the scheduled drainer; watch backlog age, attempts, and
   `navigation_realtime_*` structured logs.
3. Deploy the Node or hosted-adapter transport and verify workspace isolation.
4. Enable `VITE_FEATURE_NAVIGATION_REALTIME` for a client cohort, then expand.
5. Enable multi-node Node deployments only after Redis/Valkey fanout is proven.

Rollback by disabling `VITE_FEATURE_NAVIGATION_REALTIME` and, if necessary,
removing the transport route from traffic. HTTP writes and reads continue to
work. Keep outbox rows during rollback so delivery can resume after the service
is restored.
