# Database automation persistence and management API

Pass 2 introduces migration `0073_database_automations` and source-aware
management routes. Automations belong to the canonical `data_source`, even
when the manager is opened from a linked database container.

## Persistence guarantees

- Definitions are immutable revisions. The automation row points to one
  current revision, while future runs pin a revision ID.
- Creation is serialized on the source row and deduplicated by actor, source,
  and idempotency key. Duplicates use a separate derived key namespace and are
  created paused.
- Updates lock the automation and require its current positive revision in
  `If-Match`; stale writes return `AUTOMATION_REVISION_CONFLICT`.
- Dependencies are stored per revision. Only dependencies of the current
  revision participate in delete/type-change invalidation.
- Secret ciphertext, IVs, and key versions exist only in `automation_secret`.
  Definition JSON may contain opaque secret or connector IDs, never protected
  values.
- Event windows, runs, steps, and deliveries have the uniqueness, lease, and
  receipt indexes needed by Passes 3 and 4.

## Management boundary

Management requires an active workspace membership, full access to the
canonical source database, visibility of the containing linked database, an
unlocked source, same-workspace targets, and edit access to every explicit
target. Catalog responses for lower-access users contain no definitions.

The compiler returns stable error codes and field paths, validates the full
trigger property/operator/operand matrix, writable operation modes, nested
filters, target sources, view ownership, reference ordering, formula syntax,
IANA timezones, and independent capability gates. Schedules, notifications,
and Gmail are enabled; webhooks and Slack remain disabled until their owning
passes.

## Routes

- `GET /databases/:databaseId/automations?dataSourceId=...`
- `POST /databases/:databaseId/automations` with `Idempotency-Key`
- `POST /databases/:databaseId/automations/validate`
- `GET /databases/:databaseId/automations/:automationId`
- `PATCH /databases/:databaseId/automations/:automationId` with `If-Match`
- `POST .../:automationId/pause`
- `POST .../:automationId/resume`
- `POST .../:automationId/duplicate` with `Idempotency-Key`
- `DELETE .../:automationId`
- `GET /databases/:databaseId/automation-catalog?dataSourceId=...`

Run list/detail routes are activated with the evaluator in Pass 4.
