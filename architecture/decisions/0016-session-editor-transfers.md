# Session-owned editor transfers and paired history

Status: accepted.

## Context

Pages and meeting fields use Tiptap/ProseMirror with independently persisted Yjs documents. Structural movement crosses main, side and dialog views. Native history belongs to each editor, so blindly undoing both latest entries can remove later typing. Persisted block IDs are unnecessary for temporary selections and would introduce a document migration and synchronization constraints during cached startup typing.

## Decision

The application editor workspace owns document-field view registrations, mapped anchors, drag state and a chronological native-history ledger. Block transfers validate their current source slice and schema fit immediately before commit. Same-document moves use one transaction. Cross-document moves insert then remove synchronously with outcome verification and narrowly guarded compensation. Receipts pair the exact native entries and become invalid when a required view closes. Promotion keeps the mounted view and its receipts.

Yjs continues to persist document updates through existing collaboration services. There is no server transfer journal, arbitrary split workspace, offline editing mode or UniqueID migration. Resource embeddings can return the newly created relationship ID for operation-owned compensation through the existing mutation endpoints. Cross-page transfer destinations omit comment marks while source-page threads remain in their original document.

## Alternatives

A server transfer journal could support durable recovery after process termination, but would require new server persistence and conflict-resolution workflows outside this client cutover. Globally persisted block IDs would create a schema and synchronization dependency where Tiptap mappable positions plus exact-slice validation suffice. Independent latest-entry undo would be simpler but could undo unrelated typing.

## Consequences

Transfers and paired history are coordinated within the running client session. Process termination between document persistence events can leave an incomplete move; atomicity and automatic crash recovery are not promised. If destination compensation cannot be proved safe, keep its copy and report the incomplete move. View closure invalidates paired history rather than undoing another native entry.

See the [editor guide](../features/editor/README.md), [workspace](../../apps/web/src/features/editor/runtime/editor-workspace.ts), [operations](../../apps/web/src/features/editor/operations/block-operations.ts) and [history coordinator](../../apps/web/src/features/editor/runtime/editor-history-coordinator.ts).
