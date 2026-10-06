# Background work

## Interface and flow

The processor maps task kinds to automation, agent, AI-job, Calendar, realtime and notification operations. The [Calendar handler](../../apps/server/src/features/calendar/background.ts) accepts event and calendar-list work through the existing `calendar.sync` task kind and drains completed revision notifications before returning. Durable dirty markers retain recovery when webhook dispatch fails. It records queue/execution telemetry and converts pending outbox state into completed or retry outcomes. Node BullMQ supplies transport and invokes shared maintenance.

Start at the [entrypoint](../../apps/server/src/app/background/processor.ts); follow the [implementation](../../apps/server/src/infrastructure/background/contracts.ts) and the [Node coordinator](../../packages/runtime-adapter/src/node/background-coordinator.ts).

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
