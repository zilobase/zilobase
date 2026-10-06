# Collaboration

## Owning modules and interface

- [apps/server/src/features/collaboration](../../../apps/server/src/features/collaboration)
- [apps/web/src/features/editor/collaboration](../../../apps/web/src/features/editor/collaboration)

The browser [page document cache](../../../apps/web/src/features/editor/collaboration/page-document-cache.ts) owns deployment- and account-scoped IndexedDB Yjs updates, remembered page detail, read-only page data snapshots and shared in-memory page documents. It compacts update logs, releases idle documents and prunes clean disk entries and snapshots under a shared budget. Local Yjs changes stay on disk until comparison with a fresh server snapshot proves delivery. The editor uses a cached document while its transport starts. Startup page-body editing is bounded to an online connection attempt; offline viewing is read only. [ADR 0013](../../decisions/0013-bounded-online-page-document-cache.md) records this policy.

The authenticated main page publishes its connection state to the page breadcrumb through the [page connection indicator](../../../apps/web/src/features/editor/collaboration/page-connection-indicator.ts). The breadcrumb shows a yellow dot while connecting and a green dot after sync. Offline and unavailable states retain their read-only message in the editor.

## Main flow

The [document codec](../../../apps/server/src/features/collaboration/document-codec.ts) owns Yjs/ProseMirror encoding, normalization and materialization without persistence or AI imports. Agent profile creation consumes this interface directly. The [runtime implementation](../../../apps/server/src/features/collaboration/service.ts) retains document storage, live-document replacement and trigger dispatch. The [page bootstrap route](../../../apps/server/src/features/pages/page-content-routes.ts) returns an authorized Yjs state for cold pages and a ticket without state for cached pages; it disables HTTP caching. [Navigation intent prefetch](../../../apps/web/src/features/editor/collaboration/page-prefetch.ts) loads cold state without opening the socket. The [Node runtime attachment](../../../packages/runtime-adapter/src/node/features/collaboration/collaboration-runtime.ts) exposes the websocket transport. Every Node role uses Redis-backed admission limits from the shared runtime bus; Hocuspocus retains separate library-managed Redis extension connections for document synchronization. The Worker request dispatcher authenticates the upgrade inside its runtime-port scope, and the Durable Object installs the same Worker capabilities around each later socket, alarm, and RPC event because those are independent invocations. The Worker room waits for each Hocuspocus message and forces the pending store before releasing a closing socket. The web editor binds the cached Yjs document before its provider connects and attaches the provider to that same document.

## Authorization and persistence

Persisted collaboration documents and page content have coordinated representations. Ticket security and resource access constrain participation; a websocket connection is not an unrestricted content-writing credential.

## Side effects, failures and recovery

Concurrent editing, reconnect, document replacement and comment/transcript updates cross this seam. Preserve Yjs semantics and the distinction between ordinary request database scopes and longer-lived work.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/collaboration/service.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).

## Browser session ownership

The [page-session owner](../../../apps/web/src/features/editor/collaboration/page-document-session.ts) owns cache acquisition, awareness, readiness gates, connection subscriptions and release. The app registry leases one session by deployment/account/kind/resource; its last consumer closes the transport and returns the document to the bounded cache. Cold bootstrap hydrates and flushes Yjs before exposing a collaborative editor. Warm startup typing uses that same Y.Doc. Disconnect, denial, cache errors and startup expiry close the edit gate until confirmed synchronization. The thin React hook exposes a stable external-store snapshot and cannot return a previous resource's session during a document switch.

Editor transfers and paired history use the client session boundary described in [ADR 0016](../../decisions/0016-session-editor-transfers.md). Each Yjs document retains its existing server persistence contract; there is no server transfer journal or cross-document atomic Yjs transaction.
