# Settings drafts and publication

## Interface

[Settings routes](../../../apps/server/src/features/ai/settings/routes.ts) resolve a SettingsActor from authenticated user, workspace and scope. Scope is personal or an agent profile identifier. Custom-agent routes require their feature configuration. [Shared contracts](../../../packages/features/src/ai-chat/settings-contract.ts) define definitions, drafts, versions and review state.

The [settings implementation](../../../apps/server/src/features/ai/settings/settings-service.ts) exposes readSettings, updateSettingsDraft, discardSettingsDraft, settingsVersions and publishSettings. Version-bearing mutations carry baseVersion and draftVersion. Conflict responses are part of the interface; callers must reload rather than overwrite silently.

## Flow and persistence

Initial reads authorize the actor and establish a settings baseline from current profile, resources, triggers and connector tools. Saved settings and saved versions are distinct from a user's draft. Instruction pages provide collaborative content and are hydrated into definitions; they are not merely a textarea field in the draft table.

The [draft hook](../../../apps/web/src/features/ai/settings/use-settings-draft.ts) owns queued writes, local recovery, polling and cross-tab invalidation. Callers flush pending drafts before conversation or connector actions that depend on current settings. Publishing validates resource/connector authority and materializes runtime profile, trigger and grant state.

## Change safety

Preserve version conflict detection, draft ownership, instruction-page synchronization and transactional publication. Keep provider effects separate from local draft state. Tests should cover two writers, stale base/draft versions, denied resources, publish/discard, and flush-before-action ordering. Follow adjacent tests under the [settings implementation directory](../../../apps/server/src/features/ai/settings).

[AI overview](README.md).

## Implementation boundary

The explicit `settings-service.ts` interface is the server entry point. [Access](../../../apps/server/src/features/ai/settings/settings-access.ts) owns actor scope, authorization and connector-scope predicates. [Record loading](../../../apps/server/src/features/ai/settings/settings-record.ts) creates an empty personal record once and requires every Custom Agent to already have the record created with its profile. It never reconstructs settings from profiles, execution revisions, preference rows or unrelated instruction pages. [Reads](../../../apps/server/src/features/ai/settings/settings-read.ts) compose hydrated saved/draft state and canonical settings-version history; [definition rules](../../../apps/server/src/features/ai/settings/settings-definition.ts) merge instructions and compare canonical content.

[Draft operations](../../../apps/server/src/features/ai/settings/settings-draft.ts) own updates, instruction creation and discard. Their private instruction-page creator writes both the page and Yjs document inside the caller's transaction, preserving the duplicate-submission check before page creation. [Version coordination](../../../apps/server/src/features/ai/settings/settings-versioning.ts) locks the saved settings row and loads only the acting user's draft. Update, discard and publication share this mechanism while retaining their distinct conflict decisions; ordinary reads remain unlocked.

[Publication](../../../apps/server/src/features/ai/settings/settings-publication.ts) orchestrates hydration, validation, materialization, saved-version creation and draft removal inside the existing transaction. [Validation](../../../apps/server/src/features/ai/settings/settings-validation.ts) checks resource grants, trigger configuration/access, connector ownership/tool availability and uniqueness in the established order. [Materialization](../../../apps/server/src/features/ai/settings/settings-materialization.ts) updates the profile/revision, desired triggers, resource/share grants and connector policies as one publication. The version increments only for a changed definition; repeating an already-completed save retains its existing semantics.

The [settings service tests](../../../apps/server/src/features/ai/settings/settings-service.test.ts) exercise canonical initialization, missing-agent invariants, private drafts, stale versions, duplicate instruction creation, AI review/discard, publication idempotency and rollback. Additional cases cover revoked resource grants, connector authenticator restrictions and invalid custom schedules. Draft review derivation and personal-scope validation remain private rules in draft operations. Browser draft flushing and its queue preserve flush-before-action ordering.


## Browser state and presentation

The [draft hook](../../../apps/web/src/features/ai/settings/use-settings-draft.ts) owns the flush queue, storage, cross-tab invalidation and mutation ordering. [Recovery](../../../apps/web/src/features/ai/settings/model/draft-recovery.ts) merges local patches with the incoming snapshot and identifies version conflicts; parsing/storage failures stay in the hook's existing recovery handler. [Summary rules](../../../apps/web/src/features/ai/settings/model/draft-summary.ts) derive changed fields, tabs and dirty state, including pending AI review.

The [settings page](../../../apps/web/src/features/ai/settings/components/agent-settings-page.tsx) keeps state in one composition and uses named render functions for its header, selected capability, instruction pane and version history. These functions do not create component identities or move hooks. [Render tests](../../../apps/web/test/features/ai/settings-page.test.mjs) cover scope tabs, read-only instructions, activity presentation and restore commands; instruction button labels are checked through rendering instead of source text.

Pure [trigger draft rules](../../../apps/web/src/features/ai/settings/model/trigger-draft.ts) own validation and configuration payloads, preserving append-on-edit ordering and webhook defaults. [Connector setup](../../../apps/web/src/features/ai/settings/model/connector-setup.ts) derives provider availability and actor/button permissions; OAuth execution stays in its component. [MCP policy rules](../../../apps/web/src/features/ai/settings/model/mcp-tool-draft.ts) distinguish staged policy defaults from saved settings and derive review highlighting. The [action rules](../../../apps/web/src/features/ai/settings/model/draft-actions.ts) retain the different save/discard conditions for the settings card and sharing popover. Each model has behavioral coverage under the existing web AI test directory.

[Agent metadata rules](../../../apps/web/src/features/ai/settings/model/agent-metadata.ts) prefer draft fields while preserving explicit icon/cover removal. [Trigger materialization tests](../../../apps/server/src/features/ai/agents/agent-revision-service.test.ts) verify secret cleanup ordering, unchanged schedule reuse, changed/resumed schedules and provider-specific initial statuses through the existing synchronization interface.
