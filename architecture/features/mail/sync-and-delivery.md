# Mail synchronization and delivery

## Server-owned mailbox synchronization

[The coordinator](../../../apps/server/src/features/mail/sync/mail-sync-coordinator.ts) is the scheduling boundary. Pub/Sub, watch setup, provider mutations and maintenance raise a monotonic desired history ID for one Gmail account. A background task keyed by that account invokes [the sync engine](../../../apps/server/src/features/mail/sync/mailbox-sync-engine.ts). The engine holds an expiring account lease and persists every continuation or retry deadline in `mail_index_state`.

Initial connection captures a profile history watermark, labels and up to 50 recent Inbox threads. That recent generation becomes readable immediately. All Mail is then hydrated in 25-thread pages; already complete threads are skipped. History changes take precedence over backfill so new mail stays current while older mail fills in.

Incremental pages coalesce duplicate events by message ID. Known-thread message additions fetch only the message; unknown or incomplete threads fetch once. Label changes update stored message labels and rebuild their thread summaries locally. Deletions remove local messages and empty threads. Database-sync mappings are re-enqueued only for affected threads.

The applied history cursor advances only after the page's local writes commit. Page tokens make partial drains replayable. An invalid cursor starts a replacement generation without deleting the last readable generation first.

## Quota and recovery

[The Gmail gateway](../../../apps/server/src/features/mail/provider/gmail-gateway.ts) is the sole transport boundary. Its durable quota guard applies per-Google-user and per-method weights before requests. Retryable 429/quota-403 responses use server hints plus full-jitter exponential backoff. Foreground composition/mutations and background synchronization have separate traffic classes, but both obey the same account budget.

Duplicate Pub/Sub deliveries only raise the desired cursor when newer. Queue resource IDs, the account lease and idempotent upserts prevent concurrent duplicate work. The server safety poll compares `users.getProfile.historyId` with the applied cursor every five minutes for idle accounts, repairing dropped notifications. Watch renewal runs daily and before expiry.

## Browser reads and realtime

Online lists/search/groups, labels, messages and threads come from PostgreSQL APIs. Realtime sends only a committed mailbox revision; clients coalesce it across tabs, invalidate queries and refresh their offline cache. Focus and reconnect perform the same database refresh. There is no browser Gmail polling, provider cursor, `/sync` endpoint or `/index/advance` endpoint.

Dexie retains bounded thread/message/label data for offline reading and optimistic mutation recovery. A definite 4xx mutation failure rolls back the snapshot. An uncertain result retains the optimistic state and queues a database-only thread/message reconciliation.

## Composition and delivery

[Composition](../../../apps/server/src/features/mail/compose/mail-compose.ts) owns draft and send effects. Send receipts bind a client operation ID, normalized composition fingerprint, draft ID and RFC message ID. Receipt lookup precedes delivery; ambiguous operations search Sent by RFC message ID before another send can be claimed. Successful delivery records the Gmail message ID without a confirmation `messages.get`; ordinary background synchronization hydrates the sent message.

Draft list/detail/create/update/delete stay provider-backed because Gmail draft identity is part of the editing workflow. Attachment bytes are fetched on demand after local metadata authorization and may use a private one-day browser cache; they are not persisted in PostgreSQL or Dexie.

Provider mutations update the local projection immediately, commit a revision, publish realtime invalidation and request asynchronous cursor reconciliation. Reminders use the same sequence. Database-sync processing reads the local mailbox and contacts Gmail only when mapped attachment bytes must be copied.

See [Mail overview](README.md) and [Gmail deployment](../../../docs/mail/gmail-deployment.md).
