# Notifications

## Owning modules and interface

- [apps/server/src/features/notifications](../../../apps/server/src/features/notifications)
- [apps/web/src/features/notifications](../../../apps/web/src/features/notifications)
- [packages/features/src/notifications](../../../packages/features/src/notifications)

[Background task implementation](../../../apps/server/src/features/notifications/background.ts) owns feature-specific drain/progress outcomes.

## Main flow

[Notification operations](../../../apps/server/src/features/notifications/notification-operations.ts) list and mark in-product notifications and create automation notifications for eligible recipients. The outbox publishes through the runtime adapter; the notification center consumes shared queries.

## Authorization and persistence

Notification and outbox records persist separately. Recipient membership and accessible page targets are checked before delivery; listing and read operations are user/workspace scoped.

## Side effects, failures and recovery

Publication retries update attempts and nextAttemptAt. An absent optional runtime publisher currently allows the outbox row to be marked published; preserve this behavior unless a separate product change explicitly revises it.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/notifications/notifications-architecture.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

[Notification delivery failure](../../../apps/server/src/features/notifications/background.ts) marks pending publication failed while retaining the notification record. Shared dispatch recovery cannot automatically restart exhausted publication.
