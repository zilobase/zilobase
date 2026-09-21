# Editor

## Purpose, ownership and interfaces

The browser editor composes Tiptap, structural blocks, comments, selection tools and Yjs collaboration. [The feature entrypoint](../../../apps/web/src/features/editor/index.ts) exposes `Editor` and `PageEditPreviewControls`. Internal consumers use `@/features/editor`; local editor imports use relative paths.

| Capability | Owning modules |
| --- | --- |
| Assembly and extension selection | [composition](../../../apps/web/src/features/editor/composition), including `create-base-extensions.ts` and `use-editor-extensions.ts` |
| Editor instance and live integration registry | [runtime](../../../apps/web/src/features/editor/runtime) |
| Node behavior and node views | [extensions](../../../apps/web/src/features/editor/extensions) |
| Block, column, table and database-page movement | [drag-drop](../../../apps/web/src/features/editor/drag-drop) |
| Formatting controls and toolbar contracts | [toolbar](../../../apps/web/src/features/editor/toolbar) |
| Page layout canvas and tabs | [layout](../../../apps/web/src/features/editor/layout) |
| Insertion and editing commands | [commands](../../../apps/web/src/features/editor/commands) |
| Paste decisions and structural protection | [paste](../../../apps/web/src/features/editor/paste) |
| Selection, AI preview and comment popovers | [selection](../../../apps/web/src/features/editor/selection) |
| Document connection and presence | [collaboration](../../../apps/web/src/features/editor/collaboration) |

Cross-feature consumers use these additional concrete interfaces: [page-editor-registry](../../../apps/web/src/features/editor/runtime/page-editor-registry.tsx) for app registration and AI live edits; [use-page-collaboration](../../../apps/web/src/features/editor/collaboration/use-page-collaboration.ts) for page document connections; [collaboration-presence](../../../apps/web/src/features/editor/collaboration/collaboration-presence.tsx) for database metadata; [meeting](../../../apps/web/src/features/editor/extensions/meeting/index.ts) for meeting screens; [editor-ai-utils](../../../apps/web/src/features/editor/commands/editor-ai-utils.ts) for markdown edits; [block-drag-session](../../../apps/web/src/features/editor/drag-drop/block-drag-session.ts) for desktop tab drag detection; and [database-editability](../../../apps/web/src/features/editor/database-editability.ts) for page database controls. [Core contracts](../../../apps/web/src/features/editor/core/types.ts) describe the existing page integration. These are separate imports to avoid pulling editor assembly into state-only consumers.

## Main flow

Page composition supplies content, editability, metadata callbacks and collaboration state. Editor composition assembles extensions and initial content, then the runtime owns the Tiptap instance. Chrome composes layout, toolbar, selection and drag controls around it. Extensions retain their node-specific behavior. The collaboration field and provider-presence key determine when the editor must be recreated; provider readiness must install the collaboration caret extension.

[Page-context and focused editor packages](../../platform/page-context-and-editor-utilities.md) own structural-content/markdown conversion and comment anchors across runtimes. They are not browser editor composition modules.

## Authorization and persistence

The editor receives access and editability decisions; server authorization remains authoritative. Yjs collaboration and page persistence own durability. Structural blocks retain page/database associations. Locks, comments and database editing have distinct gates; moving their UI does not unify those policies.

## Side effects, failures and recovery

Commands affect selection, undo, collaboration and embedded content. Mount/unmount and reconnect require lifecycle cleanup. AI preview/apply uses the editing registry rather than independently mutating a mounted document. Paste and drop must retain protected structural content. A meeting node currently composes another editor for its fields; that existing composition dependency remains explicit rather than hidden in a barrel.

## Verification and change points

[Editor tests](../../../apps/web/test/features/editor) cover structural drag/drop, protected blocks, column/table behavior and editor integration. [Meeting tests](../../../apps/web/test/features/meetings) also protect collaboration-field and summary behavior. Keep structural assertions for wiring and use observable tests for document changes. Run web tests, typecheck, production build, and architecture checks after relocating modules; discovery paths must follow moves.

Update this guide with implemented changes. See [testing and quality](../../setup/testing-and-quality.md) and the [architecture index](../../README.md).

## Editing and connection lifecycles

[page-editor-handle](../../../apps/web/src/features/editor/runtime/page-editor-handle.ts) owns the editing capability used by pages and AI. Pages supply a live editor lookup, editability, synchronization and content-change callback; AI consumes the handle from the registry. JSON writes report the editor's applied JSON. Markdown writes use the same parser and structural-marker restoration as selection editing. Preview controls are read when an action runs, so replacement controls do not leave stale closures. The handle retains the existing readiness checks and set-content/undo semantics; it does not decide page authorization or persist AI proposals.

[connection-session](../../../apps/web/src/features/editor/collaboration/connection-session.ts) owns deferred ticket resolution, provider attachment, awareness, synchronization confirmation and disposal. Its production services come from the [collaboration connection](../../../apps/web/src/features/editor/collaboration/collaboration-connection.ts) and platform request runtime; controlled tests supply those mechanisms without sockets. React binds session events to state in `use-page-collaboration.ts`. Connectivity changes reconnect the provider. Page composition supplies demo/local-only mode, keeping demo selection out of the reusable connection module.

A prepared ticket is consumed once. Provider creation applies ticket state first and disables immediate connection; the existing deferred React connect phase remains separate. Access denial blocks the document; transient network failure disconnects. Disposal cancels scheduled startup, aborts ticket fetching and destroys the provider before clearing exposed state. Late ticket and provider events are ignored.

[Connection lifecycle tests](../../../apps/web/test/features/editor/connection-session.test.mjs) cover these orderings, denial, late completion and presence deduplication. [Handle tests](../../../apps/web/test/features/editor/page-editor-handle.test.mjs) cover write gating, content callbacks, readiness and current preview controls. Keyboard and clipboard structural protection continues to share [the protected-block guard](../../../apps/web/src/features/editor/paste/protected-structural-blocks.ts), and markdown restoration continues to use page-context; their distinct selection and document-conversion semantics remain separate.

[Block conversion](../../../apps/web/src/features/editor/commands/block-insert.ts) owns replacement content for the drag menu. Paragraph/heading conversions preserve nonblank text; other block types retain their existing insertion defaults. The menu owns selection and the single delete/insert command chain. [Conversion tests](../../../apps/web/test/features/editor/block-conversion.test.mjs) preserve text, whitespace and fallback behavior.

Database and meeting creation use the shared [structural-insertion transaction](../../../apps/web/src/features/editor/commands/structural-insertion.ts) for both slash commands and the block menu. The transaction remains pending until the created structural node is in the editor, allowing page hierarchy recovery to defer competing full-document restoration. Its [tests](../../../apps/web/test/features/editor/structural-insertion.test.mjs) cover successful ordering and failure cleanup.

Page composition reruns hierarchy recovery when the editor instance becomes
ready, rather than relying on a later navigation update. A committed database
placement therefore cannot remain absent after reload merely because recovery
ran before the editor handle existed. While the collaboration provider reports
unacknowledged changes, the editor registers a browser reload guard instead of
allowing silent data loss.

Soft-deleted database references discovered in collaborative page documents are
removed by their [node view](../../../apps/web/src/features/databases/core/database-block.tsx)
without creating a new undo entry or starting deleted-resource realtime work.
The drag menu treats an embedded database deletion as one history operation: it
removes the editor node without creating a second global undo entry and pairs
that node history with the database trash/restore mutation through
[structural-block delete history](../../../apps/web/src/features/editor/drag-drop/structural-block-delete-history.ts).
Ctrl+Z and redo therefore transition the resource and editor node together.
References left by deletion outside that page scope are permanent cleanup, so a
later page edit or reload cannot resurrect the deleted embed.

[Column controls](../../../apps/web/src/features/editor/toolbar/column-controls.tsx) coalesce pointer events into one animation frame before applying hover state. Existing control targets take precedence over geometric hit testing, and active drag/pointer/menu states suppress hover changes. Frame cancellation and listener cleanup remain in the effect.

Database-page drops show a local card immediately through [pending-page-embed](../../../apps/web/src/features/editor/drag-drop/pending-page-embed.ts). Its ProseMirror decorations map the drop position through intervening edits without putting an unconfirmed relationship in persisted or collaborative content. Success replaces the preview with a page block without moving focus or scrolling; failure removes only that operation’s preview and reports the error. Deleted anchors, destroyed editors and lost editability suppress late insertion. [Pending embed tests](../../../apps/web/test/features/editor/pending-page-embed.test.mjs) exercise delayed success, concurrent failure, typing, deletion and lifecycle changes.
