# Comments

## Owning modules and interface

- [apps/web/src/features/comments](../../../apps/web/src/features/comments)
- [packages/tiptap-comment-extension](../../../packages/tiptap-comment-extension)
- [apps/server/src/features/collaboration](../../../apps/server/src/features/collaboration)

## Main flow

Page comments use a Yjs-backed model and editor comment extension to connect selections with threads. Presentation and thread context live in the web feature; server collaboration can apply comment updates. The [page pane](../../../apps/web/src/features/pages/pane/page-editor-pane.tsx) binds the comment controller as soon as the cached Yjs document is ready, without waiting for a provider. Online edits made during the page connection window join the same document and synchronize when collaboration connects; offline cached threads remain visible and read only.

## Authorization and persistence

Comments participate in collaborative document state. Their permission context follows the containing page/editor; selection metadata belongs to the extension rather than a duplicate UI-only model.

## Side effects, failures and recovery

Adding messages changes shared document state and selection anchors. Preserve thread/message identifiers and behavior across document edits and reconnects.

## Verification and change points

Start with [the existing tests or model](../../../apps/web/src/features/comments/model/yjs-comments.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

## Structural transfers

Threads persist in the page's Yjs `commentThreads` map and text/block anchors use comment marks with `commentId`. They do not require Tiptap UniqueID or globally persisted block IDs. [Block operations](../../../apps/web/src/features/editor/operations/block-operations.ts) strip comment marks from destination copies and cross-page moves. Threads remain on the original page; paired undo restores the original marked source. Same-document moves preserve marks and their anchors.
