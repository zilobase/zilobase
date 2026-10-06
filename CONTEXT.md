# Zilobase Context

## Domain Terms

### Desktop bridge

The versioned `window.zilobaseDesktop` API exposed by Electron preload to the
sandboxed web renderer. Native operations cross this bridge through named,
validated main-process IPC channels.

### Database view

A Database view is a presentation of a Database (table, Kanban, list, gallery, timeline, chart or form). It owns layout and pointer geometry. One session-level database controller owns pending commands across records, schema, configuration, lifecycle and access. Canonical entities and supported optimistic transactions live in the session-owned TanStack DB cache. Query retains authorized result references, server ordering and counts. Temporary record placement intentions remain in command scheduling; server-derived and access changes require confirmed authorization.

### Database

A Database is a page-backed collection of pages with properties, rows, views, and property values.

### Database host

The page-backed Database that owns views and may display one or more linked data sources. V2 client and realtime contracts call this a database host when it must be distinguished from its sources.

### Database record

The rendering aggregate for one database row. HTTP responses carry page metadata and values; normalization retains canonical row/page/value identities and Query-owned ordered IDs. Mounted aggregates resolve current shared fields at one coherent publication revision while PostgreSQL remains normalized.

### Shared client cache

The deployment, account/session, workspace and capability owner of canonical TanStack DB collections. Authorized reads and database confirmations validate and ingest partial entity facets; Query owns result membership, counts, ordering and HTTP orchestration. Library transactions own previews. Yjs bodies and historical action receipts retain separate ownership.

### Database mutation journal

The authoritative, version-ordered history of committed database mutation events used for command replay and realtime delivery. Reconnect catch-up through the journal feed is server-only for now; the client ingests authorized acknowledgement/socket facets and recovers gaps through existing reads. It is separate from the realtime outbox, which tracks delivery work.

### Database command acknowledgement

Confirmation that a database command committed on the server, carrying its
result and mutation event. A failure to refresh a client projection after this
confirmation is a synchronization failure, not a rejected database write.

### Database projection watermark

The committed version below which a client query must not accept a
replacement payload. The shared cache protects per-field storage/source/host clocks and tracks contiguous delivery; Query bootstrap/window references retain their read revisions. Different loaded
views can have different versions; one newer view does not prove that the
other views are fresh.

### Database view query hash

The data-affecting slice of a Database view config: normalized filters,
sorts, and the deleted-rows flag, excluding presentation (view type,
grouping, visibility, layout). Views with equal hashes evaluate the same
rows and share one cached record window.
Record reads validate that expected hash against the saved view and return the
evaluated hash; pending filter/sort projections never define a server fetch key.

### Page

A Page is the page item represented by a Database row and opened from the editor.

### Page document cache

The deployment- and account-scoped browser store of Yjs page updates and unrelated bounded read snapshots. Page metadata, properties and database entities are session-owned TanStack DB collections and require authorized reads after reload. A cached document renders immediately during collaboration startup and retains page-body edits made during a bounded online connection window; a disconnected page is read only.

### Document session

The application-owned collaboration lifecycle for one deployment/account/document kind/resource. Page consumers lease a shared cached Y.Doc, transport, awareness and readiness snapshot. Last release closes the transport without discarding unconfirmed durable updates.

### Editor view

A mounted Tiptap instance identified independently from its pane placement and bound to one document field. Promotion preserves the view; switching its document or collaboration field creates a new view. A document field has one editable owner.

### Editor transfer receipt

An in-memory record pairing the participating views' native history entries for a structural operation. It validates native ownership before undo/redo and becomes invalid when a required view closes. Yjs persists each document independently; the receipt does not survive process termination.

### Resource placement receipt

The ID of the relationship created by an embedding operation. Compensation uses that ID to avoid deleting preexisting relationships. It is separate from an editor block identity and from a server transfer journal.

### Clip

A Clip is a webpage captured by the Web Clipper into a Page. It stores the source URL on page metadata, optional database properties, and Tiptap body content converted from sanitized HTML.

### OAuth client

An OAuth client is an application registered to obtain user-delegated access to Zilobase APIs. The official Web Clipper is `zilobase-web-clipper`. Users create other clients while signed in; unauthenticated dynamic registration is off.

### OAuth consent

OAuth consent is the user granting a client specific scopes for one workspace. Allowing consent issues an authorization code; revoking consent stops refresh. Page and database ACLs still apply after consent.

### OAuth scope

An OAuth scope is the coarse capability a client requested (`clips.write`, `pages.read`, `search.read`, …). Missing scope returns `403 insufficient_scope` before ACL. Having a scope never bypasses page or workspace access.

### Calendar binding

A private connection between a user, workspace and Google Calendar account. Multiple bindings can coexist in one workspace; membership alone does not expose their events.

### Calendar occurrence

A provider-expanded event in a bounded date range. Recurring occurrences retain the series identifier and original start, even after being moved.

### Runtime adapter

The community `@zilobase/runtime-adapter` package owning both runtimes (`./node` + `./worker` subpaths). Mechanism shared by every deployment; hosted policy is injected through factory seams.

### Zilobase Cloud

The private hosted composition (`@zilobase/cloud`, `zilobase-cloud` repo): thin wrappers over the community runtime adapter adding gated features only (hosted identity, demo guard, PostHog telemetry, production bindings and routes).
