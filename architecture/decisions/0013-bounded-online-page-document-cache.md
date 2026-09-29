# Bounded online page document cache

Status: accepted.

## Context

Opening a page waited for a fresh HTTP collaboration ticket containing its full
Yjs state and then a new Hocuspocus connection. On Cloudflare, connection setup
can activate a Durable Object room. Repeating both steps on every page switch
made previously visited pages feel slow. Node used the same browser flow, even
though its socket runtime differs.

## Decision

The browser owns one Yjs document per deployment, user and page, backed by
IndexedDB. A cached document renders immediately. While the browser appears
online, the page body can be edited during a bounded connection startup window;
the changes are persisted locally and merged into the same document when the
provider connects. A confirmed disconnect, failed authorization, expired startup
window or offline state stops editing. Offline reloads may view a cached page
read only. This is a connection bridge, not an offline editing mode.

Cold pages request an authorized Yjs state and ticket. Warm pages request only
a fresh ticket. Navigation intent can prefetch cold state without opening a
WebSocket. The server's shared bootstrap route and Hocuspocus document contract
apply to both Node and Cloudflare. The Durable Object remains the collaboration
room and uses WebSocket hibernation; the browser cache does not replace it.

The browser compacts its update log, caps clean disk entries, and releases idle
in-memory documents. Entries with local changes remain on disk until a fresh
server snapshot proves those changes arrived. Access denial hides the page and
offers a local Yjs recovery download.

## Alternatives

- Keep a socket and Durable Object room open for every recently visited page:
  rejected because this keeps rooms and browser connections active merely for
  navigation speed.
- Fetch full Yjs state in every ticket: rejected because warm pages already
  hold the document and a fresh full read delays every switch.
- Permit unbounded offline editing: rejected because the product requires a
  short online connection bridge and read-only offline viewing.
- Evict local changes after a successful socket handshake: rejected because a
  handshake alone does not prove the server stored those Yjs updates.

## Consequences

The first uncached page still waits for its authorized state. Cached pages can
show briefly using the last granted detail while fresh authorization runs; an
explicit denial revokes the view. If the server never confirms local changes,
those entries can exceed the clean cache budget and remain available for
recovery. The shared [collaboration guide](../features/collaboration/README.md)
and [browser cache implementation](../../apps/web/src/features/editor/collaboration/page-document-cache.ts)
describe the current flow.
