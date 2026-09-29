# Collaboration

## Owning modules and interface

- [apps/server/src/features/collaboration](../../../apps/server/src/features/collaboration)
- [apps/web/src/features/editor/collaboration](../../../apps/web/src/features/editor/collaboration)

The browser [page document cache](../../../apps/web/src/features/editor/collaboration/page-document-cache.ts) owns deployment- and account-scoped IndexedDB Yjs updates, remembered page detail and shared in-memory page documents. It compacts update logs, releases idle documents and prunes clean disk entries. Local changes stay on disk until comparison with a fresh server snapshot proves delivery. The editor uses a cached document while its transport starts. Startup page-body editing is bounded to an online connection attempt; offline viewing is read only. [ADR 0013](../../decisions/0013-bounded-online-page-document-cache.md) records this policy.

## Main flow

The [document codec](../../../apps/server/src/features/collaboration/document-codec.ts) owns Yjs/ProseMirror encoding, normalization and materialization without persistence or AI imports. Agent profile creation consumes this interface directly. The [runtime implementation](../../../apps/server/src/features/collaboration/service.ts) retains document storage, live-document replacement and trigger dispatch. The [page bootstrap route](../../../apps/server/src/features/pages/page-content-routes.ts) returns an authorized Yjs state for cold pages and a ticket without state for cached pages; it disables HTTP caching. [Navigation intent prefetch](../../../apps/web/src/features/editor/collaboration/page-prefetch.ts) loads cold state without opening the socket. The [Node runtime attachment](../../../packages/runtime-adapter/src/node/features/collaboration/collaboration-runtime.ts) exposes the websocket transport. Every Node role uses Redis-backed admission limits from the shared runtime bus; Hocuspocus retains separate library-managed Redis extension connections for document synchronization. The Worker request dispatcher authenticates the upgrade inside its runtime-port scope, and the Durable Object installs the same Worker capabilities around each later socket, alarm, and RPC event because those are independent invocations. The Worker room waits for each Hocuspocus message and forces the pending store before releasing a closing socket. The web editor binds the cached Yjs document before its provider connects and attaches the provider to that same document.

## Authorization and persistence

Persisted collaboration documents and page content have coordinated representations. Ticket security and resource access constrain participation; a websocket connection is not an unrestricted content-writing credential.

## Side effects, failures and recovery

Concurrent editing, reconnect, document replacement and comment/transcript updates cross this seam. Preserve Yjs semantics and the distinction between ordinary request database scopes and longer-lived work.

## Verification and change points

Start with [the existing tests or model](../../../apps/server/src/features/collaboration/service.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
