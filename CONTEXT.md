# Zilobase Context

## Domain Terms

### Database view

A Database view is the editor surface for viewing and changing a Database as a Table or Kanban board. It owns the active view, visible properties, row ordering, grouping, sorting, draft property values, and row/property/view commands for that surface.

### Database

A Database is a page-backed collection of pages with properties, rows, views, and property values.

### Database host

The page-backed Database that owns views and may display one or more linked data sources. V2 client and realtime contracts call this a database host when it must be distinguished from its sources.

### Database record

The client-side rendering aggregate for one database row. It embeds the row page metadata and values keyed by property ID while PostgreSQL remains normalized.

### Database mutation journal

The authoritative, version-ordered history of committed database mutation events used for command replay, realtime delivery and reconnect catch-up. It is separate from the realtime outbox, which tracks delivery work.

### Database command acknowledgement

Confirmation that a database command committed on the server, carrying its
result and mutation event. A failure to refresh a client projection after this
confirmation is a synchronization failure, not a rejected database write.

### Database projection watermark

The committed version below which a client collection must not accept a
replacement snapshot. Different loaded views can have different watermarks;
one newer view does not prove that the other views have received its events.

### Page

A Page is the page item represented by a Database row and opened from the editor.

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
