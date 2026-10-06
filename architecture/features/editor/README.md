# Editor

## Purpose, ownership and interfaces

The browser editor composes Tiptap, structural blocks, comments, selection tools and Yjs collaboration. [The feature entrypoint](../../../apps/web/src/features/editor/index.ts) exposes `Editor` and `PageEditPreviewControls`. Internal consumers use `@/features/editor`; local editor imports use relative paths.

| Capability                                                    | Owning modules                                                                                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Assembly and extension selection                              | [composition](../../../apps/web/src/features/editor/composition), including `create-base-extensions.ts` and `use-editor-extensions.ts` |
| Editor instance and live integration registry                 | [runtime](../../../apps/web/src/features/editor/runtime)                                                                               |
| Node behavior and node views                                  | [extensions](../../../apps/web/src/features/editor/extensions)                                                                         |
| Drag targeting, column/table geometry and database boundaries | [drag-drop](../../../apps/web/src/features/editor/drag-drop)                                                                           |
| Formatting controls and toolbar contracts                     | [toolbar](../../../apps/web/src/features/editor/toolbar)                                                                               |
| Page layout canvas and tabs                                   | [layout](../../../apps/web/src/features/editor/layout)                                                                                 |
| Structural validation, anchors and resource receipts          | [operations](../../../apps/web/src/features/editor/operations)                                                                         |
| Insertion and editing commands                                | [commands](../../../apps/web/src/features/editor/commands)                                                                             |
| Paste decisions and structural protection                     | [paste](../../../apps/web/src/features/editor/paste)                                                                                   |
| Selection, AI preview and comment popovers                    | [selection](../../../apps/web/src/features/editor/selection)                                                                           |
| Document connection and presence                              | [collaboration](../../../apps/web/src/features/editor/collaboration)                                                                   |

Cross-feature consumers use these additional concrete interfaces: [page-editor-registry](../../../apps/web/src/features/editor/runtime/page-editor-registry.tsx) for app registration and AI live edits; [use-page-collaboration](../../../apps/web/src/features/editor/collaboration/use-page-collaboration.ts) for page document connections; [collaboration-presence](../../../apps/web/src/features/editor/collaboration/collaboration-presence.tsx) for database metadata; [meeting](../../../apps/web/src/features/editor/extensions/meeting/index.ts) for meeting screens; [editor-ai-utils](../../../apps/web/src/features/editor/commands/editor-ai-utils.ts) for markdown edits; [block-drag-session](../../../apps/web/src/features/editor/drag-drop/block-drag-session.ts) for desktop tab drag detection; and [database-editability](../../../apps/web/src/features/editor/database-editability.ts) for page database controls. [Core contracts](../../../apps/web/src/features/editor/core/types.ts) describe the existing page integration. These are separate imports to avoid pulling editor assembly into state-only consumers.

## Main flow

Page composition supplies grouped `DocumentSession`, `EditorCapabilities`, `EditorResourceActions`, `EditorPresentation` and `EditorViewHandle` contracts. Editor composition assembles extensions and initial content, then the runtime owns the Tiptap instance. Chrome composes layout, toolbar, selection and drag controls around it. Extensions retain their node-specific behavior. The collaboration field determines when the editor must be recreated. Page awareness exists before its provider, so transport readiness does not recreate the editor; meeting awareness still comes from its provider.

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

[connection-session](../../../apps/web/src/features/editor/collaboration/connection-session.ts) owns deferred ticket resolution, provider attachment, awareness, synchronization confirmation and disposal. Its production services come from the [collaboration connection](../../../apps/web/src/features/editor/collaboration/collaboration-connection.ts) and platform request runtime; controlled tests supply those mechanisms without sockets. The reference-counted [document-session registry](../../../apps/web/src/features/editor/collaboration/document-session-registry.ts) owns a [page session](../../../apps/web/src/features/editor/collaboration/page-document-session.ts) for each deployment/account/kind/resource key. React subscribes with `useSyncExternalStore` through `use-page-collaboration.ts`, while the [page document cache](../../../apps/web/src/features/editor/collaboration/page-document-cache.ts) retains Yjs content across page switches. Cached pages can be edited during a bounded online startup window; disconnection locks editing and retains already entered updates. Page composition supplies demo/local-only mode.

A prepared cold-page bootstrap is consumed once. Provider creation disables immediate connection; the deferred React connect phase remains separate. Access denial blocks the document; transient network failure disconnects. Disposal cancels scheduled startup, aborts ticket fetching and destroys the provider while the cached Yjs document survives page unmount. Late ticket and provider events are ignored.

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
[resource history](../../../apps/web/src/features/editor/operations/resource-history.ts).
Ctrl+Z and redo therefore transition the resource and editor node together.
References left by deletion outside that page scope are permanent cleanup, so a
later page edit or reload cannot resurrect the deleted embed.

[Column controls](../../../apps/web/src/features/editor/toolbar/column-controls.tsx) coalesce pointer events into one animation frame before applying hover state. Existing control targets take precedence over geometric hit testing, and active drag/pointer/menu states suppress hover changes. Frame cancellation and listener cleanup remain in the effect.

Database-page drops show a local card immediately through [pending-page-embed](../../../apps/web/src/features/editor/drag-drop/pending-page-embed.ts). Its ProseMirror decorations map the drop position through intervening edits without putting an unconfirmed relationship in persisted or collaborative content. Success replaces the preview with a page block without moving focus or scrolling; failure removes only that operation’s preview and reports the error. Deleted anchors, destroyed editors and lost editability suppress late insertion. [Pending embed tests](../../../apps/web/test/features/editor/pending-page-embed.test.mjs) exercise delayed success, concurrent failure, typing, deletion and lifecycle changes.

Page blocks resolve database-row pages from the shared query cache when navigation metadata does not contain them. That external-store bridge subscribes only to database query events and returns the cache-owned page reference as its snapshot; unchanged cache state must retain reference identity so React does not schedule a render loop in side panes.

Editor chrome subscribes to the public Tiptap mount/create/unmount lifecycle before mounting controls that read the ProseMirror view. Effects recheck that their editor is initialized and alive before dispatching, because document replacement can dispose an instance between render and effect execution. This also protects side-pane remounts and React StrictMode effect replay; page metadata remains outside the Yjs body.

## View, drag and history ownership

The app-scoped [workspace](../../../apps/web/src/features/editor/runtime/editor-workspace.ts) owns registered editor views, collaboration-field ownership, the active block drag and one chronological [history coordinator](../../../apps/web/src/features/editor/runtime/editor-history-coordinator.ts). Registrations have tokens; stale cleanup cannot unregister a replacement. Opening an already mounted page focuses its existing pane. Side-pane promotion changes presentation without remounting the editor. Unregistering a participant invalidates its session-only history receipts.

Extensions are assembled for document/field identity. Permission updates use `setEditable(editable, false)` and resource callbacks read stable runtime refs. `useEditor` disables immediate rendering and transaction-driven shell rerenders; toolbar buttons use `useEditorState`. Collaborative initial content comes solely from the hydrated Yjs document. Ordinary collaborative updates inspect [changed reference ranges](../../../apps/web/src/features/editor/operations/changed-page-references.ts); they do not materialize full JSON. Local/demo persistence reads JSON at its debounce boundary, while explicit AI/document reads may serialize.

[Chrome](../../../apps/web/src/features/editor/composition/editor-chrome.tsx) uses the official React DragHandle at the installed Tiptap version. Absolute positioning matches the handle's initial CSS and the pane's coordinate space, keeping its first hover and scrolling aligned. A stable virtual reference aligns controls with padded text, the first line of list items and resource headers. Nested targeting includes the document, lists, tasks, details and columns, with container/table exclusions. The workspace captures selection before native handle selection changes. The [bridge](../../../apps/web/src/features/editor/drag-drop/block-drag-controller.ts) attaches application MIME on a native ancestor listener after the official handler clears DataTransfer; React portal bubbling alone is too early. HTML/text remain available to external applications. One active insertion indicator and pane auto-scroll update in animation frames. Recognized rejected internal drops are consumed, including drops into read-only editors.

[Block operations](../../../apps/web/src/features/editor/operations/block-operations.ts) validate mapped source slices and schema fit, then commit same-document moves in one transaction. Cross-document moves prepare both transactions, insert then delete synchronously, and verify outcomes. Failed deletion compensates only an unchanged destination insertion; otherwise the destination copy survives and the move is incomplete. Cross-document content drops strip comment marks; same-document moves retain them. Temporary anchors use Tiptap mappable positions, without persisted block IDs.

Collaborative history uses public `yUndoPluginKey`/UndoManager events; local history uses exported ProseMirror depths and capture boundaries. Structural receipts verify native stack ownership before undo/redo. Asynchronous [resource history](../../../apps/web/src/features/editor/operations/resource-history.ts) serializes mutations, revalidates after confirmation, and advances the ledger only after success. Database-specific history remains in its own scope; native input/textarea history is not intercepted. [ADR 0016](../../decisions/0016-session-editor-transfers.md) records the session-only durability boundary.

[Browser acceptance](../../../scripts/editor/e2e/editor.spec.mjs) mounts the replacement editor composition under React StrictMode and real local/Yjs editors. It exercises document replacement, native DragHandle ordering, transfers, comment handling, mapping, compensation, paired history, promotion identity and transaction render isolation. [Session tests](../../../apps/web/test/features/editor/document-session.test.mjs) cover hydration, leases, startup typing, timeout, reconnect, denial and disposal.
