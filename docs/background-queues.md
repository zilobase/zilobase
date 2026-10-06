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
