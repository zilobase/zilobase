# Database automations: product specification and implementation plan

Status: planned; no product implementation has started

Reference baseline reviewed: 2026-09-02

Scope: Zilobase Community, hosted Cloudflare runtime, self-hosted Node runtime,
web, and desktop

Owner: Zilobase product and engineering

## 1. Outcome

Add first-class database automations with Notion-equivalent database automation
capabilities while keeping Zilobase's existing database, data-source, access,
realtime, Gmail, deployment, and self-hosting architecture.

An automation has:

1. A source data source and optional view scope.
2. One event trigger group using `any` or `all`, or one recurring schedule.
3. An ordered sequence of one or more actions.
4. A durable revision, execution history, action-step history, and explicit
   active/paused/error state.
5. The authority of its owner, rechecked when it runs.

The implementation is complete only when user edits from every supported row
mutation path are captured transactionally, scheduled executions survive
restarts, actions are idempotent where possible, external actions are safe,
and hosted and self-hosted deployments have the same product behavior.

## 2. Reference behavior

The primary parity reference is Notion's current documentation:

- [Database automations](https://www.notion.com/help/database-automations)
- [Webhook actions](https://www.notion.com/help/webhook-actions)
- [Database buttons](https://www.notion.com/help/database-buttons), used only
  to keep the future shared action language compatible
- [Slack integration](https://www.notion.com/help/slack)

The reference establishes the following database automation contract:

- Automations contain triggers and one or more ordered actions.
- Event triggers are page added, property edited, or any property edited.
- Multiple event triggers can use `any` or `all` matching.
- Property edits are evaluated over an approximately three-second window.
- A recurring trigger supports a frequency, local time, timezone, start date,
  and optional end date. It cannot be mixed with event triggers.
- A recurring trigger cannot use the trigger-page `Edit property` action.
- Automations can apply to the entire data source or pages that remain in one
  selected view after the triggering edit.
- Automation-created edits and pages do not trigger other database
  automations. A direct user button action may trigger them.
- Actions include edit trigger-page properties, add a page, edit pages, send an
  in-product notification, send Gmail, send a webhook, send Slack, and define
  formula-backed variables.
- Actions can use the trigger page, actor, current time, properties, relations,
  mentions, and variables. Formulas are actions, not triggers.
- Invalid definitions cannot be saved. A terminal runtime error pauses the
  automation and requires a manual resume after repair.
- Restricted pages, missing targets, revoked connections, filtered-out rows,
  and locked databases prevent the relevant automation from running.
- Creating, editing, pausing, resuming, or deleting an automation requires full
  database access, and guests cannot manage automations.
- Webhooks are HTTP POST only, contain selected page properties rather than
  page body content, support custom headers, allow no more than five webhook
  actions in one automation, and pause the automation on terminal failure.

Zilobase will match these capabilities, state transitions, and restrictions.
It does not need to copy Notion's visual styling or its paid-plan entitlement
rules. Edition-level entitlement remains an extension hook, not a condition
embedded in the core engine.

## 3. Scope boundaries

### Included

- Database automation list, builder, editor, pause/resume, delete, validation,
  error state, and recent run history.
- Page-added, property-edited, any-property-edited, and recurring triggers.
- Entire-source and view-scoped execution.
- All supported trigger operators in the matrix below.
- Ordered internal actions, variables/formulas, notifications, Gmail, webhook,
  and Slack actions.
- Hosted Cloudflare and self-hosted Node workers.
- Web and desktop UI.
- Public server API contracts for first-party clients.
- Audit, metrics, recovery, retention, quotas, and deployment documentation.
- A reusable action-definition layer that database button properties can adopt
  in a later project.

### Not included in this project

- Page button blocks or fully programmable database button properties.
- Arbitrary JavaScript, arbitrary SQL, shell execution, or user-supplied code.
- Page-content/body triggers. Triggers operate on row identity and properties.
- Formula expressions as trigger clauses. A trigger's operator operands are
  validated literals or stable entity references.
- Cross-workspace actions.
- Workspace-wide automations.
- Automation chaining. Actions carry `origin = automation`, which is always
  suppressed by event-trigger capture.
- A guarantee of exactly-once delivery to external HTTP, Gmail, or Slack
  providers. Zilobase provides durable at-least-once attempts with stable
  delivery IDs and provider-specific deduplication where available.

## 4. Current repository findings

The repository already provides important foundations:

- `database`, `data_source`, `database_data_source`, `database_view`,
  `database_row`, `page_property`, and `page_property_value` form a normalized
  database model.
- One data source can be displayed by multiple database containers. Row and
  property mutations belong to the data source; realtime mutations fan out to
  every linked database container.
- `commitDataSourceMutation`, `commitDataSourceMutationBatch`, and
  `commitDatabaseMutationBatch` provide transactional mutation boundaries and
  durable realtime outbox writes.
- Row creation, cell editing, row-page property editing, row-page title edits,
  templates, imports, mail synchronization, and AI tools already mutate the
  same canonical tables, but they do not all pass the same semantic mutation
  facts.
- Realtime deltas contain after-state presentation data. They do not reliably
  contain previous values, a single data-source identity, mutation origin, or
  enough information to evaluate property transitions.
- View filters and the database formula evaluator currently live in web-only
  modules. Automations require server-owned deterministic versions.
- The database access model already distinguishes `view`, `comment`, `edit`,
  and `full`. Full access can be checked centrally.
- Database locking already exists in database config.
- Gmail OAuth, encrypted refresh tokens, mail sending, durable jobs, leases,
  scheduled maintenance, Cloudflare queues, and self-hosted polling patterns
  already exist and should be reused.
- There is no general in-product notification store, Slack connection, or
  automation worker yet.

Architectural decision: automations are owned by a canonical `data_source`,
not by a linked display container. A view-scoped automation may reference a
`database_view`, but the view must display the same source. When opened from a
linked view, management resolves to the source database and requires full
access there. This prevents the same row edits from firing duplicate
container-owned automations.

## 5. Product contract

### 5.1 Entry point and list

Add a lightning-bolt `Automations` control to the database toolbar. It is
available on full-page and inline databases and follows the active data source.

Selecting it opens a responsive side panel or dialog containing:

- `New automation`.
- Existing automations ordered by active status and most recent update.
- Name, trigger summary, action count, scope, status, and last-run result.
- Per-row menu: edit, pause/resume, duplicate, view runs, delete.
- A clear source-database link when opened from a linked data source.
- Loading, empty, validation-error, permission, and unavailable-integration
  states.

Users without full access do not receive secret-bearing automation definitions.
They see a disabled lightning control with an access explanation. Page guests
cannot create or manage automations even if an inherited rule would otherwise
resolve to full access.

### 5.2 Builder

The builder contains:

1. Optional name, defaulting to a human-readable trigger/action summary.
2. Scope: `Entire data source` or a compatible view.
3. Trigger section.
4. Ordered action section with drag/reorder and delete.
5. Inline validation and unavailable dependency warnings.
6. `Create` or `Save` only when the compiled definition is valid.

The builder never stores property names as identity. It stores stable IDs and
uses names only for display. Renaming a property or view therefore keeps an
automation valid. Deleting, changing the type of, unlinking, or restricting a
referenced entity marks dependent definitions invalid and pauses affected
automations.

### 5.3 Lifecycle

Status is one of:

- `active`: eligible to evaluate and execute.
- `paused`: manually paused.
- `error`: automatically paused after a terminal runtime or dependency error.
- `deleted`: soft-deleted for audit retention and absent from normal UI.

An error state stores a stable error code, user-safe summary, failing action ID,
and timestamp. Saving a repaired revision does not silently resume execution.
The user explicitly selects `Resume`.

Duplicate creates a paused copy with no run history and no copied connector
secrets. Secret-backed action fields must be reselected or re-entered.

### 5.4 Run history

Full-access managers can inspect recent runs:

- queued, running, succeeded, failed, or skipped;
- trigger time, trigger row, trigger actor, automation revision;
- each action's sanitized inputs, output summary, duration, and error;
- skip reason such as view mismatch, locked database, automation origin,
  revoked authority, or duplicate occurrence.

Tokens, OAuth credentials, custom header values, email bodies with sensitive
data, and unrestricted webhook responses are never stored in run logs.

## 6. Trigger specification

### 6.1 Trigger definition

An automation uses exactly one of these shapes:

```ts
type AutomationTrigger =
  | {
      kind: "event"
      match: "any" | "all"
      clauses: EventTriggerClause[]
    }
  | {
      kind: "schedule"
      schedule: AutomationSchedule
    }
```

Event clauses have stable IDs and are one of:

```ts
type EventTriggerClause =
  | { id: string; type: "page_added" }
  | {
      id: string
      type: "property_edited"
      propertyId: "name" | "any" | string
      operator: AutomationTriggerOperator
      operand?: unknown
    }
```

`page_added` means a new `database_row` becomes active in the source. Moving an
existing page into the source counts as page added to the target. Reordering,
restoring a soft-deleted row, or linking a source to another database container
does not count as page added.

`property_edited` requires a real before/after change after normalization. A
write that stores the same semantic value is not an edit. `propertyId = any`
matches any editable property, including the row title (`name`), but excludes
row position, view configuration, property schema, page body, and derived
realtime metadata.

### 6.2 Operator matrix

The builder exposes only valid combinations. `was edited` tests whether the
property changed during the event window. Other operators require the property
to have changed and evaluate its final after value.

| Property kind | Operators |
| --- | --- |
| Any property | `was edited` |
| Title, text, URL, email, phone, place | `was edited`, `is`, `is not`, `contains`, `does not contain`, `starts with`, `ends with`, `is empty`, `is not empty` |
| Number | `was edited`, `is`, `is not`, `greater than`, `less than`, `greater than or equal`, `less than or equal`, `is empty`, `is not empty` |
| Select, status | `was edited`, `is`, `is not`, `is empty`, `is not empty` |
| Multi-select | `was edited`, `contains`, `does not contain`, `is empty`, `is not empty` |
| Person | `was edited`, `contains`, `does not contain`, `is empty`, `is not empty` |
| Relation | `was edited`, `contains`, `does not contain`, `is empty`, `is not empty` |
| Date | `was edited`, `is`, `is not`, `is before`, `is after`, `is on or before`, `is on or after`, `is between`, `is relative to today`, `is empty`, `is not empty` |
| Checkbox, verification | `was edited`, `is checked`, `is unchecked` |
| Files | `was edited`, `is empty`, `is not empty` |
| Button | no property-edit trigger; a later direct button execution emits user-origin facts for the properties it changes |
| Formula, rollup, ID, created time, edited time | no direct edit trigger because these are derived/read-only; they remain available in action expressions |

Text comparisons are case-insensitive Unicode comparisons after trimming for
operator matching; stored values are not modified. Select/status operands use
option IDs. Person operands use user IDs. Relation operands use page IDs.
Dates compare in the automation timezone at the precision represented by the
stored property. Empty is type-aware and distinguishes `null`/missing from
valid values such as number `0` and checkbox `false`.

### 6.3 Multiple trigger semantics

- `any`: at least one clause matches within the three-second window.
- `all`: every clause matches within the same window.
- Repeated clauses for the same property are allowed when logically valid.
- `page_added` may be combined with property clauses. Initial property values
  written in the row-creation transaction count as changed for that page-added
  window.
- Event clauses cannot be combined with a schedule.
- No more than 20 clauses per automation.

### 6.4 Three-second event window

Every non-automation row mutation contributes to one durable aggregation window
identified by data source and row. The first fact opens a fixed three-second
window. Later facts committed before its close are merged into it.

The window stores:

- source, row, and page identity;
- first and last commit timestamps;
- whether the row was added;
- the union of changed property IDs;
- the first before value and final after value for each changed property;
- the final normalized row snapshot reference;
- contributing origins and actor IDs;
- the last contributing actor as `trigger.person`.

If a user changes a value and restores the original value before the window
closes, that property is removed from the final changed set. It therefore does
not satisfy `was edited`. This matches the reference's three-second cancellation
behavior.

Aggregation is source-level and occurs once, even when the source is displayed
by multiple database containers. It is written in the same PostgreSQL
transaction as the row mutation. A per-source/row transaction lock prevents two
concurrent writes from opening overlapping windows.

### 6.5 Origin and loop suppression

Every row mutation supplies one origin:

- `user`
- `button`
- `form`
- `api`
- `import`
- `integration`
- `ai`
- `automation`
- `system`

`user`, `button`, `form`, `api`, `import`, `integration`, and confirmed AI
mutations are eligible to open event windows. `automation` is always suppressed
before trigger evaluation. `system` is suppressed unless the specific system
operation explicitly declares user-equivalent behavior.

All internal automation actions propagate a run ID and `origin = automation`
through the existing mutation services. This is the recursion boundary; it is
not implemented as a best-effort worker filter after the mutation.

### 6.6 View scope

For `scope.type = view`, the selected view must display the automation's source.
At window close, the server evaluates the row against the latest saved view
filter definition after applying the triggering edits. The automation runs only
if the row still matches. An invalid/deleted view pauses the automation.

The current client-only filter evaluator must move to a shared pure package and
be used by both the web view model and server automation engine. Relative dates
receive an explicit clock and timezone so client and server tests are
deterministic.

### 6.7 Recurring schedule

```ts
type AutomationSchedule = {
  timezone: string
  frequency: "daily" | "weekly" | "monthly" | "yearly" | "custom"
  interval: number
  localTime: string
  weekdays?: number[]
  dayOfMonth?: number | "last"
  months?: number[]
  startDate: string
  endDate?: string
}
```

- Timezone must be an IANA name.
- Interval is 1-365.
- Custom schedules support every N days, selected weekdays every N weeks, day
  or last day every N months, and selected months yearly.
- `nextRunAt` is materialized in UTC and recomputed transactionally after each
  claim. Wall-clock time remains stable across daylight-saving changes.
- A spring-forward nonexistent local time runs at the first valid instant after
  the gap. A fall-back repeated local time runs once.
- Each occurrence has a unique key of automation ID plus scheduled UTC instant.
- Missed occurrences use `skip` policy by default: after downtime, run the most
  recent missed occurrence once and calculate the next future occurrence. Do
  not replay an unbounded backlog.
- Schedule actions have no trigger page or trigger person. They cannot use
  `edit_trigger_page`; all other actions are valid when their own targets are
  defined.
- Schedules are claimed at least once per minute in hosted and self-hosted
  runtimes.

## 7. Action specification

Actions execute sequentially in configured order. Later actions can reference
variables and page results produced by earlier actions. A terminal action
failure stops later actions and moves the automation to `error`.

Maximum actions per automation: 50. Maximum webhook actions: 5.

### 7.1 Define variables

`define_variables` evaluates one or more named expressions against the run
context. Names are unique within the run and become available to subsequent
actions. Values may be scalar, date, person, page, or bounded lists of those
types.

Limits:

- 25 variables in one action.
- 1,000 items in a list before the run fails safely.
- 64 KiB serialized value per variable.
- No network, filesystem, random, or unbounded recursive evaluation.

### 7.2 Edit trigger-page properties

`edit_trigger_page` edits one or more writable properties on the triggering
row. It is invalid for recurring automations.

Property operation modes:

- scalar/title/date/checkbox/select/status: `set` or `clear`;
- multi-select/person/relation: `set`, `add`, `remove`, or `clear`;
- files: `clear` only in the initial release; file creation requires a separate
  owned upload reference;
- read-only/formula/rollup/button fields: unavailable.

All edits use canonical database services, one logical automation origin, and
the existing realtime outbox. Multiple field edits should commit as one
data-source mutation and one client-visible version where practical.

### 7.3 Add page to

`add_page` creates one page/row in a selected target data source and assigns
configured writable properties. The target must be in the same workspace.

- The title defaults to `Untitled` when the expression is empty.
- The created page becomes an action output usable by later actions.
- The engine calls `createDatabaseRowService` plus a new atomic initial-values
  input rather than creating the row and then issuing independent cell writes.
- The created row's mutation origin is automation and cannot trigger another
  database automation.
- A stable run/action idempotency key prevents duplicate internal rows after a
  lease loss or worker retry.

### 7.4 Edit pages in

`edit_pages` resolves a bounded page set and applies property operations.
Targets can be:

- pages returned by a page-list variable;
- pages related to the trigger page;
- rows in one selected same-workspace data source that match a saved action
  filter.

The server-owned filter language uses the shared database predicate engine.
Default maximum is 1,000 rows per action. The builder shows an estimated count
when possible. Larger jobs fail before partial mutation unless a future batch
mode explicitly supports chunked progress.

Target edits use a new atomic bulk mutation service with per-row authorization,
idempotency receipts, data-source versioning, realtime deltas, and automation
origin propagation.

### 7.5 Send in-product notification

`send_notification` resolves up to 20 unique active workspace users from:

- selected users;
- a person property;
- `trigger.person`;
- page creator;
- variables that resolve to people.

It writes durable notifications with a rich-text-safe message and an optional
page link. Removed users, guests outside the workspace, and inaccessible page
mentions are rejected or omitted according to validation policy. A notification
outbox supplies realtime delivery; polling remains the recovery path.

### 7.6 Send mail to

`send_gmail` references an existing user-owned Gmail connection and supports:

- To, CC, and BCC recipient expressions;
- subject, message, optional display name, and reply-to;
- selected users, person properties, trigger person/page creator, literal
  external email addresses, and variables;
- the existing Gmail provider limits and reconnect state.

Only the Gmail connection owner may create or edit this action. If the
connection owner loses source/target authority, leaves the workspace, revokes
Gmail, or the token becomes reconnect-required, the automation enters error.
Other full-access users can pause/delete the automation but cannot inspect or
replace the protected Gmail action without explicitly taking ownership and
choosing their own connection.

### 7.7 Send webhook

`send_webhook` performs HTTP POST to one HTTPS endpoint, includes only selected
trigger-page properties and configured expression fields, and can add custom
headers.

Security requirements:

- Validate URL at save and delivery time.
- HTTPS only in hosted deployments. Self-hosted administrators may explicitly
  allow HTTP for configured local domains.
- Block loopback, link-local, private, metadata-service, multicast, and other
  non-public address ranges after DNS resolution; pin the resolved address for
  the request; do not follow redirects automatically.
- Reject credential-bearing URLs and hop-by-hop or reserved headers.
- Encrypt custom header values in `automation_secret`, never JSON definition or
  logs.
- Five-second connect timeout, ten-second total timeout, 1 MiB response cap,
  and no response body persistence.
- Send stable `X-Zilobase-Delivery-Id`, run ID, action ID, schema version,
  timestamp, selected properties, and page URL/ID.
- Treat 2xx as success, 408/409/425/429/5xx and network errors as retryable,
  and other 4xx as terminal. Honor a bounded `Retry-After`.
- Retry with exponential backoff and jitter. A terminal result pauses the
  automation. Receivers must use the delivery ID to deduplicate.

### 7.8 Send Slack notification

`send_slack` posts rich text to a selected public or authorized private channel
through a user-owned Slack connection. It supports links, page/person/teamspace
mentions, `@channel`, `@here`, emoji, trigger values, and variables. Formula
expressions are not accepted directly in the Slack message; calculate them in a
prior variable action to preserve the reference restriction.

The integration requires OAuth state/PKCE, encrypted tokens, channel discovery,
connection ownership, revocation handling, workspace admin policy, provider
rate limits, retries, and audit. Direct messages are not a target in the parity
release.

## 8. Expressions, mentions, and values

The current formula parser/evaluator must be extracted from the web app into a
browser/server-safe module in `@zilobase/features`. Both clients and the server
then use the same parser, value types, formatting, and function catalog.

The automation evaluator adds a typed context:

```ts
type AutomationExpressionContext = {
  triggerPage?: PageReference
  triggerPerson?: PersonReference
  now: Date
  automation: { id: string; name: string }
  run: { id: string; scheduledFor?: Date }
  actionOutputs: Record<string, unknown>
  variables: Record<string, FormulaValue>
}
```

Required references include:

- `Trigger page` and its properties;
- page creator and last editor;
- `Trigger person`;
- `Now` and `Today` in automation timezone;
- selected workspace people, groups, pages, and teamspaces;
- relation traversal and bounded list functions;
- outputs of `add_page` and prior variables.

Expression evaluation is deterministic for a run: `now()` and `today()` use the
run's captured clock, not the current time on every retry. Relation and property
reads use a captured run input snapshot where necessary. Write targets are
re-authorized and reloaded immediately before mutation.

Rollup and formula property reads must also move to server-capable evaluators or
a canonical computed-value service. The engine must not trust a value computed
only in the browser.

## 9. Data model

Use migrations beginning after the repository's current latest migration
(`0072` at planning time). Exact migration numbers are assigned at
implementation time to avoid colliding with concurrent work.

### 9.1 `database_automation`

- `id text primary key`
- `workspace_id text not null references workspace(id) on delete cascade`
- `data_source_id text not null references data_source(id) on delete cascade`
- `created_by_id text references user(id) on delete set null`
- `owner_user_id text references user(id) on delete set null`
- `name text not null`
- `status text not null`: `active | paused | error | deleted`
- `current_revision_id text not null`
- `next_run_at timestamptz`
- `last_run_at timestamptz`
- `last_run_status text`
- `error_code text`
- `error_summary text`
- `error_action_id text`
- `errored_at timestamptz`
- `deleted_at timestamptz`
- `created_at`, `updated_at`

Indexes cover source/status, workspace/status, due schedules, and updated time.
Checks ensure schedule timestamps are present only for a schedule revision and
error metadata is coherent with error status.

### 9.2 `database_automation_revision`

- `id text primary key`
- `automation_id text not null references database_automation(id)`
- `version integer not null`
- `definition_version integer not null`
- `definition jsonb not null`
- `compiled_definition jsonb not null`
- `definition_hash text not null`
- `created_by_id text references user(id) on delete set null`
- `created_at timestamptz not null`
- unique `(automation_id, version)`

Runs pin a revision so an edit cannot alter queued work. `compiled_definition`
contains resolved stable IDs and validated type metadata, never secrets.

### 9.3 `database_automation_dependency`

- `automation_id`, `revision_id`
- `dependency_type`: `data_source | database | view | property | option | user | group |
  gmail_connection | slack_connection | secret`
- `dependency_id`
- `usage`: trigger/scope/action field identifier
- unique revision/type/id/usage

Dependencies support delete/type-change invalidation, permission audits, and
connector revocation handling without scanning JSON definitions.

### 9.4 `database_automation_event_window`

- source/row/page/workspace identity
- `opened_at`, `closes_at`, `last_fact_at`
- `status`: `accumulating | ready | processing | completed | discarded`
- `row_added boolean`
- `changed_property_ids text[]`
- `before_values jsonb`, `after_values jsonb`
- `actor_ids text[]`, `trigger_actor_id text`
- `origins text[]`
- `attempts`, `next_attempt_at`, `lease_owner`, `lease_expires_at`
- timestamps and terminal reason

Index due windows by status/closes/next-attempt and source/row. Retain completed
windows briefly for diagnosis, then purge according to retention policy.

### 9.5 `database_automation_run`

- automation/revision/workspace/source identity
- optional event-window, trigger row/page/person identity
- optional scheduled instant and unique occurrence key
- captured input snapshot and definition hash
- `status`: `queued | running | succeeded | failed | skipped | cancelled`
- attempts, lease, timing, error, and sanitized summary fields
- unique event-window/automation and schedule occurrence/automation keys

### 9.6 `database_automation_step_run`

- run/action identity and order
- stable idempotency key
- status, attempts, timing
- sanitized input/output summaries
- error code and summary
- unique `(run_id, action_id)`

### 9.7 `database_automation_delivery`

Durable external delivery record for notification, Gmail, webhook, and Slack:

- run/action/destination hash
- kind, stable delivery ID, status
- attempts, next attempt, lease, provider reference
- response status and bounded error metadata
- unique run/action/destination hash

### 9.8 Secrets and connectors

Add `automation_secret` with ciphertext, IV, key version, owning workspace/user,
purpose, and timestamps. Add Slack account/workspace connection tables using the
same ownership and encryption patterns as Gmail. Add a dedicated
`AUTOMATION_SECRET_ENCRYPTION_KEY` deployment secret and rotation runbook.

### 9.9 Notifications

Add user/workspace-scoped `notification` and `notification_outbox` tables with
read state, safe rich text, source entity reference, and retention indexes.

## 10. Runtime architecture

```text
canonical row mutation transaction
  -> write row/property/page changes
  -> write realtime outbox
  -> merge automation event window (unless origin=automation)
  -> commit

event window closes after 3s
  -> evaluator claims window
  -> reload row + schema + view filter + active automation revisions
  -> create one idempotent run per matching automation
  -> enqueue run

automation worker claims run
  -> recheck owner, source, target, connector, lock, and dependency authority
  -> execute actions in order using durable step receipts
  -> publish normal realtime/navigation/notification events
  -> succeed, retry, or pause automation on terminal failure

schedule scanner
  -> claim due automation + advance nextRunAt transactionally
  -> create idempotent occurrence run
  -> enqueue run through the same worker
```

### 10.1 Mutation-fact contract

Extend commit helpers with optional source-level facts rather than deriving
automation semantics from realtime deltas:

```ts
type DatabaseAutomationMutationFact = {
  dataSourceId: string
  rowId: string
  pageId: string
  origin: DatabaseMutationOrigin
  actorId?: string | null
  rowAdded?: boolean
  changedValues: Array<{
    propertyId: "name" | string
    before: unknown
    after: unknown
  }>
  automationRunId?: string
}
```

The fact merge occurs inside the same transaction passed to the commit helper.
Realtime behavior remains independent and unchanged.

### 10.2 Worker contracts

The runtime adapter exposes one versioned background dispatcher:

- `dispatchBackgroundTasks({ env, tasks })`
- optional `publishNotification`
- optional `sendAutomationWebhook` only if an edition needs custom egress;
  core retains URL validation and policy
- Slack connector methods or a provider-neutral outbound connector interface

Hosted Cloudflare routes automation windows and runs through the fast and
automation queues owned by the dedicated background Worker. Minute cron only
claims leased maintenance tasks. Self-hosted Node uses PostgreSQL LISTEN/NOTIFY,
one precise timer per lane, and a jittered 30-second recovery sweep; it performs
no one-second polling.

### 10.3 Concurrency and idempotency

- PostgreSQL `FOR UPDATE SKIP LOCKED` claims bounded batches.
- Expired leases are recoverable.
- Event evaluation and schedule occurrence uniqueness prevent duplicate runs.
- Every action has a deterministic idempotency key derived from run and action.
- Internal creates/edits reserve receipts in the mutation transaction.
- External deliveries keep one stable delivery ID across retries.
- Action order is sequential within one run; independent runs may execute in
  parallel subject to workspace, automation, and provider concurrency limits.
- Default limits: 10 concurrent runs per workspace, 1 active run per automation
  for schedules, and provider-specific outbound limits.

## 11. Required mutation-path coverage

Every path below must either emit an eligible fact or explicitly document a
suppressed origin:

| Mutation path | Required behavior |
| --- | --- |
| Database cell API/service | before/after property fact |
| Row-page property API | one source fact per distinct source, not per linked container |
| Row-page title/page metadata route | title fact only for name changes; metadata is not a trigger property |
| Row creation | page-added window plus initial title/status/property facts |
| Move into another source | page added on target; no property edit on source deletion |
| Kanban/group drag that changes a group property | user-origin before/after property fact; pure position movement emits none |
| Form submission | form origin, page added plus submitted initial values |
| CSV/import/template application | import origin; bounded page-added facts |
| Mail database synchronization | integration origin with exact changed properties |
| AI database actions | AI origin after user confirmation |
| Public/API-key mutations | API origin and resolved actor/service identity |
| Automation internal actions | automation origin; always suppressed |
| Pure row reorder or view edit | no row property trigger |
| Property type conversion and sub-item relation backfill | explicit system-origin suppression; these are schema migrations, not row edits |
| Row delete/restore | no trigger in parity release |
| Relation reciprocal update | same causal origin; facts for each actually changed row, except automation suppression |

A repository-wide mutation audit is an acceptance artifact for the foundation
pass. No direct table write to `page_property_value`, row title, or active row
insertion may bypass the fact contract without an explicit suppression comment
and test.

## 12. Permissions, ownership, and policy

### Manage-time rules

- Actor must be an active workspace member, not a page guest.
- Actor must have `full` access to the source's parent database.
- View scopes and all target data sources must be in the same workspace.
- Actor must have full source access and edit target access at save time.
- Connector actions additionally require ownership of the selected connection.
- Locked source databases cannot create or edit automations.

### Run-time rules

- Run as `owner_user_id`, not as the triggering actor and not as an unrestricted
  service account.
- Recheck active membership and effective access for source, trigger page,
  target databases/pages, and connectors immediately before use.
- Never broaden page access. Restricted/private/shared targets that the owner
  cannot edit cause a terminal dependency/permission error.
- If owner is removed, expires, loses full source access, or deletes their
  account, pause every owned automation and notify eligible database managers.
- Transfer ownership is explicit, audited, and requires the new owner to
  reselect Gmail/Slack connections and secrets.
- Workspace/edition policy may disable webhooks, Gmail, Slack, or all
  automations. Server validation and execution enforce the policy.

### Definition validation

Validation compiles the entire definition and returns field-addressed stable
errors. It checks schema/type compatibility, dangling IDs, action order and
variable references, circular variable dependencies, schedule validity, view
source, target access, connector state, action/trigger limits, webhook safety,
and secret references. The API rejects invalid saves; the UI is not the
security boundary.

## 13. API plan

Keep routes under the database surface while using canonical source IDs:

- `GET /databases/:databaseId/automations?dataSourceId=...`
- `POST /databases/:databaseId/automations`
- `POST /databases/:databaseId/automations/validate`
- `GET /databases/:databaseId/automations/:automationId`
- `PATCH /databases/:databaseId/automations/:automationId`
- `POST /databases/:databaseId/automations/:automationId/pause`
- `POST /databases/:databaseId/automations/:automationId/resume`
- `POST /databases/:databaseId/automations/:automationId/duplicate`
- `DELETE /databases/:databaseId/automations/:automationId`
- `GET /databases/:databaseId/automations/:automationId/runs`
- `GET /databases/:databaseId/automations/:automationId/runs/:runId`
- `GET /databases/:databaseId/automation-catalog?dataSourceId=...`

Connector setup remains workspace/user scoped. Definitions and revisions use
optimistic concurrency (`If-Match` revision/version) so two editors cannot
silently overwrite each other. Creation and duplication accept idempotency
keys. Error responses use stable codes and field paths.

Automation state is not included in the normal database payload, preventing
secret/config overfetch and cache churn. A separate TanStack Query root handles
automation list/detail/run data. Normal database realtime mutations continue to
update rows produced by actions.

## 14. Frontend plan

Add `apps/web/src/features/databases/automations/` with clear layers:

- `contracts/`: shared API and definition types imported from
  `@zilobase/features` where possible.
- `model/`: builder reducer, validation presentation, summaries, dependency
  catalog, action ordering, and query/mutation hooks.
- `components/`: list panel, builder, scope selector, trigger editors, action
  editors, token/expression input, schedule editor, connector selectors, error
  banner, and run history.
- `pages/` only if a dedicated run detail route becomes necessary.

Reuse the existing database condition editor after extracting generic
condition controls. Reuse existing property type icons, searchable selectors,
date controls, person targets, dialog/drawer primitives, Gmail connection UI,
and formula editor components.

Accessibility requirements:

- Keyboard-operable reorder controls in addition to drag/drop.
- Labeled condition/action rows and error associations.
- Focus restoration when adding/removing nested editors.
- Screen-reader announcement of validation, save, pause, and connector status.
- View-settings-style desktop management dropdown with a responsive mobile
  drawer.
- Centered, scroll-safe desktop builder dialog with the responsive mobile
  dialog/drawer treatment supplied by the shared Zilobase primitives.
- No color-only status communication.

## 15. Observability, limits, and retention

Structured events include:

- window opened/merged/claimed/discarded;
- definition validated/created/revised/paused/resumed/deleted;
- run queued/started/succeeded/failed/skipped/recovered;
- step started/succeeded/retried/failed;
- delivery attempted/retried/succeeded/failed;
- dependency invalidated and owner authority revoked.

Metrics:

- due event windows and oldest age;
- due schedules and schedule lag;
- queued/running runs and oldest age;
- success/failure/skip rate by trigger/action type;
- step and total latency percentiles;
- retry and lease-recovery counts;
- provider response/rate-limit counts;
- automatic pause count by error code.

Initial safety limits:

- 100 active automations per data source;
- 20 trigger clauses, 50 actions, 5 webhook actions;
- 1,000 target rows per edit-pages action;
- 20 notification recipients;
- 100 resolved email recipients after To/CC/BCC deduplication, further limited
  by Gmail;
- 10 concurrent runs per workspace;
- 60-second internal run budget excluding durable external retry delay;
- 7-day detailed step logs, 30-day run summaries, and configurable retention
  for self-hosted deployments.

Limits are server-owned constants/config with user-safe errors. Edition hooks
may lower or raise them but cannot bypass security bounds.

## 16. Multi-pass implementation plan

Each pass ends with focused unit/integration tests, relevant server/web builds,
hosted adapter tests, self-hosted tests, migration review, documentation update,
and one reviewable commit. Feature UI stays disabled until the end-to-end slice
for that pass is safe.

### Pass 0 — contract and parity baseline

- Check in this specification.
- Add shared versioned definition TypeScript types and Zod schemas without
  routes or behavior.
- Add a parity checklist mapping every reference behavior to a pass/test.
- Record a repository-wide inventory of row mutation paths.

Acceptance: every requested trigger/action/restriction is either specified,
mapped to a pass, or explicitly out of scope. No product behavior changes.

### Pass 1 — shared deterministic database semantics

- Move filter types, normalization, and predicate evaluation from web-only code
  into `@zilobase/features`.
- Move formula parser/evaluator/value types into a shared environment-neutral
  module.
- Inject clock/timezone into relative-date and formula evaluation.
- Add server row snapshot loaders, computed property evaluation, and bounded
  relation traversal.
- Update the web database view/formula paths to consume shared modules without
  behavior regressions.

Acceptance: identical fixtures produce identical server/web predicate and
formula results, including null, zero, false, date ranges, people, relations,
Unicode text, DST, and invalid expressions.

### Pass 2 — schema, CRUD, validation, and permissions

- Add automation, revision, dependency, secret, run, step, delivery, and event
  window tables and rollback/upgrade coverage.
- Implement definition compiler and complete validation.
- Implement list/create/read/update/pause/resume/duplicate/delete routes with
  full-access and non-guest enforcement.
- Implement dependency invalidation hooks for property/view/source deletion,
  property type changes, and select/status/multi-select option deletion.
- Add audit extension events.

Acceptance: invalid definitions never persist; concurrent edits conflict
cleanly; dangling/type-changed dependencies pause active automations; no secret
is returned or logged.

### Pass 3 — transactional event capture

- Add mutation origin and automation fact contracts to commit services.
- Implement three-second source/row window merging in the same transaction.
- Convert every mutation path in the coverage table.
- Add cleanup/recovery and event-window metrics.
- Keep evaluation disabled behind the rollout flag.

Acceptance: rollback leaves neither row changes nor facts; linked containers
produce one window; same-value writes do not trigger; change-then-revert within
three seconds cancels; concurrent writes merge deterministically; automation
origin never opens a window.

### Pass 4 — evaluator and internal action slice

- Claim closed windows and evaluate page-added/property conditions plus view
  scope.
- Create idempotent runs pinned to revisions.
- Add Node worker and Cloudflare automation queue.
- Implement define-variables, edit-trigger-page, add-page, and bounded
  edit-pages actions using canonical mutation services.
- Add atomic initial row values and atomic bulk row updates.
- Add error pausing and basic run history API.

Acceptance: project-management fixtures execute all internal workflows,
survive worker termination/retry without duplicate rows, publish normal
realtime deltas, and never chain automation-triggered changes.

### Pass 5 — schedule engine

- Implement timezone-aware recurrence calculation and next occurrence tests.
- Add due schedule claims, occurrence uniqueness, missed-run policy, and lease
  recovery.
- Change hosted cron to one-minute schedule scanning while retaining less
  frequent maintenance tasks as appropriate.
- Add self-hosted one-minute scanner and deployment health checks.

Acceptance: daily/weekly/monthly/yearly/custom fixtures work across leap years,
month ends, DST gaps/folds, start/end dates, downtime, and concurrent scanners.
Scheduled definitions reject edit-trigger-page actions.

### Pass 6 — automation management UI

- Add toolbar entry, list panel, full builder, scope and trigger controls,
  ordered internal action editors, formula/mention input, inline validation,
  status controls, linked-source messaging, and run history.
- Add cache keys, optimistic concurrency, accessibility, responsive layout, and
  browser workflow tests.
- Expose the feature to a development-only capability flag.

Acceptance: a full-access member can build, edit, pause, repair, resume,
duplicate, inspect, and delete internal-action automations from inline and
full-page databases; lower-access users and guests cannot manage them.

### Pass 7 — in-product notifications

- Add notification persistence, APIs, unread/read UI, realtime outbox, hosted
  adapter, and self-hosted recovery.
- Implement recipient resolution and notification automation action.
- Add retention and permission-safe page links.

Acceptance: up to 20 valid recipients receive one durable notification per
delivery ID; inaccessible references and removed recipients do not leak.

### Pass 8 — Gmail action

- Adapt existing Gmail connection/send infrastructure to durable automation
  deliveries.
- Add protected builder fields, connection owner rules, retries, provider
  receipts, reconnect invalidation, and ownership transfer behavior.
- Enable corresponding cloud/self-host configuration gates.

Acceptance: duplicate worker delivery does not intentionally create duplicate
operations; revoked/reconnect-required accounts pause affected automations;
non-owners cannot inspect protected configuration.

### Pass 9 — webhook action

- Add encrypted custom headers, SSRF-safe egress, payload schema, retries,
  delivery IDs, admin policy, and builder.
- Add integration tests with controlled DNS/redirect/private-address fixtures.
- Document receiver deduplication and self-hosted egress policy.

Acceptance: public HTTPS endpoints receive the selected property payload;
private/metadata/redirect attacks fail before connection; terminal failures
pause the automation; retry attempts reuse one delivery ID.

### Pass 10 — Slack action

- Add Slack OAuth/connection/channel infrastructure, encryption, policy, and
  revocation handling.
- Implement durable Slack delivery, formatting/mentions, rate limits, and UI.
- Add provider-contract tests and deployment docs.

Acceptance: authorized channels receive one logical message per delivery;
revoked or unauthorized connections pause affected automations; DMs remain
unavailable and formulas must flow through defined variables.

### Pass 11 — hardening and general availability

- Run load, queue backlog, lease-loss, provider outage, database failover,
  migration/rollback, and security tests.
- Finish health endpoints, alerts, dashboards, quotas, cleanup, audit export,
  threat model, operator runbooks, and customer documentation.
- Audit all direct row/property table writes again.
- Remove development-only gates after hosted canary and self-host upgrade tests.
- Update Ask AI's capability registry only if AI automation creation is
  deliberately product-approved; it remains unavailable by default.

Acceptance: parity matrix is green; hosted and self-hosted canaries pass;
rollback preserves definitions/runs safely; no P0/P1 security or durability
findings remain.

## 17. Test and acceptance matrix

At minimum, automate these suites:

### Trigger correctness

- Every property kind/operator, null/empty/zero/false distinction, invalid
  operands, same-value writes, title changes, page creation, initial values.
- `any` and `all`, multiple edits inside/outside three seconds, revert inside
  window, concurrent actors, linked sources, view membership after edit.
- Origin matrix proving user/button/form/API/import/integration/AI eligibility
  and automation/system suppression.
- Locked, deleted, restricted, invalid-view, invalid-property, and paused states.

### Action correctness

- Sequential variables and outputs; all set/add/remove/clear modes.
- Same-source and cross-source internal writes, relation traversal, bulk bounds,
  and partial-failure prevention.
- Missing targets, changed property types, revoked authority, owner removal,
  connector revocation, and error pause/resume.
- External delivery timeout, retry, rate limit, stable ID, secret redaction, and
  terminal response behavior.

### Durability and concurrency

- Transaction rollback, queue send failure, worker crash before/after each
  receipt boundary, expired leases, duplicate queue messages, multiple workers,
  deployment restart, PostgreSQL reconnect, and clock skew bounds.
- Schedule uniqueness and DST/leap/month-end fixtures.
- Realtime database state after automation mutations and missed publish retry.

### Security

- Guests, removed/temporary-expired members, each access level, linked-source
  confusion, cross-workspace IDs, forged property/view IDs, stale revisions.
- SSRF DNS rebinding, redirects, IPv4/IPv6 private ranges, metadata services,
  credential URLs, header injection, response bombs, secret/log leakage.
- Gmail/Slack connection ownership and transfer.
- Formula complexity, regex, relation fan-out, oversized lists, and resource
  exhaustion.

### UI

- Create/edit/pause/resume/repair/delete/duplicate/history workflows.
- Inline/full-page/linked-source databases, keyboard-only, screen reader labels,
  mobile widths, stale concurrent edits, offline/network errors, and connector
  reconnect states.

## 18. Rollout and operations

Use one server-owned capability flag with phases:

1. schema and capture dark launch;
2. internal staff evaluation with actions disabled;
3. internal actions for selected workspaces;
4. schedules;
5. notification/Gmail/webhook/Slack actions independently;
6. hosted canary;
7. self-hosted opt-in;
8. general availability.

Dark capture must be sampled or bounded and have a kill switch. Disabling
execution must not delete definitions or run history. Operators can pause all
automation claims globally while ordinary database mutations continue.

Required runbooks cover queue backlog, stale event windows, schedule lag,
runaway workflows, provider outage, leaked webhook secret rotation, Gmail/Slack
revocation, owner removal, encryption key rotation, cleanup, and rollback.

## 19. Definition of done

Database automations are done when:

- All parity-reference triggers, scopes, actions, restrictions, and error states
  in this document work in web and desktop.
- Hosted and self-hosted deployments execute and recover the same definitions.
- Every supported mutation path participates in the transactional fact
  contract, and automation origin cannot chain.
- View filters and expressions have one shared deterministic implementation.
- Internal actions are idempotent and external deliveries have stable IDs,
  documented at-least-once semantics, safe egress, and redacted logs.
- Permissions are rechecked at manage time and run time; guests and inaccessible
  content never leak.
- Schedules pass timezone/DST/downtime tests.
- Error pause, repair, manual resume, dependency invalidation, and run history
  are usable and observable.
- Migration, upgrade, rollback, retention, quotas, alerts, docs, threat model,
  and operator runbooks are complete.

## 20. Decisions fixed by this plan

1. Automation ownership is data-source-level, preventing duplicate behavior
   across linked containers.
2. Realtime deltas are not automation events; a transactional semantic fact
   contract is required.
3. The reference three-second window is implemented explicitly, including
   change cancellation.
4. Automation-origin mutations are suppressed at capture time.
5. Runs use the automation owner's current authority, never a privileged global
   service identity.
6. Definitions are versioned JSON with extracted dependencies and separate
   encrypted secrets.
7. Internal actions use canonical services and durable receipts. External
   actions are at-least-once with stable delivery IDs.
8. Filter and formula semantics become shared server/client code before the
   engine ships.
9. The automation engine is runtime-neutral; Cloudflare queues and Node polling
   are adapters around the same database-backed state machine.
10. Database buttons are not part of this release, but action definitions are
    intentionally reusable for them later.
