# Background queue acceptance and cutover

## Inventory

| Lane       | Task kinds                                                       | Worker binding  | Cloudflare queue         |
| ---------- | ---------------------------------------------------------------- | --------------- | ------------------------ |
| fast       | automation.event_window, realtime.database, notification.publish | BACKGROUND_FAST | zilobase-background-fast |
| automation | automation.run, agent.run                                        | AUTOMATION_RUNS | zilobase-automation-runs |
| ai         | ai.job                                                           | AI_JOBS         | zilobase-ai-jobs         |
| calendar   | calendar.sync                                                    | CALENDAR_JOBS   | zilobase-calendar-jobs   |

Each Cloudflare work queue has a corresponding `-dlq`. AI job handlers cover
thread compaction, meeting summaries, upload extraction and MCP materialization.
Personal chat, realtime sockets, Yjs rooms and meeting audio are not task queues.

## Acceptance contract

- Both providers execute the same validated, cell-scoped envelope and processor.
- Intent is committed with business work. Broker failure cannot lose that intent.
- Duplicate delivery cannot repeat committed effects; future work cannot execute early.
- Business rescheduling is distinct from transport failure and its retry budget.
- Terminal and exhausted deliveries cannot be revived by automatic recovery.
- Maintenance schedules and repairs delivery; consumers execute feature work.
- Node queue Redis is separate from realtime Redis, persistent and non-evicting.
- API acknowledgements do not wait for background fanout.
- Real PostgreSQL/broker restart, multi-worker, shutdown and application socket
  fixtures are required. Fake-provider tests alone cannot establish acceptance.

## Release boundary

This change is a full cutover. Stop producers, consumers and maintenance before
applying the cutover. Preview and scope the operation to a cell and fixed cutoff.
Cancel unfinished runs/jobs and approvals, discard unfinished event windows and
clear delivery backlogs. Advance schedules beyond the cutoff without backfill.
Invalidate partial calendar cursors and perform fresh authorized synchronization.
Preserve completed history, committed mutation journals, domain content, agent
configuration and connection credentials. Do not flush unrelated Redis keys.

Production deployment and cutover are separate operator actions, not test setup.
Disposable integration fixtures must never discover production database URLs.

Node requires `QUEUE_REDIS_URL` in every role, identifying a broker separate from `REALTIME_REDIS_URL`. Bundled Compose and source development use persistent `queue-valkey` with AOF and `noeviction`; queue data has its own volume. The API role produces only; worker/all roles consume four lanes and run maintenance. BullMQ is pinned to 6.3.11 and uses the public ioredis adapter.

Cloudflare retains the four work queues and four DLQs. DLQ consumers record exhaustion before acknowledging; database failures retain the message. Feature hooks update unfinished execution and presentation records after live owners expire. Existing Durable Object exports, bindings and migration history are retained.

Maintenance keeps schedule scanning, cleanup, retention, approval expiry, watch renewal and operational snapshots. `background.reconcile` publishes delivery records and finalizes failure hooks. Calendar recovery creates calendar queue references. No maintenance callback invokes an execution handler. Queue health exposes `producerReady`, `consumerReady` and `maintenanceFresh`; null means the check is not applicable to that role.

## Operator commands and release order

`npm run background:ops -- inspect --cell CELL` lists bounded failure metadata.
`npm run background:ops -- replay --cell CELL --task-id UUID --apply` creates
one new dispatch after feature-owned eligibility checks. Completed, cancelled,
exhausted business attempts and uncertain writes are refused. Replay preserves
receipts and attempt counters; maintenance publishes the new occurrence.

The CLI requires explicit `DATABASE_URL` and matching `ZILOBASE_CELL_ID`; it does
not discover deployment credentials. Legacy feature tables lack cell IDs. Apply
therefore requires an isolated cell database/schema, refuses foreign-cell dispatch
records, and requires stopped runtimes. Shared feature tables across cells need a
separate ownership migration before this reset can be used safely.

1. Stop API producers, worker consumers and Cron/timers. Ensure old handlers have
   terminated and cannot commit further writes. Record a canonical UTC cutoff.
2. Run `npm run background:ops -- cutover --cell CELL --cutoff TIMESTAMP` to
   preview. Inspect counts and database/schema ownership. The cutoff must include
   all unfinished work; newer runnable work causes apply to refuse.
3. Run the same command with `--apply --runtimes-stopped --isolated-cell-database`.
   It cancels unfinished work and approvals, updates dependent status records,
   preserves committed effects and history, clears legacy delivery state and
   releases maintenance ownership. No compensating domain writes run.
4. Apply purges only the cell's four BullMQ queue prefixes, including retained
   failures. It never flushes Redis. For Workers add `--runtime worker`, with
   `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_BACKGROUND_QUEUE_CELL_ID` and `CLOUDFLARE_BACKGROUND_QUEUE_IDS`.
   The latter is a JSON object mapping the four queue names and their four
   `-dlq` names to queue IDs. All eight names are verified before purge, and the
   CLI waits for asynchronous purge completion. Tokens need Queues edit access.
5. After purge, schedules advance beyond the fixed cutoff without backfill and
   abandoned partial calendar cursors are invalidated for a fresh authorized
   synchronization. If purge fails, leave the deployment stopped and repeat with
   the **same cutoff**. SQL updates are repeatable and publication is suppressed
   throughout the operator transactions.
6. Start the new release, check `/ready` and queue gauges at `/metrics`, then
   verify fresh tasks and cross-client database delivery. Old V1 messages are
   rejected. There is no PostgreSQL-coordinator fallback or rolling compatibility.

Queue Redis must have AOF persistence and `noeviction`. Compose provisions a
separate volume. Helm requires `queue.existingSecret`/`queue.key`, distinct from
`realtime.existingSecret`, and separate queue network-policy egress. The Secret
contains `QUEUE_REDIS_URL`; configure it for API and worker roles alike.

Cloudflare Durable Object declarations and migration history are unchanged.
Reconcile any deployment migration history separately during release preparation;
do not remove declarations as part of this queue cutover.
