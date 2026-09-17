# Automation editing and history

## Purpose and owners

[DatabaseAutomationManager](../../../apps/web/src/features/automations/database-automation-manager.tsx) is the browser entrypoint. It renders list/history navigation, the editing dialog and discard confirmation. [Manager state](../../../apps/web/src/features/automations/use-automation-manager.ts) owns selected automation/run IDs, the editing baseline, query subscriptions, validation and save coordination. The existing [manager screens](../../../apps/web/src/features/automations/database-automation-screens.tsx) remain a small, cohesive set of list and run-history presentations.

[Draft rules](../../../apps/web/src/features/automations/definition/automation-draft.ts) convert editor state to definitions and back, preserve typed trigger operands and derive names. [Schedule rules](../../../apps/web/src/features/automations/definition/schedule-model.ts) own schedule serialization and labels. These modules have no runtime React or presentation dependency. [Definition builder](../../../apps/web/src/features/automations/definition/automation-builder.tsx), [trigger controls](../../../apps/web/src/features/automations/definition/automation-trigger-controls.tsx) and [property-action controls](../../../apps/web/src/features/automations/actions/property-action-controls.tsx) own their editing interactions. [Property-action rules](../../../apps/web/src/features/automations/actions/property-action-model.ts) convert values and label compact actions. Trigger and action pickers reuse the same [picker controls](../../../apps/web/src/features/automations/automation-picker-controls.tsx); their different operator/value flows remain separate.

## Flow, authorization and persistence

Opening an existing definition converts the server detail into a draft and records its serialized baseline. Creating an automation starts with empty triggers/actions. Incomplete event triggers or missing actions do not produce a savable definition. The manager requests server validation after 250 ms and cancels a pending validation timer when its inputs change. The server compiler remains authoritative; browser validation and capability visibility do not grant management access.

Save first [materializes new webhook header secrets](../../../apps/web/src/features/automations/definition/materialize-webhook-secrets.ts) sequentially through the existing secret mutation, then rebuilds the definition with secret IDs. It updates an existing automation with the loaded version or creates a new one. The baseline and screen change only after the save resolves. Shared [React bindings](../../../packages/features/src/automations/react) retain query keys and invalidation policies. The definition never receives plaintext draft header values.

Closing a dirty editor requests discard confirmation. Run/list navigation stays independent of draft conversion; run history is read through the existing authorized server operations. Slack connection selection retains the explicit OAuth window-opening action in browser presentation.

## Failures, recovery and verification

Validation errors disable saving and display the existing server message. Secret creation or versioned-save failure leaves the editing draft/baseline unchanged and exposes the mutation error. Secrets already created before a later failure are not rolled back by this refactor. Discard resets editor navigation through the same manager commands.

[Draft tests](../../../apps/web/test/features/databases/automation-draft.test.mjs) cover incomplete input, typed date operands, schedule round trips, action ordering and literal conversion; they also inspect the bundled dependency graph for runtime React/UI imports. [Secret materialization tests](../../../apps/web/test/features/databases/automation-secret-materialization.test.mjs) cover sequential creation, existing secret reuse, immutable input and failure propagation. The initial characterization ran against extracted copies before wiring. [UI integration checks](../../../apps/web/test/features/databases/database-automations.test.mjs) still inspect source for structural presentation behavior; they do not establish browser focus, picker interaction or effect timing. Browser smoke remains complementary to these checks.

[Automation overview](README.md).
