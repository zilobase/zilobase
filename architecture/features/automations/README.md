# Database automations

## Owning modules and interface

- [apps/server/src/features/automations](../../../apps/server/src/features/automations)
- [apps/web/src/features/automations](../../../apps/web/src/features/automations)
- [packages/features/src/automations](../../../packages/features/src/automations)

## Main flow

Definition lifecycle compiles and validates automations. Triggers and schedules produce durable work. The run engine claims work, loads pinned execution context, executes actions and records results; the web manager edits definitions and displays history.

Automation list, audit and catalog routes share source-query validation inside their transport module: authentication precedes trimmed `dataSourceId` validation and the existing `AUTOMATION_SOURCE_REQUIRED` error. Other route bodies keep their schema validation.

## Authorization and persistence

Definitions/revisions, runs, step runs, receipts and secrets live in Postgres. Execution rechecks access and uses the pinned revision. Provider connections and protected configuration remain owner-scoped.

## Side effects, failures and recovery

External actions can send Gmail/Slack messages or webhooks. Retries must reuse delivery identities and receipts. Leases, revision pinning, permission denial and provider reconnect states are part of the execution interface.

## Focused guides

- [Automation execution lifecycle](execution.md)
- [Automation editing and history](editor.md)

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/automations/history/history-maintenance.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

## Capability ownership

The server keeps transport in `http/routes.ts` and `http/slack-routes.ts`. Slack OAuth completion is `/automation-slack/oauth/callback` and is a Node API path. The explicit [management interface](../../../apps/server/src/features/automations/service.ts) preserves its existing exported operations. Its implementation is grouped by capability:

- [Definition](../../../apps/server/src/features/automations/definition): management access/context loading, definition reads, lifecycle writes, validation and dependency catalog invalidation.
- [Compilation](../../../apps/server/src/features/automations/compilation): pure definition compilation and reference traversal.
- [Triggers](../../../apps/server/src/features/automations/triggers): transaction-bound fact capture, event-window evaluation, trigger matching and scheduled occurrence materialization.
- [Execution](../../../apps/server/src/features/automations/execution): run claiming, pinned context loading and action dispatch.
- [Actions](../../../apps/server/src/features/automations/actions): expression values, internal mutations, Gmail/Slack/webhook outcomes, Slack credentials, secret encryption and pinned webhook egress.
- [History](../../../apps/server/src/features/automations/history): authorized run/step reads, audit exports, retention cleanup and aggregate health.

Background composition imports the run engine, event evaluator, scheduler and history maintenance through those concrete entrypoints; mutation owners use trigger fact capture inside their transactions. The public server adapter aggregate preserves all existing exported names. Moving a file does not change its transaction, lease or authorization boundary.

The web manager remains the feature's entrypoint and composition owner. [Definition controls](../../../apps/web/src/features/automations/definition) own schedule/select editing; [action controls](../../../apps/web/src/features/automations/actions) own the Notion-style action builder and its model. The manager screens remain together as a cohesive presentation module; the manager hook owns their navigation and editing state as described in the editor guide.

The shared package keeps contracts and pure schedule calculation at `automations`. React query options, hooks and query tests live behind the explicit [React entrypoint](../../../packages/features/src/automations/react/index.ts). Package subpaths are `./automations` and `./automations/react`; the duplicate `./databases/automations*` aliases are removed. Database test discovery includes nested automation tests; server tests remain adjacent to their owning capabilities and web tests remain under the feature test root.

Moving the compiler exposed its action-dispatch callback at the existing complexity gate. The compiler now delegates edit-pages, notification, Gmail, webhook and Slack validation to local named validators. They share the compilation state deliberately: reference availability is checked before each action and the completed-action set advances afterward. Error order, paths, dependencies, capabilities and the resulting definition hash remain unchanged; existing compiler scenarios cover these outcomes.

[Slack OAuth behavior tests](../../../apps/server/src/features/automations/actions/slack-oauth.test.ts) exercise single-use attempt consumption before token exchange, grant rejection and owner-scoped credential encryption. They use real secret encryption and controlled database/provider operations, with no external OAuth requests.

[Row-operation tests](../../../apps/server/src/features/automations/actions/row-operations.test.ts) exercise the mutation/commit seam: access before fact-row locks, sequential property edits, first-before/final-after facts and missing-target rejection before writes. [Event-window tests](../../../apps/server/src/features/automations/triggers/event-evaluator.test.ts) preserve revision pinning, duplicate insertion handling and locked/revoked/view-mismatch outcomes with controlled persistence and dispatch.
