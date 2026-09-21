# Background work

## Interface and flow

The processor maps task kinds to automation, agent, AI-job, mail, Calendar, realtime and notification operations. The [Calendar handler](../../apps/server/src/features/calendar/background.ts) accepts event and calendar-list work through the existing `calendar.sync` task kind and drains completed revision notifications before returning. Durable dirty markers retain recovery when webhook dispatch fails. It records queue/execution telemetry and converts pending outbox state into completed or retry outcomes. Node coordination supplies dispatch and maintenance.

Start at the [entrypoint](../../apps/server/src/app/background/processor.ts); follow the [implementation](../../apps/server/src/infrastructure/background/contracts.ts) and the [Node coordinator](../../packages/runtime-adapter/src/node/background-coordinator.ts).

## Invariants and failure handling

The Node coordinator catches maintenance and lane-timer recalculation failures during startup and periodic reconciliation, logs `background.node_reconcile`, and retries on the existing jittered recovery sweep. Tracking in-flight work handles both promise outcomes without creating an unhandled rejection during cleanup.

Feature implementations own leases, receipts, authorization and durable status. Dispatch success is not equivalent to feature completion. Retries preserve task identity and availableAt semantics; terminal outcomes differ from thrown execution errors.

For `realtime.database`, the committed journal event is canonical and the
outbox contains only delivery state. HTTP acknowledgement does not wait for
delivery. The feature handler drains the reference and returns retry while it
remains pending; lease recovery and periodic sweeps cover failed scheduling and
worker interruption.

## Verification

See [tests or test configuration](../../apps/server/src/infrastructure/background) and [testing and quality](../setup/testing-and-quality.md). [Architecture index](../README.md).

## Dispatch seam

The processor delegates mail indexing/sync, database realtime, navigation realtime and notification tasks to each feature's background module. Those modules own the post-drain persistence checks and retry deadlines. [Task result handling](../../apps/server/src/infrastructure/background/task-result.ts) shares the identical completed/retry interpretation of an outbox row; it does not claim work or change leases. [Processor tests](../../apps/server/src/app/background/processor.test.ts) exercise the dispatch interface before and after the move. Node websocket attachment remains separate for each protocol.

A Node background handler publishes locally and through the required
Redis/Valkey bus in every process topology, including the single-process `all`
role. The managed Cloud runtime schedules a Queue consumer, whose background
Worker alone publishes through the per-database Durable Object. See the
[database operations guide](../../docs/databases/operations.md).
