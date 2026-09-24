# Mail

## Ownership

- [Server mail feature](../../../apps/server/src/features/mail)
- [Web mail feature](../../../apps/web/src/features/mail)
- [Shared contracts and queries](../../../packages/features/src/mail)

The server owns the canonical mailbox projection. Gmail is an upstream provider, not a browser read store. [Mailbox persistence](../../../apps/server/src/features/mail/sync/mailbox-store.ts) is the only path that writes normalized messages, threads and labels. [The sync coordinator](../../../apps/server/src/features/mail/sync/mail-sync-coordinator.ts) coalesces account work, while [the mailbox sync engine](../../../apps/server/src/features/mail/sync/mailbox-sync-engine.ts) owns bootstrap, backfill, history application and cursor commits.

## Main flow

```text
Gmail watch / Pub/Sub / safety poll
  -> per-account coordinator intent
  -> background mail.index task
  -> history.list from the committed account cursor
  -> fetch only new or unknown message/thread content
  -> transactional PostgreSQL mailbox projection
  -> durable mailbox change row and committed revision notification
  -> browser revision catch-up and local offline cache
```

OAuth establishes the Gmail watch before requesting bootstrap work. Bootstrap stores labels, the 100 newest Inbox threads, 25 newest Sent threads and up to 50 drafts with full bodies before marking the mailbox usable. Background indexing then stores metadata for at most 2,000 threads from the latest 90 days; it does not scan or hydrate the complete account. Older metadata is advanced explicitly, and a deduplicated `mail_hydration_request` lets the existing per-account worker load one requested full thread without putting Gmail reads on the HTTP request path. Ongoing work drains `history.list`; label-only and deletion events are applied locally without refetching complete threads, while draft-related history coalesces a provider draft reconciliation.

The query, thread, message, label and unsubscribe routes read PostgreSQL. The
`/changes` feed returns current projections and deletion tombstones for every
revision after the browser's device-local cursor. A client outside the retained
change window resets only its canonical cache and then repopulates visible mail
from indexed queries. Draft writes remain explicit Gmail effects, but each
successful write immediately updates the `mail_draft`, `mail_message` and thread
projection before publishing a revision; draft list and open routes never scan
Gmail. Gmail remains the draft authority, while IndexedDB retains only unsaved
device recovery. Attachments, message delivery and provider mutations remain
explicit Gmail effects. The browser never submits
Gmail history cursors or advances server work. Its Dexie database is an
offline/read-through cache plus optimistic mutation journal.

## Persistence and invariants

`mail_index_state` is the single account sync authority: desired/applied history IDs, bootstrap/backfill cursors, generation, lease, retry deadline, errors and committed revision live there. `gmail_account` stores credentials, connection health and watch timing only. `mail_message`, `mail_thread_index`, `mail_label` and `mail_draft` form the canonical mailbox read model. Draft versions reject stale writes from another Zilobase device.

Opening an unread conversation immediately removes `UNREAD` through the normal
optimistic mutation path. Sidebar totals are derived from the canonical thread
and draft projections rather than Gmail's eventually consistent label counters.
Trash restore removes `TRASH` without guessing that the message previously
belonged in Inbox.

One expiring database lease permits one engine advance per account. Notification and queue duplication are safe: desired history is monotonic, equal/older notifications do not dispatch more work, resource IDs coalesce queued tasks, and message/thread upserts are idempotent. Each committed revision has a durable `mail_mailbox_change` record; realtime is only a poke carrying that revision, and clients fill gaps through the feed.

Gmail calls pass through the gateway quota guard. Account/user token buckets, method weights and full-jitter retry deadlines protect foreground and background traffic. HTTP 429 and quota-related 403 responses remain quota errors; only token rejection or HTTP 401 requires reconnection.

## Failure and recovery

- Invalid or expired history cursors start a new generation. Prior committed mail remains readable while the bounded recent window is rebuilt; generation recovery never treats an incomplete scan as proof that old messages were deleted.
- Worker crashes recover through the account lease and persisted page/history cursors.
- Partial history pages commit mailbox changes before advancing the page cursor, so replay is safe.
- Missed push delivery is repaired by the server safety profile poll; clients do not poll Gmail.
- Watches renew daily or within 48 hours of expiry. Renewal also raises the desired history watermark.
- Quota exhaustion persists a cooldown with full jitter and does not discard bootstrap, backfill or history position.
- Ambiguous sends use durable operation receipts and an RFC message-ID lookup before any replay.

## Capability map

[Provider](../../../apps/server/src/features/mail/provider) owns Gmail transport, OAuth, normalization, credentials and quota admission. [Sync](../../../apps/server/src/features/mail/sync) owns the coordinator, engine, mailbox persistence, watches and Pub/Sub. [Query](../../../apps/server/src/features/mail/query) owns database-only indexed and grouped queries. [Compose](../../../apps/server/src/features/mail/compose) owns MIME, drafts, delivery, safe unsubscribe and mutations. [Organization](../../../apps/server/src/features/mail/organization) owns views, properties and reminders. [Database sync](../../../apps/server/src/features/mail/database-sync) consumes the local mailbox through its own outbox.

The [web controller](../../../apps/web/src/features/mail/sync/mail-sync-controller.ts) owns connectivity, optimistic recovery and local-cache refresh. [Realtime](../../../apps/web/src/features/mail/realtime) invalidates database queries from committed server revisions. [Storage](../../../apps/web/src/features/mail/storage) is device-scoped and never owns provider cursors.

## Verification

Start with adjacent tests in `sync`, `query`, `compose`, `database-sync` and web mail tests. Route inventory tests enforce that browser-triggered `/sync` and `/index/advance` APIs do not return. Run the workspace typechecks, server mail tests, web tests, `npm run test:mail:deployment`, and `npm run verify:architecture` for architectural changes.

See [Mail synchronization and delivery](sync-and-delivery.md) and the [Gmail deployment guide](../../../docs/mail/gmail-deployment.md).
