# Background work

## Interface and flow

The processor maps task kinds to automation, agent, AI-job, Calendar, realtime and notification operations. The [Calendar handler](../../apps/server/src/features/calendar/background.ts) accepts event and calendar-list work through the existing `calendar.sync` task kind and drains completed revision notifications before returning. Durable dirty markers retain recovery when webhook dispatch fails. It records queue/execution telemetry and converts pending outbox state into completed or retry outcomes. Node BullMQ supplies transport and invokes shared maintenance.

Start at the [entrypoint](../../apps/server/src/app/background/processor.ts); follow the [implementation](../../apps/server/src/infrastructure/background/contracts.ts) and the [Node queue runtime](../../packages/runtime-adapter/src/node/queue-runtime.ts).

## Invariants and failure handling

The Node queue adapter owns BullMQ connections, four lane queues and role-specific consumption. Composition roots inject the shared delivery runner, failure recording and maintenance. Producers fail within two seconds when Redis is unavailable; persisted dispatch records retain recovery. Consumers reconnect automatically and delayed deliveries cannot invoke a feature before `availableAt`.

Feature implementations own leases, receipts, authorization and durable status. Dispatch success is not equivalent to feature completion. Delivery handlers and maintenance use independent database scopes, and renew dispatch ownership while feature execution is active.

For `realtime.database`, the committed journal event is canonical and the
outbox contains only delivery state. HTTP acknowledgement does not wait for
delivery. The feature handler drains the reference and returns retry while it
remains pending; lease recovery and periodic sweeps cover failed scheduling and
worker interruption.

## Verification

The [queue ownership decision](../decisions/0015-background-queue-adapters.md)
and [inventory/acceptance contract](../../docs/background-queues.md) define the
queue-provider cutover and its independent release boundary.

See [tests or test configuration](../../apps/server/src/infrastructure/background) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).

## Dispatch seam

The [V2 contract](../../apps/server/src/infrastructure/background/task-v2.ts)
and [shared delivery runner](../../apps/server/src/app/background/delivery.ts)
provide cell/lane validation, execution-time guards and durable outcome hooks.
Provider conformance fixtures exercise these independently before broker cutover.

The processor delegates database realtime and notification tasks to each feature's background module. Those modules own the post-drain persistence checks and retry deadlines. [Task result handling](../../apps/server/src/infrastructure/background/task-result.ts) shares the identical completed/retry interpretation of an outbox row; it does not claim work or change leases. [Processor tests](../../apps/server/src/app/background/processor.test.ts) exercise the dispatch interface before and after the move. Node websocket attachment remains separate for each protocol.

A Node background handler publishes locally and through the required
Redis/Valkey bus in every process topology, including the single-process `all`
role. The managed Cloud runtime schedules a Queue consumer, whose background
Worker alone publishes through the per-database Durable Object. See the
[database operations guide](../../docs/databases/operations.md).

## Durable dispatch publication

[Dispatch persistence](../../apps/server/src/infrastructure/background/publication.ts) records V2 envelopes in `background_dispatch`. Feature producers stage intent in the same PostgreSQL transaction as the feature work. The post-commit publisher claims bounded batches with leases and `SKIP LOCKED`; broker failures leave pending records for recovery. Completed, terminal and exhausted deliveries cannot be republished. Business retries complete the old delivery and persist a new occurrence atomically.

[Isolated PostgreSQL verification](../../scripts/background/test-isolated.mjs) exercises migrations, rollback, failed enqueue recovery, competing publishers and duplicate delivery against a disposable database.

Cloudflare queue and DLQ consumers share the [durable delivery entrypoint](../../apps/server/src/app/background/runtime-delivery.ts). Every batch message gets a separate database scope, so concurrent transactions cannot share one Worker PostgreSQL connection. Acknowledgement follows persisted completion or rescheduling. [Failure reconciliation](../../apps/server/src/app/background/failures.ts) invokes feature-owned failure hooks, preserving live leases, completed effects and uncertain agent writes. Exhaustion remains terminal while hooks wait for expired ownership.

Shared maintenance publishes recoverable dispatches and finalizes exhausted failures. Calendar recovery enqueues dirty references; synchronization runs only in the calendar lane. Maintenance runs claimed callbacks sequentially so Worker transactions do not share a connection concurrently. Public feature-drain entrypoints are removed; runtime execution enters through the shared delivery runner. Queue readiness reports producer connectivity, role-specific consumer readiness and maintenance freshness through health and metrics.

Source command and mutation transactions carry the dispatch transaction marker through nested writes. Publication is suppressed until the outer transaction commits. Node records final-attempt exhaustion before retiring a failed job; if failure bookkeeping is unavailable, it delays that final attempt until the durable outcome can be saved. Invalid or unadmitted envelopes do not reach a feature.

## Operator boundary

[Cutover](../../apps/server/src/app/background/operations/cutover.ts) cancels
unfinished legacy work in an explicitly isolated cell database/schema, purges
only that cell's broker queues and advances schedules without backfill.
[Replay](../../apps/server/src/app/background/operations/replay.ts) requires
finalized exhaustion and feature-owned eligibility checks. Uncertain writes and
completed/cancelled work cannot be replayed. Both operations suppress immediate
publication; normal maintenance publishes newly eligible occurrences.
The [operator CLI](../../apps/server/src/scripts/background-ops.ts) requires
explicit credentials, cell identity and apply flags. See the
[release runbook](../../docs/background-queues.md#operator-commands-and-release-order).

Node queue purge and Cloudflare purge are separate runtime operations. The
Cloudflare operator verifies all eight queue IDs/names before issuing any purge
and waits for completion. Legacy feature tables have no cell discriminator;
shared-database cells require an ownership migration before cutover is safe.

The isolated fixture now executes all seven task kinds through the production
processor with real PostgreSQL and BullMQ, including two competing consumers,
provider-boundary HTTP fixtures, calendar pagination, agent checkpoints and
notification fanout. A killed child process exercises durable ownership and
stalled-job recovery. The real PostgreSQL Miniflare fixture uses production
admission, delivery, AI processing, business rescheduling and DLQ finalization.
Mounted application acceptance uses distinct queue and realtime brokers and two
independent browsers. External provider HTTP is controlled; broker and database
operations are real.

Publication dispatches a bounded batch before one ownership-fenced bookkeeping
update. Partial broker success leaves the batch recoverable under stable IDs;
parallel SQL writes never share a standalone Worker connection. Cloudflare
operator APIs have their own `operations/cloudflare-queues` entrypoint and are
not imported by the Node application runtime.

[Candidate verification and release handoff](../../docs/operations-evidence/2026-10-06-background-queues.md)
records the executed real-broker/application gates, final repository checks and
full-cutover deployment ordering. Deployment and production reset remain operator
work after review of that handoff.
