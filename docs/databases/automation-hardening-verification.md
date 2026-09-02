# Automation hardening verification matrix

Run these scenarios against both the hosted queue adapter and self-hosted Node worker before advancing a rollout gate.

| Scenario | Required result |
| --- | --- |
| Sustained source mutations and schedule bursts | Backlog drains; no workspace exceeds 10 live run leases; UI/API remain responsive |
| Worker crash before/after event, step, and delivery receipts | Expired lease is reclaimed; internal actions are not repeated; external retries retain one delivery ID |
| Two workers claiming the same workspace | Advisory lock serializes capacity calculation; no more than 10 live runs |
| Queue redelivery and database failover | Unique run/occurrence and receipt constraints suppress logical duplicates |
| Provider outage, 429, revoked token, invalid channel | Bounded retry for transient errors; terminal error pauses dependency; no secret/provider body in logs |
| Webhook redirect, DNS rebind, private/metadata IP, slow/large response | Request fails closed with the expected stable error code |
| Owner/guest/access removal and source lock | New evaluation is skipped or fails safely; repair and explicit resume are required |
| Migration from `0072`, clean install, capability-off rollback | Migrations succeed; disabled code performs no execution; existing data remains readable after re-enable |
| Retention backlog larger than one batch | Each cleanup deletes at most 1,000 terminal rows/type and converges across invocations without deleting live work |
| Global execution kill and recovery | Capture continues; no evaluation/schedule/run claim occurs; backlog resumes idempotently after enable |

Automated evidence lives in compiler/property/operator tests, mutation audit, event rollback/concurrency tests, recurrence/DST tests, lease/receipt architecture tests, connector fixtures, `operations.test.ts`, migration tests, and web builder tests. Production load and failover results should be attached to the release record with deployment version, adapter, database version, workload, latency percentiles, peak backlog, and duplicate count.
