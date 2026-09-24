# Mail synchronization and delivery

## Server-owned mailbox synchronization

[The coordinator](../../../apps/server/src/features/mail/sync/mail-sync-coordinator.ts) is the scheduling boundary. Pub/Sub, watch setup, provider mutations and maintenance raise a monotonic desired history ID for one Gmail account. A background task keyed by that account invokes [the sync engine](../../../apps/server/src/features/mail/sync/mailbox-sync-engine.ts). The engine holds an expiring account lease and persists every continuation or retry deadline in `mail_index_state`.

Initial connection establishes the watch, captures a profile history watermark,
and fully hydrates the 100 newest Inbox threads, 25 newest Sent threads and up
to 50 drafts. That bounded window becomes readable immediately. Background
indexing then stores metadata for at most 2,000 threads from the latest 90 days.
Opening a partial thread queues a deduplicated full-body hydration request;
older history is never scanned eagerly. History changes take precedence over
indexing so new mail stays current.

Incremental pages coalesce duplicate events by message ID. Known-thread message additions fetch only the message; unknown or incomplete threads fetch once. Label changes update stored message labels and rebuild their thread summaries locally. Deletions remove local messages and empty threads. Database-sync mappings are re-enqueued only for affected threads.

The applied history cursor advances only after the page's local writes commit. Page tokens make partial drains replayable. An invalid cursor starts a replacement generation without deleting the last readable generation first.

## Quota and recovery

[The Gmail gateway](../../../apps/server/src/features/mail/provider/gmail-gateway.ts) is the sole transport boundary. Its durable quota guard applies per-Google-user and per-method weights before requests. Retryable 429/quota-403 responses use server hints plus full-jitter exponential backoff. Foreground composition/mutations and background synchronization have separate traffic classes, but both obey the same account budget.

Duplicate Pub/Sub deliveries only raise the desired cursor when newer. Queue resource IDs, the account lease and idempotent upserts prevent concurrent duplicate work. The server safety poll compares `users.getProfile.historyId` with the applied cursor every five minutes for idle accounts, repairing dropped notifications. Watch renewal runs daily and before expiry.

## Browser reads and realtime

Online lists/search/groups, labels, messages and threads come from PostgreSQL APIs. Realtime sends only a committed mailbox revision; clients coalesce it across tabs, invalidate queries and refresh their offline cache. Focus and reconnect perform the same database refresh. There is no browser Gmail polling, provider cursor, `/sync` endpoint or `/index/advance` endpoint.

Dexie retains bounded thread/message/label data for offline reading, compose
recovery and a durable organization-mutation outbox. Label, read, star, archive,
spam and trash changes remain available offline and are coalesced before ordered
delivery. Definitive failures queue a canonical database reconciliation;
uncertain results retry with full-jitter backoff.

## Composition and delivery

[Composition](../../../apps/server/src/features/mail/compose/mail-compose.ts) owns draft and send effects. Send receipts bind a client operation ID, normalized composition fingerprint, draft ID and RFC message ID. Receipt lookup precedes delivery; ambiguous operations search Sent by RFC message ID before another send can be claimed. Successful delivery records the Gmail message ID without a confirmation `messages.get`; ordinary background synchronization hydrates the sent message.

Gmail remains the draft authority, while successful draft writes are projected
into PostgreSQL before a mailbox revision is published. Draft list/detail reads
therefore stay database-only and versions reject stale edits from another
device. The browser checkpoints unsaved rich-text composition in account-scoped
IndexedDB; successful draft saves and sends clear that recovery. Attachment
bytes are fetched on demand after local metadata authorization and are not
persisted in PostgreSQL or Dexie.

Provider mutations update the local projection immediately, commit a revision, publish realtime invalidation and request asynchronous cursor reconciliation. Reminders use the same sequence. Database-sync processing reads the local mailbox and contacts Gmail only when mapped attachment bytes must be copied.

See [Mail overview](README.md) and [Gmail deployment](../../../docs/mail/gmail-deployment.md).
