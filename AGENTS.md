# Zilobase contributor instructions

These instructions apply throughout this repository. Implement client features so
web and a future React Native application can use the same backend operations,
TanStack Query behavior, TanStack DB collections, and mutation/cache rules.

## Where code belongs

- `packages/features` is the shared client. It owns API contracts and requests,
  query keys/options, query and mutation hooks, canonical entity collections,
  invalidation, optimistic updates, reconciliation, domain controllers, and pure
  domain models.
- `apps/web/src/sections/<section>` owns screens, widgets, local hooks,
  and presentation state, grouped by the visible UI section. Each section and
  substantial subsection uses `components/` for local UI, `hooks/` for local
  presentation hooks, and `lib/` for local helpers. Create only folders with code.
  Keep route `*-screen.tsx` entrypoints at their section/subsection root.
  Root `components/` contains only UI shared across sections; root `hooks/` and
  `lib/` contain shared UI hooks and presentation helpers. `components/ui` contains generic UI primitives; shared
  calendar renderers live in `sections/calendar/primitives`. `app` owns startup,
  providers, routing, shortcuts, and the shell. `platform` owns
  physical web/desktop adapters; `lib` contains web presentation helpers and
  `styles` contains global styles. Keep editor, canvas, Tiptap, Yjs collaboration,
  comments Yjs, Ask AI chrome, meeting capture, demo runtime, Electron, and database
  view geometry here.
  Keep form/screen state machines beside their screens.
  Place brand artwork in `components/branding` and generic widgets in `components/ui`.
  Keep Notion import hooks in `sections/notion-import/hooks` and conversion
  helpers in `sections/notion-import/conversion/lib`.
  Import implementation owners directly across web; do not add forwarding-only
  index modules or re-export shared features through web UI modules.
  Database route composition lives in `sections/databases/database-screen.tsx`, embedded
  block contracts and content in `blocks`, row-page properties in `page-properties`, and property
  editors/settings in `properties`. Keep shared view UI in `views/shared`, view
  settings in `views/settings`, and local view commands in `views/commands`;
  preserve distinct view renderers, geometry, controllers, and lifecycle owners.
- A future `apps/mobile` will own native screens, navigation, and native adapters.
  It will import `@zilobase/features`. Do not create the mobile app as a side
  effect of ordinary web changes.
- Server HTTP handlers and HTTP-specific support belong in
  `apps/server/src/routes/<domain>`. Backend operations and domain rules belong in
  `apps/server/src/services/<domain>`. Keep database, storage, queues, and other
  infrastructure in `apps/server/src/infrastructure`, and application composition
  in `apps/server/src/app`. Route modules call services without changing public
  HTTP paths or authorization behavior.

Keep each section's components, hooks, and helpers within its owning section.
Code shared by subsections belongs at their nearest common owner; promote code to
root `components/`, `hooks/`, or `lib/` when independent sections reuse it.
Keep API/query/mutation hooks and cache/domain rules in `packages/features`;
section hooks own UI behavior. Retain meaningful
subsystems such as editor collaboration and database table/kanban/timeline
renderers. Reserve the `features` folder name for `packages/features`.

Keep sidebar composition and private navigation/workspace/section renderers in
`app/shell/sidebar/components/app-sidebar.tsx`; controller composition, local state, storage,
and Effect commands live in `app/shell/sidebar/hooks/sidebar-controller.ts`. Keep the customization editor
and its shared tab/icon presentation in `sidebar-customization.tsx` so its preview
has no import cycle through the app sidebar. Reuse the shadcn sidebar-07 primitive
structure in `components/ui/sidebar.tsx`, with CSS-variable widths, offcanvas
collapse, and Zilobase tokens. Keep right-panel sizing in `app/shell/panels/components/tool-panels.tsx`.
Import shared configuration commands from features directly. Shared library view
labels/icons belong in `components/navigation/lib/library-views.ts`; keep library
row rendering and presentation models in `sections/library`. Avoid a shell
navigation barrel or forwarding modules.
Use Effect for fallible shell storage, native profile workflows, clipboard actions,
and ordered creation/navigation commands. Preserve storage keys, debounce timing,
best-effort fallbacks, and stale-result checks. Keep layout geometry and React view
state plain.

Keep shell composition at `app/shell/app-shell.tsx`, the fallback screen header
in `app/shell/header/components`, favicon UI in `app/shell/components` and
conversion in `app/shell/lib`, and
tool-panel composition in `app/shell/panels`. Global search and its provider live
in `app/shell/search/components`; the app notification center lives in
`app/shell/notifications/components`. The shared route render error boundary lives
in `app/routing/components/fallback-error-boundary.tsx`, independent of the lazy
route error screen. Settings shell/dialogs live in
`sections/settings/shell`, with section screens in `sections/settings/<section>`. Workspace settings, members, guests, invitations,
and page access gates live under the matching workspace subfolders; keep their
UI in `components/`, local hooks in `hooks/`, and presentation helpers in `lib/`.
Teamspace UI and local hooks follow the same convention under `sections/teamspaces`. Route-mounted
screens use explicit `*-screen.tsx` names; route settings use `*-settings-screen.tsx`. Page chrome and body scrolling belong to
`sections/pages/layout/components/page-layout.tsx`, with one placement-aware header in
`sections/pages/header/components/page-header.tsx`. Main routes, desktop panes, and desktop dialogs compose
this layout around the existing editor body. Page presentation state, opening/closing commands, and promotion live in
`sections/pages/presentation/components/page-presentation.tsx`; pane rendering owns geometry,
and dialog rendering owns focus and dismissal. Hosts do not duplicate page headers
or scroll viewports. Shared viewport rendering lives in `components/ui/scroll-viewport.tsx`.
Page design customization belongs in `sections/pages/design`, separate from the
page layout frame. Page content in `sections/pages/editor/page-content.tsx` owns the editor lifecycle; breadcrumb UI belongs
in `components/navigation/components/breadcrumbs.tsx`.
Mobile embedded page requests navigate to main routes before consulting desktop
presentation preferences. Keep the embedded-page dialog lazy and domain-owned;
do not reintroduce a shell forwarding host or a separate authenticated-page module.
Shared header/sidebar actions and their hooks live in `components/navigation`;
page/database sharing UI and its hook live in `components/sharing`. Import these
owners directly; page headers must not import them through the shell sidebar.
Route ID parsing and URL builders belong in `app/routing/route-identifiers.ts`;
keep this helper independent of router initialization so components can import it
without loading the router. Active route/query ID parsing belongs there too;
sidebar controllers and navigation hooks import it directly. Search result
destinations belong in `app/routing/search-result-destination.ts`, and the
most-recent-item startup URL belongs in `app/routing/start-destination.ts`.
Settings URL tab definitions and validation belong in `app/routing/search-validators.ts`;
keep presentation-only tab counts beside the members screen.
Navigation icons belong in `components/navigation/lib`;
SVG icon helpers belong in `components/ui/icon-svg.ts`. Avoid domain forwarding barrels.
Use Effect for clipboard and duplicate/navigation sequences while Query retains
mutation ownership and React retains form/screen state.
Load settings and embedded-page dialogs lazily. Route workspace settings directly
to its owning component instead of adding a shell forwarding screen.

Compose app-wide providers in `app/providers/app-providers.tsx`. Keep scoped
providers beside the UI or runtime they serve. Merge tiny provider wrappers into
their existing owner when practical; icon defaults live in `components/icons.ts`
so independent editor roots can use them without importing application startup.
Provider adapter workflows use Effect for session recovery, ordered cleanup, and
fallible storage. Keep their auth ports Promise-based and React lifecycle/context
composition unchanged; avoid adding another runtime or service layer.

Keep shortcut definitions, modifier matching, registration, and dispatch together
in `app/shortcuts/shortcut-provider.tsx`. Scoped action history remains in
`undo-history.tsx`; editor-native and Yjs history helpers belong to
`editor/runtime/lib/editor-history-coordinator.ts`. Use synchronous Effect dispatch
and finalizers for recording suppression, preserving priority, editable-target
behavior, and synchronous errors. Independent editor roots import the shortcut
provider directly without importing application startup.

Keep web route declarations and root routes together in `app/routing/router.tsx`,
with screens loaded lazily. Keep route guards and URL validation separate. Group
the shell, pending UI, authenticated fallback, and edition host in `route-shell.tsx`;
keep global error recovery in `route-error-page.tsx` and load it lazily. Avoid
forwarding route-group modules and extra files for small route surfaces.
Keep authentication, onboarding, OAuth, start-page, and share-access workflows
together in `guards.ts`. Compose them as Effects; `router.tsx` declares routes and
runs them with `Effect.runPromise` at the router adapter boundary. Preserve original
errors and redirect responses.
Use `Effect.runSync` for synchronous guards and browser actions to preserve
callback timing.
Compose routing helpers directly as Effects; convert to Promises only in router
callbacks or when supplying an existing Promise-based shared-client port.
Interrupt asynchronous UI fibers in React cleanup to prevent late state updates.
TanStack Query retains request/cache/retry ownership; keep rendering and URL
parsing straightforward without extra Effect services or layers.

Desktop transport, capture, persistence, window, and deep-link adapters live under
`platform`; application state and demo runtime composition live under `app`.
Web startup configuration lives in `apps/web/src/app/startup.ts`; keep request,
session, and meeting-capture installation together and preserve bootstrap order.
Desktop session switching and replacement composition live in `app/desktop-session.ts`;
the replacement dialog controller lives in `sections/desktop/servers`.
Group desktop presentation under window, tabs, servers, auth, updates, deep-links,
and diagnostics. Import their owners directly; platform operations stay in platform.
Browser audio capture, transport, and recovery implementations live in
`platform/browser/meetings`; capture contracts and the installed runtime live in
`platform/meetings`. Keep the React capture hook in `sections/meetings/capture/hooks`.
Calendar IndexedDB storage and atomic reminder claims live in `platform/storage`,
system notification delivery in `platform/notifications`, and metric dispatch in
`platform/diagnostics`. Browser sign-in/redirect adapters live in `platform/auth`;
PostHog initialization lives in `platform/analytics`. Platform modules must not
import app composition or section/shared UI modules. Keep the demo experience
wrapper with its application runtime in `app/demo/components`.
Keep native operations in `platform` and avoid recreating an `app/runtime` folder.
Use Effect for startup installation and desktop session workflows. Run synchronous
installation and browser callbacks with `Effect.runSync`; keep native/cleanup ports
Promise-based with `Effect.runPromise` at their boundaries. Preserve candidate
verification counters, cleanup order, and the two-frame React teardown wait.
Use finalizers for revocation timer cleanup without changing its timeout scope.
Web build feature flags and desktop environment checks live together in
`apps/web/src/platform/environment.ts`. Keep Vite environment reads in web and
reuse this module instead of creating a single-file application config folder.
Server HTTP handlers, middleware, and route-specific support live in `routes`;
backend domain operations and models live in `services`. Do not recreate
application `src/features` or web `src/shared` directories.

If a file calls the backend or encodes domain rules and needs no platform/UI
APIs, it belongs in features. If it mixes domain work with platform behavior,
split the domain work into features and keep the last-step adapter in the app.
Being pure alone does not make a form model or pixel-layout helper shared domain
code.

Do not import app code, `window`, `document`, browser storage, IndexedDB,
Electron, DOM geometry, CSS, routers, React DOM, Tiptap, or Yjs into features.
Accept search strings, callback URLs, deployment identity, and platform-dependent
values as arguments. React hooks are allowed in the domain's React entrypoint.

## Backend ownership

Organize backend HTTP adapters under `apps/server/src/routes/<domain>` and
backend operations under `services/<domain>`, with substantial subdomains nested
by functionality. Route modules parse and validate HTTP inputs, call services,
and serialize responses. They must not import Drizzle or database clients/schema.
Services own authorization decisions, transactions, persistence workflows, and
post-commit effects; they must not import routes or Hono adapters. Pass actors,
resource IDs, validated payloads, environment, and extension context explicitly.

Keep inbound HTTP support in `routes/http`; generic cancellation in
`shared/async`; and named HTTP, edition, and error-reporting types in
`shared/contracts`. Edition contracts retain their existing type-only Hono
integration. Shared runtime support must not import application/domain operations.
Infrastructure must not import services, routes, or app composition.

Keep domain outboxes and background handlers with their services; application
background orchestration stays in `app/background`, and delivery machinery stays
in `infrastructure/background`. Physical Node/Worker providers remain in
`packages/runtime-adapter`. Keep database schemas and migration history together.

Import implementation owners directly. Do not add forwarding-only internal
modules; supported public package entrypoints and the database schema aggregator
are intentional export surfaces. Keep tests beside implementations, and application
composition tests in `app`. `npm run test:architecture` enforces backend ownership.
Preserve HTTP registration and middleware order, public export signatures,
authorization/validation ordering, locks, transaction scope, extension callbacks,
and post-commit publication when extracting operations. See
[the server guide](apps/server/README.md#backend-organization) for domain owners.

## Initialization and platform ports

Reuse `createZilobaseClient`, `ZilobaseFeaturesProvider`, `ApiFetcher`,
`ZilobaseAuthClient`, `ClientLifecycle`, and `ClientCacheStorage` from the existing
package. Web's composition is
[features-provider.tsx](apps/web/src/app/providers/features-provider.tsx).

- Use one QueryClient and shared-data registry per application runtime. Pass the
  same client to initialization, providers, imperative reads, and controllers.
- Supply deployment identity explicitly. Isolate data by deployment, account,
  session, workspace, and guest/public capability as applicable.
- Keep transport, credentials, connectivity/app visibility, and physical storage
  in platform adapters. Keep backend operations and domain/cache policy shared.
- Dispose subscriptions, controllers, realtime connections, and owned cache
  state when their runtime or identity ends.

When the native app is explicitly requested, implement these ports for native
networking/authentication, app lifecycle, and storage; compose the existing
provider; then build native screens using the shared domain hooks/controllers.
Do not duplicate the web API client, query keys, collections, or mutation logic.

## Query, collections, mutations, and persistence

- TanStack Query owns request lifecycles, pagination, result references, and
  invalidation. TanStack DB owns canonical entities and coherent publication.
  Domain controllers own pending intentions and reconciliation.
- Use existing domain reads and commands. Do not introduce another entity cache
  or app-local API mutation to bypass shared behavior.
- Capture identity/scope when asynchronous work starts. Check it before applying
  results, acknowledgements, optimistic updates, or rollbacks. A response from an
  old identity must never write into the next identity's cache. Clearing the
  mutation cache does not cancel an executing mutation's callbacks.
- Preserve revision checks, repeated-edit ordering, pending-write protection,
  authorization, rollback, and realtime reconciliation semantics.
- Features owns restore/revision/retention and scoped-clearing rules; storage
  adapters own physical transactions and platform APIs. Preserve existing web
  database names, schemas, upgrades, budgets, and durable data during changes.
- Persistence is an optional capability in the client configuration. Avoid making
  new online domain behavior depend on a durable storage implementation. Persist
  supported payloads, not live collection references or transient UI previews.

Page metadata property reads belong to `packages/features/src/pages/property-cache.ts`
and `query-hooks.ts`. A database row can supply an immediate partial projection
from authorized bootstrap/window references and the canonical definitions/values.
That projection does not prove the page's complete database membership. Member
page-detail reads supply property IDs, row/source presence targets, and host/source
versions; reuse them only when every target has a fresh, authorized loaded row in
the same data scope. Cold, incomplete, stale, guest, and public reads retain the
existing property endpoint and its access checks. Never copy database values into
page-local state or seed partial data as a fresh complete query result.

Derived property references retain the oldest supporting read timestamp within
the existing 30-second freshness window. Admitted value edits and definition
renames publish through the shared collections without refreshing read age.
Property membership changes, removed rows/sources, and delivery gaps invalidate
the affected page context and property query. Cached values can remain visible
during recovery, but invalidated presence targets cannot authorize edits. Access
denials suppress the projection, and session/capability disposal prevents late
responses from restoring it. Query-cache notifications use TanStack Query's
scheduler so sibling renders cannot synchronously update page metadata.
After database result references are released, page-only realtime receipts
update retained page/definition/value collections without recreating source
record or binding collections.

Keep property coverage/lifecycle tests beside `property-cache.ts`; focused browser
checks live in `scripts/databases/e2e/page-properties.spec.mjs`. The isolated signed-in
`npm run test:databases:app-browser` checks actual side panes, full-page promotion,
dialogs, mobile navigation, embedded databases, and shared edits. Complete loaded
items must open without a `GET /pages/:id/properties` request.

## Hosted editor and future native integration

The editor remains web code. Document design rendering belongs in
`sections/pages/editor/document-design`, distinct from page frame layout and page
design customization. Keep editor runtime, collaboration, hosted bootstrap,
operations, selection, and drag/drop as distinct subsystems beneath
`sections/pages/editor`. Editor and page-content composition live at that folder's root; other local UI,
hooks, and helpers use the owning subsystem's `components/`, `hooks/`, and `lib/`.
Editor creation, extension memoization, and editability share `runtime/hooks/use-editor-runtime.ts`.
All Tiptap extension definitions and node views live in `editor/extensions`, including
database blocks, comments, structural commands, pending embeds, and workspace integration.
Register extensions together in `extensions/lib/create-base-extensions.ts`; the runtime hook
uses that assembled list. Keep comment state, the Yjs controller,
and both independently scoped comments providers in `editor/comments`. Shared page
metadata lives in `sections/pages/components/page-metadata.tsx`; database property rendering
remains in `sections/databases/page-properties`. Page read-cache hydration lives
in `sections/pages/lib/page-read-cache.ts`. Do not recreate top-level editor/comments folders, editor
composition/core buckets, or page content forwarding modules.
Use Effect for structural insertion, document prefetch, and database drop resource
workflows. Keep Promise adapters, synchronous pending flags, anchor cleanup,
compensation, prefetch limits, and local flush versus server synchronization intact.
Keep block construction, conversion, plus-menu insertion, and slash-command resource
insertion together in `editor/commands/lib/block-insert.ts`. Compose creation and
anchor cleanup as Effects and run them at the existing Promise boundaries.
Group editor resource callbacks and mobile block action state in
`editor/commands/hooks/use-editor-actions.ts`; shared mutation hooks retain backend/cache
ownership, and mobile selection and movement remain plain React/editor code.
Keep collaboration transport, connection startup, awareness users, and colors in
`editor/collaboration/lib/collaboration-connection.ts`; document sessions own leases,
readiness, and page connection indicators in `page-document-session.ts`. Keep
persistence, navigation prefetch, the React hook, and presence UI separate. Use
Effect for ordered connection startup while preserving deferred attachment,
synchronous ticket-port errors, and explicit provider teardown.
Meeting block DOM lookup/scrolling belongs beside its editor extension in
`sections/pages/editor/extensions/meeting/lib/meeting-block-navigation.ts`; it is
editor presentation behavior, separate from application URL routing.
Keep types, toolbar configuration, and presentation code plain.

Ask AI presentation is grouped into chat, composer, attachments, workspace, and
styles beneath `sections/ai`; import owning files directly rather than an
elements barrel.

Native screens will open the hosted editor in a WebView through the existing `/editor` route and versioned bridge contracts in
[editor-bridge.ts](packages/features/src/pages/editor-bridge.ts).

The native app and WebView are independent JavaScript runtimes. They share client
implementation and backend data; they do not share a live QueryClient, TanStack
DB collection instance, Yjs document, or editor history. The WebView owns its
editor, Yjs state, and cache instances.

Validate bridge version, instance, request IDs, and deployment/account/session/
workspace scope. Keep bridge credentials in memory and out of persisted cache
payloads and logs. Send navigation requests to the host. Notify native consumers
of affected records after confirmed changes so their own queries invalidate.
Local flush acknowledges durable local storage; it does not acknowledge server
synchronization. Preserve that distinction for flush, close, reconnect, and
identity teardown. Hosted startup requires connectivity; bundled offline editor
assets remain deferred.

## Imports and implementation style

- Keep `@zilobase/features` as one package. Do not add an SDK, parallel client
  package, or speculative adapter framework.
- Use the package root for initialization and ports,
  `@zilobase/features/<domain>` for domain APIs/models, and
  `@zilobase/features/<domain>/react` for hooks. Server consumers use
  `@zilobase/features/runtime`. Avoid private package imports and internal barrel
  cycles.
- Follow neighboring contracts, queries, hooks/`react.ts`, cache, models, and
  commands. Consolidate trivial forwarding layers, but retain distinct complex
  subsystems. Extract existing shareable behavior rather than inventing future
  abstractions.
- Preserve behavior and unrelated working changes. Keep refactors in coherent,
  independently verified passes; follow the requested commit boundaries.
- Do not recreate `architecture/`. Update `CONTEXT.md` only when domain
  terminology changes.

## Verification

Web architecture checks enforce explicit source entrypoint names, direct imports,
route screen names, and page subsystem locations. Keep domain tests grouped by
those owners under `apps/web/test`; browser fixtures remain in their existing
script harnesses. Existing named editor/block and database-row drag entrypoints
remain subsystem APIs; do not introduce new forwarding-only files. Preserve the
independent hosted-editor import graph and lazy screen/dialog loading when moving
modules. Report renames/moves separately from merges and deletions.

For shared-client changes, run features tests, web tests, workspace typechecks,
lint, formatting, and architecture checks:

```sh
npm test --workspace @zilobase/features
npm run test:web
npm run typecheck
npm run lint
npm run fmt:check
npm run test:architecture
```

Add focused integration/browser checks for the affected subsystem. Exercise
identity changes and late results, optimistic failure/repeated edits, revisions,
realtime reconciliation, and storage failure/restart/clearing when relevant.
Editor changes need host/editor isolation, navigation, invalidation, flush versus
sync, reconnect, and teardown coverage. Changes to package exports or dependencies
also need affected workspace tests and builds. Scale checks to the change; a
documentation-only edit needs formatting and link validation.

Changes to Ask AI workspace actions (the action registry, planners, action
ports, ZFM conversion, or AI instructions) also need the live action evals
against a running stack with a model key and `AI_ACTION_MILESTONES=A,B`. They
write real content as the given user:

```sh
npm run test:ai:actions -- --credentials .dev/local/node-owner.json
npm run test:ai:actions -- --api http://127.0.0.1:3010 --origin http://localhost:1422 --credentials <worker-user.json>
```

## Existing migration gaps

The current implementation is a foundation, not proof that every boundary is
complete. When working in these areas, address and test the remaining gaps:

- Offline session restoration/logout cleanup still has ownership in web that
  should be split into shared policy and platform adapters.

These are migration gaps, not patterns to repeat. Remove entries as they are fixed.
