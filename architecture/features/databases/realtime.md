# Database mutation and realtime flow

Page collaboration and database collaboration have separate truth models. Yjs
owns page document content and the existence of a `databaseBlock`. PostgreSQL
owns database hosts, data sources, rows, properties, values, and their ordered
mutation journals. Rows and cell values must never be copied into page Yjs.

Database realtime has two clocks:

- a source clock for data-source metadata, properties, records, cell values,
  and cell presence;
- a host clock for views, linked-source membership, and view configuration.

Source commands commit one protocol-v3 journal event with `sourceId` and
`sourceVersion`. A linked source is not cloned into a separate event for every
displaying host. Host-only commands retain the host journal and host version.
The shared contracts live in
[database contracts](../../../packages/features/src/databases/contracts-v2.ts).

[Realtime persistence and outbox](../../../apps/server/src/features/databases/realtime)
store the source journal event and a retry reference in the same transaction as
the mutation. After commit, the request path immediately invokes the runtime
publisher. Successful delivery removes the retry row; a failed or interrupted
publication leaves it for background drain and reconnect catch-up. The outbox
is recovery state, not the normal first-delivery hop.

Node and Cloudflare use the same source identity and protocol. The
[Node runtime](../../../apps/server/src/app/node/database-realtime-runtime.ts)
keys its local/Redis room by `sourceId`; the Cloudflare adapter keys the Durable
Object by `sourceId`. Tickets are issued only from
`POST /data-sources/:sourceId/realtime-ticket`, authorize the source through
its parent ACL, and carry `sourceId`, `sourceVersion`, `sessionId`, and
`canEdit`. A connection never grants access to every source linked to a host.

Every source websocket server frame uses protocol version `3`:
`realtime.ready`, `database.mutation`, `presence.update`, and
`presence.clear`. Ready exposes the source catch-up watermark. Presence is
revisioned per connection session and keyed by `sourceId + rowId + columnKey`.
Different browser tabs remain distinct sessions, including tabs owned by the
same user. Within one tab/source connection, the most recently focused local
surface owns the single published cell cursor, so grid and row-page fields do
not overwrite each other nondeterministically.

The session-scoped database client keeps a ledger per source. HTTP command
acknowledgements, socket delivery, and source catch-up enter the same ingestion
path. Optimistic cell overlays settle by `commandId`; loaded collections and
row-page property queries receive complete-entity patches. An event for another
source is ignored by that collection. Only a source-version gap,
`requiresReset`, expired history, or an apply failure resets the affected
source scope. Ordinary cell edits never invalidate the whole database query
tree.

Reconnect catch-up uses
`GET /data-sources/:sourceId/mutations?afterVersion=...` in pages of at most
500. Host history remains a separate stream for host chrome. Journal cleanup
retains all events from the last seven days and at least the newest 10,000
events per stream, and removes expired command receipts.

Preserve event identity, source ordering, authorization, and retry semantics.
Test cross-host access to one linked source, duplicate/out-of-order delivery,
presence revisions and hibernation, optimistic rollback, gaps, deleted
resources, and access revocation in both Node and Cloudflare runtimes.

[Database overview](README.md). [Operations and troubleshooting](../../../docs/databases/operations.md).
