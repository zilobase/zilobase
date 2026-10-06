# Application-wide queue adapters

Status: accepted.

## Context

Node background execution uses PostgreSQL notifications, lane timers and direct
feature drains. Workers use four queues, but maintenance also directly drains
feature work. These paths blur broker scheduling and feature execution ownership.

## Decision

Use one versioned task contract and shared delivery runner for all seven task
kinds. Dedicated Redis/BullMQ supplies Node transport; Cloudflare Queues supplies
Worker transport. PostgreSQL owns feature state and transactional dispatch intent.
The publisher repairs enqueue failures; it does not execute feature work.
Feature services retain authorization, leases, checkpoints and operation receipts.
Business rescheduling creates durable next-delivery intent, independently of
unexpected transport retries. Exhaustion is persisted and requires explicit replay.

## Alternatives

- Retain PostgreSQL execution coordination: rejected because it duplicates the
  queue-consumer execution path and couples Node transport to feature drains.
- Share queue and realtime Redis: rejected because queues need persistence,
  no eviction and independent capacity/failure management.
- Use broker-only dispatch: rejected because a database commit and broker enqueue
  are not atomic and interruptions can lose work.
- Use BullMQ workflows as domain state: rejected because it would make feature
  behavior depend on one runtime's broker implementation.

## Consequences

This is a full cutover with no legacy broker fallback. Unfinished work is
discarded explicitly; completed history and domain data are retained. Queue
adapter implementation precedes AI behavior changes. The inventory and release
contract are in [background queues](../../docs/background-queues.md).
