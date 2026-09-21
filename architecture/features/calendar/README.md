# Calendar

Calendar contracts live in [the shared package](../../../packages/features/src/calendar/index.ts). Event identity includes workspace, binding, provider calendar and event. All-day dates use an exclusive end; timed events preserve IANA zones and recurrence identity.

The server requires both `CALENDAR_ENABLED=true` and a matching `CALENDAR_ENABLED_WORKSPACE_IDS` entry (or `*`). The web uses the independent `VITE_FEATURE_CALENDAR` flag, disabled by default. Calendar authorization never follows the Mail flag.

Contract model tests exercise identity isolation and safe route construction. Configuration tests cover independent workspace rollout. Route requests, query parameters, event mutations, and preferences validate using Effect `Schema` decoding.

## Persistence and ownership

[Calendar tables](../../../apps/server/src/infrastructure/database/schema/calendar.ts) keep account credentials separate from Mail. Composite foreign keys require bindings to match both account ownership and workspace membership. [Ownership operations](../../../apps/server/src/features/calendar/connections/ownership.ts) reject expired memberships and serialize disconnect with account binding changes. Disconnect removes credentials only when the last binding is removed.

The disposable PostgreSQL runner is `node scripts/calendar/test-integration.mjs`; it creates and drops a uniquely named local database and applies the migration journal before testing.

## Provider connection

OAuth success and cancellation use a bounded [return-path contract](../../../packages/features/src/calendar/onboarding.ts) containing the initiating workspace. The web validates those parameters and uses the existing authorized workspace switch before displaying the result; desktop returns preserve instance/server identity. Cancelled attempts are consumed only once and must be unexpired. Success offers a default calendar and optional reminders; denied notification permission leaves in-app reminders available. Desktop connection controls explain browser completion and allow checking/restarting an interrupted flow.

[Routes](../../../apps/server/src/features/calendar/routes.ts) require feature rollout, active membership and account ownership. Callback routes use expiring single-use OAuth state and PKCE. [Google OAuth](../../../apps/server/src/features/calendar/provider/oauth.ts) uses independent Calendar credentials and encrypted, owner-bound secrets. Google identity verification is shared platform code; Mail retains its published compatibility entrypoint.

`CALENDAR_GOOGLE_CLIENT_ID`, `CALENDAR_GOOGLE_CLIENT_SECRET`, and a base64 32-byte `CALENDAR_TOKEN_ENCRYPTION_KEY` configure connections. Register `/calendar/oauth/google/callback` on the canonical API origin. Browser callbacks return to `/calendar`; desktop callbacks carry server/instance identity through the existing deep-link protocol. The combined Node runtime recognizes callback prefixes without treating the `/calendar` web screen as an API route.

## Personal sources

The [personal catalog](../../../apps/server/src/features/calendar/connections/catalog.ts) lists only the current user's account bindings with active memberships and enabled Calendar rollout. One binding per provider account is presented, preferring the active workspace and otherwise a stable binding ID. The existing workspace-bound connection API remains available. Source responses carry their original workspace/binding identity; reads, writes and disconnect use that identity rather than the active workspace. Sidebar, schedule and reminders share the catalog and recheck it every 30 seconds while visible, as well as on focus. Removed sources leave event presentation and reminder subscriptions; server authorization is checked independently on each operation.

## Web shell

The [application layout](../../../apps/web/src/app/shell/content/app-layout.tsx) mounts one Calendar workspace provider above both the application sidebar and the content/dock subtree. Sidebar source selection and travel-zone display consume the same controller as the schedule; a provider inside only the content pane cannot serve sidebar consumers. The [shell boundary regression](../../../apps/web/test/app/calendar-provider-boundary.test.mjs) executes this composition with real React context and verifies shared controller identity.

The lazy `/calendar` screen uses the existing workspace shell and shared controls. Account queries are scoped by workspace, have finite freshness and surface errors. Preferences persist per member/workspace with IANA zone validation. The application sidebar offers a fixed Calendar tab beside Mail only under its independent web feature flag. Route navigation, including OAuth returns, selects that tab. The screen uses the same pane shell and sidebar toggle as Mail, centering the Google Calendar connection prompt when no accounts are connected. The lazily loaded [account sidebar](../../../apps/web/src/features/calendar/connections/calendar-accounts-sidebar.tsx) renders a shared mini date picker, connected accounts, calendar visibility, reconnect and disconnect controls. Date selection preserves the schedule view; the Add calendar account row opens the shared Google-only connection dialog. Account/calendar rows reuse the shared sidebar actions and dropdowns, with eye visibility controls and account-menu disconnect. The catalog selects and persists a writable primary default when needed; event creation uses the same resolver. These controls live in the application sidebar; the schedule fills the center pane.

Account headers toggle persisted collapse; account and calendar menus provide keyboard-accessible Move up/Move down actions. Account organization uses account IDs; calendar ordering uses binding/calendar keys and preserves the saved ordering of other accounts. New sources append after saved sources.

Calendar preference JSON stores the complete current preference shape, including labeled time-zone columns, local color overrides and removed-calendar keys scoped by binding/calendar identity. Incomplete or obsolete persisted shapes are rejected rather than upgraded during reads. Calendar menus use shared inline submenus and the shared removal confirmation dialog. Eye visibility is temporary; removal hides the row and events until restored in Calendar settings. Both leave Google unchanged. A removed default is replaced using the shared writable-calendar resolver. Explicit event colors take precedence over local calendar colors.

## Synchronization

[Incremental synchronization](../../../apps/server/src/features/calendar/sync/sync.ts) leases one provider page at a time, atomically commits canonical records and checkpoints, and emits a revision outbox record only at the final page. Expired tokens start a new generation; old records survive until the replacement completes. The [Calendar background handler](../../../apps/server/src/features/calendar/background.ts) advances unfinished calendars and drains committed outbox revisions immediately. Minute-based maintenance remains the durable recovery path. The existing `calendar.sync` task accepts an account/calendar pair, with a null calendar identifying a calendar-list refresh. Removed provider calendars produce a final invalidation before deletion.

[Range retrieval](../../../apps/server/src/features/calendar/sync/ranges.ts) uses provider-expanded occurrences and ownership-bound, expiring snapshot cursors. Range responses rebind only workspace and binding identity; request-window fields must never overwrite an event’s structured start/end times. Partial pages never replace complete browser ranges. Captured revisions prevent concurrent changes from being incorrectly acknowledged. Search does not change sync checkpoints.

## Browser storage

[Dexie storage](../../../apps/web/src/features/calendar/storage/calendar-database.ts) isolates each server/user/workspace/binding. Completed range membership and event records commit together; older generations/revisions and cross-identity payloads are rejected. Cache reads distinguish unloaded, empty, and stale ranges. A shared 50MiB soft retention budget evicts least-recently-read ranges across open user/server bindings, retaining current ranges and pending mutations. App session composition closes Calendar and Mail databases before indexed-data deletion. Account disconnect removes only its own Calendar cache.

[Cache synchronization](../../../apps/web/src/features/calendar/sync/calendar-cache-sync.ts) serializes catalog work and shares overlapping calendar intervals through the range scheduler. Destination reads have priority over queued buffers; superseded work stops at request/range boundaries. Missing-only loads compose existing coverage and fetch holes without replacing completed snapshots with partial pages. Recovery refreshes still revalidate cached ranges. IndexedDB is authoritative for event presentation; account and preference queries use TanStack Query.

## Views and time

The Calendar schedule composes authorized cache subscriptions into a continuous timeline. [Timed views](../../../apps/web/src/shared/components/calendar/calendar-timeline.tsx) use independent civil-date keys, native vertical time scrolling, and a translated horizontal date buffer. Sticky date/all-day headers and timezone rails share the event coordinate plane. Visible-day count controls column width. The shared [wheel controller](../../../apps/web/src/shared/components/calendar/use-calendar-wheel-scroll.ts) accumulates the dominant trackpad axis, settles after input goes idle, animates once to the nearest civil-date column, and then bookmarks the route. The expanded all-day band is 96px and collapsed band 24px, with overflow scrolling.

[Month](../../../apps/web/src/shared/components/calendar/calendar-month-view.tsx) keeps fixed 144px week rows, stable unfiltered week-start keys, and multi-day event bars. It uses the same translated wheel controller vertically, grows the mounted buffer with the active gesture, and settles to one exact week-row boundary before publishing the new visible date. A gesture may preview a synthetic loading row, but only a complete loaded week can become the committed anchor; prepending loaded weeks preserves that anchor. Civil-day positions use [timeline geometry](../../../packages/features/src/calendar-layout/timeline.ts), not elapsed zoned milliseconds.

[Time utilities](../../../packages/features/src/calendar-layout/time.ts) reject ambiguous/nonexistent mutation input unless explicitly disambiguated and preserve date-only exclusive-end values. The Calendar entrypoint exports the provider-independent helpers used by the shared surface. Event details render descriptions as text.

## Event writes

[Shared operation capabilities](../../../packages/features/src/calendar/capabilities.ts) define supported Google writes from calendar permissions and event context. The grid, editor and actions use the same decisions as provider delivery and series splitting. Free/busy-only sources cannot mutate; read-only invited attendees may RSVP; specialized events remain read-only until their editing workflows are implemented. Moves require an organizer-owned non-occurrence event and stay within the binding. Google remains authoritative when permissions change after synchronization.

[Mutation services](../../../apps/server/src/features/calendar/events/mutations.ts) reserve request-hashed operation receipts before provider calls. Creates use deterministic provider IDs; existing events require matching ETags. Provider failures distinguish definite rejection from uncertain delivery. Status lookup reconciles private operation markers or confirmed deletion without replaying writes. Permission checks and account ownership precede delivery. Successful receipts and revision invalidations commit together.

## Editing and optimistic recovery

The event editor uses shared controls and explicit guest-update settings. Calendar writes require connectivity. [Browser mutations](../../../apps/web/src/features/calendar/events/calendar-mutations.ts) persist optimistic snapshots before transport; definite rejection rolls back, while ambiguous delivery remains pending for operation-status reconciliation. Event creation and deletion update range membership transactionally. An online controller periodically reconciles persisted operations.

## Recurrence

[Series operations](../../../apps/server/src/features/calendar/events/series-split.ts) persist the original series ETag and deterministic successor before modifying Google. Status reconciliation reads operation markers, resumes missing steps, and never repeats a successful insert. Following-occurrence edits truncate the original rule and reset later exceptions, matching Google's split model. Single-RRULE count limits are adjusted using provider instances; complex imported rule sets remain unchanged and reject splitting. Whole-series changes translate the edited occurrence's wall-clock delta back to the master in its IANA zone. The editor preserves imported recurrence unless the user explicitly replaces it.

## Push and runtime delivery

[Watch maintenance](../../../apps/server/src/features/calendar/realtime/watches.ts) registers independent calendar-list and event channels, persists a token digest before contacting Google, and accepts authenticated early callbacks. Monotonic message numbers discard replays. Event callbacks mark canonical streams dirty; list callbacks remain durable until metadata refresh. After committing these markers, authenticated non-replayed callbacks dispatch the existing background task immediately. Dispatch failure leaves markers available to maintenance; webhook handlers do not wait for Google event fetching. Renewal registers replacements before stopping old channels; abandoned channels expire.

[Outbox delivery](../../../apps/server/src/features/calendar/realtime/outbox.ts) claims committed invalidations and retries failures with backoff. It resolves current account bindings at delivery time and sends only scoped revisions. Node attaches `/calendar-realtime` to the existing realtime bus. Calendar HMAC tickets have a separate signing domain, five-minute lifetime, and binding/account/user/workspace claims. Realtime tickets also report the earliest active provider-watch coverage expiry, including the calendar-list channel and every readable event channel. Missing or expired coverage selects fallback polling independently of socket connectivity. Sockets speak `calendar.ready`, `calendar.ping`, `calendar.pong`, and `calendar.invalidate`; event contents never enter the bus. Runtime contracts and ticket verification are published through the server adapter and realtime entrypoints.

## Browser recovery

[Recovery coordination](../../../apps/web/src/features/calendar/realtime/calendar-recovery.ts) shares one reference-counted coordinator across schedule/reminder consumers and holds a Web Lock for the binding's socket leader and uses BroadcastChannel for scoped invalidations and health. The leader sends 20-second heartbeats, renews expiring tickets and reconnects with bounded backoff. Visible online clients check provider changes every minute without healthy push or about five minutes when both socket health and provider-watch coverage are valid, with jitter and failure backoff. Focus, visibility and connectivity recovery also check Google. Separate provider and range locks coalesce concurrent tabs. Invalidation-driven refreshes read the ownership-checked `/connections/:bindingId/catalog` metadata cache before ranges and update sidebar queries without starting another canonical sync. This propagates renamed/removed calendars without provider feedback loops. Routine sync/timezone status is omitted from the schedule header; offline and actionable errors remain visible. Late component responses cannot replace current loading/error state.

## Running-app reminders

The lazy [application reminder host](../../../apps/web/src/features/calendar/reminders/calendar-reminder-host.tsx) sits outside route content and subscribes to each enabled account's upcoming cache. It continues through navigation and checks deadlines on a timer and after focus/visibility restoration. Calendar defaults and popup overrides determine deadlines; declined, cancelled and ended events are excluded. [Atomic IndexedDB claims](../../../apps/web/src/features/calendar/reminders/scheduler.ts) deduplicate delivery across tabs and survive restarts. Editing the start produces a new reminder identity; pending provider mutations cannot notify.

In-app delivery is always available when reminders are enabled. System delivery uses browser Notification permission or the [Tauri notification plugin](https://v2.tauri.app/plugin/notification/), requested only from Calendar settings. The scheduler does not register closed-app alarms, service-worker push, or native scheduled notifications. Disconnection deletes its scoped cache and reminder claims; logout removes the session host.

Cached coverage composes adjacent snapshots. Foreground viewport requests precede buffered holes; intervals are shared across consumers and protected by cross-tab locks. Complete cached dates remain available during refresh. Pending mutation records remain pinned.

## Acceptance corrections

The month view lays multi-day bars across weekly lanes with overflow details. Day/week grids support 15-minute creation, transient drag previews and all-day resizing; provider delivery occurs on drop. Indexed day bounds and cached time formatters keep cached navigation independent of event normalization costs. Separate editor, timing, status and layout modules keep these responsibilities isolated.

Hour density persists in Calendar preferences (32–120 pixels per hour, default/reset 48), independently of application zoom. The day column, time axis, current-time decorations and drag/create geometry consume the same height. The timeline rescales its time anchor before painting a density change; month layout is unaffected.

General preferences include Today alignment, meeting-preview lead time and Google/Apple Maps selection, with navigation to existing application appearance/profile settings. Today actions record an optional aligned range in the route; ordinary week navigation retains its default alignment. The empty dock's [meeting preview](../../../apps/web/src/features/calendar/views/calendar-meeting-preview.tsx) reads authorized visible sources around today independently of the grid date, and applies the shared upcoming-meeting filter. [Context helpers](../../../packages/features/src/calendar/context.ts) bound the preview horizon and encode location text as a maps search parameter. This preview is not a reminder or an invitation notification.

[Time-zone controls](../../../apps/web/src/features/calendar/preferences/calendar-time-zones.tsx) manage up to four ordered, labeled columns. Stored columns remain primary-first; the rail, hour labels and clock markers render in reverse so primary is nearest the grid. A + searchable picker and heading menus support change, rename, remove and promotion; dragging headings reorders them. Settings reuse these controls. Picker recents retain eight canonical zones in server/user-scoped local storage. Reorder/promotion derives the primary `timeZone` projection from the first column on save. The server accepts labeled columns as the canonical input; labels are local display metadata and never enter provider writes.

[Travel mode](../../../apps/web/src/features/calendar/preferences/calendar-travel.tsx) stores a temporary zone in the Calendar workspace controller. The shared projection applies it to toolbar, mini-calendar and schedule without persistence. Z and the command menu open the shared searchable picker without a standalone toolbar button. Heading actions restore or save as primary/secondary through the ordinary preference mutation; a fifth saved zone is rejected instead of truncating existing columns. Workspace teardown clears travel state. An opt-in preference offers a preview when focus/visibility recovery detects a changed system zone; accepting the suggestion does not persist it.

Provider transport and durable receipt storage are separate from mutation orchestration. Pending writes serialize by provider account across workspace bindings. Moves first persist an operation marker with an ETag fence, allowing uncertain delivery to reconcile the destination safely. Following edits at the first occurrence update the existing series. Google Meet pending/failure states remain visible without treating a saved event as lost.

## Rollout and observability

The authenticated configuration endpoint reports boolean readiness for independent OAuth/encryption settings, callback/webhook URLs and background/realtime capabilities. Structured server metrics and local browser custom events contain numeric measurements and outcomes only, without event or user identifiers. [The deployment runbook](../../../docs/calendar-deployment.md) documents pilot configuration, automated gates, manual Google acceptance and reversible disablement. General availability stays disabled until live web/desktop acceptance passes.

## Workspace controls

The [workspace controller](../../../apps/web/src/features/calendar/workspace/calendar-workspace.tsx)
owns the search query and panel actions. [Search results](../../../apps/web/src/features/calendar/views/calendar-search-results.tsx) use a debounced infinite query with explicit per-source pagination and optional date filters, independent of grid ranges. [Server search](../../../apps/server/src/features/calendar/sync/search.ts) checks readable-calendar permissions and uses Google event search without sync tokens or canonical/cache checkpoint writes. Offline search is explicitly limited to cached events. Date, view and optional `days` (1–31, default seven) remain route parameters. Custom week ranges start at the selected date; when weekends are hidden they count visible weekdays. The standard seven-day week retains week-start alignment and hides weekend columns. Shared date helpers drive toolbar/keyboard/swipe navigation and range loading so custom periods do not overlap. Mini-calendar and event navigation retain the count; Day and Month ignore it.
The [toolbar](../../../apps/web/src/features/calendar/workspace/calendar-toolbar.tsx) is
rendered in `PagePaneHeader`'s padded action slot, with compact search/navigation
menus at narrow widths. The schedule renders a plain month heading on the leading edge and Create event on the trailing edge;
date picking remains in the left mini calendar.

[Calendar commands](../../../apps/web/src/features/calendar/workspace/calendar-commands.tsx) use the application's shared shortcut provider and command-dialog primitives. While Calendar is mounted, Cmd/Ctrl+K opens its scoped actions and `?` opens searchable shortcut help. The schedule registers capability-aware creation, event traversal and source actions; the toolbar owns date/view/display/preference actions. Letter shortcuts skip editable controls and modal/menu contexts, and unavailable actions cannot execute. Registrations are removed on unmount, returning Cmd/Ctrl+K to application search elsewhere.

Command callbacks read current schedule state without rebuilding metadata on every date navigation. Display preferences retain stable identity between relevant changes, and the meeting-preview cache subscribes only while its dock is visible. A source that is still loading renders its own pending state so the generic event panel cannot steal sidebar focus.

Calendar row buttons open a [source-specific upcoming-event panel](../../../apps/web/src/features/calendar/views/calendar-source-panel.tsx) in the existing dock. The panel reads 30-day cache windows with forward/backward pagination independently of the grid period; creation explicitly targets the source. Calendar options reuse the existing source controls. Selecting an event switches the dock back to event details. Unsaved source ordering uses stable source identity so provider and cache response order cannot move open controls. Visibility and its pressed state belong
to the eye button; hidden names use the shared secondary text token. A flex action
area allocates space for the eye and expands for the options button on hover,
focus, or menu-open state, keeping the Default label intact.

## Event dock

The existing [details and editor](../../../apps/web/src/features/calendar/views/calendar-event-panel.tsx)
render into a stable portal element owned by the workspace controller. Calendar
registers close/create actions and retains event, mutation, and draft state. The
shell mounts the element in its shared resizable dock or mobile overlay. Moving
the same element between hosts preserves the editor across breakpoints and AI
switches. Hidden content is inert. Calendar and AI are mutually exclusive even
when AI uses its saved floating presentation; switching does not rewrite that
preference. Explicit close clears route selection and restores trigger focus;
leaving Calendar resets registration and search state.

## Event presentation

Timed cards use a single full-height click target with title and time range;
awaiting invitations have a dashed outline. Drag/resize handles retain their
existing geometry behavior. The [event details](../../../apps/web/src/features/calendar/views/calendar-event-details.tsx)
surface is part of the same event dock: time, timezone, recurrence status,
participant counts/preview, inline participant expansion and RSVP, meeting link,
location/description, calendar, visibility and reminders. Shared avatars, buttons,
button groups, compact settings typography, and section borders define its appearance.
The dock uses the shared control sizes and secondary-text tokens; editor labels
stack above fields while checkbox rows retain their horizontal layout. RSVP and management controls
reuse the existing mutation flow; expansion does not open another panel or alter
selection. Notes/database linking and proposal workflows are not implemented.

## Reusable calendar surface

The [CalendarSurface entrypoint](../../../apps/web/src/shared/components/calendar/index.ts) owns Month, Week and Day rendering and local scrolling/drag state. Callers supply plain items with unique IDs, titles, exclusive-end timing, styling and explicit editability, plus controlled date/view and display preferences. Optional callbacks report requested instant ranges, selection, creation, proposed timing changes and geometry errors. Custom renderers replace card contents while the surface retains interaction semantics. Each instance is independent; the surface has no router, account, persistence or global keyboard subscriptions.

The schedule adapts provider events using composite event keys and handles search, cache range loading, permissions, routing, editors and writes. Geometry callbacks merge only start/end into the original provider event. Provider-free [calendar layout utilities](../../../packages/features/src/calendar-layout/index.ts) own timezone and layout calculations and are exported directly by the Calendar package where needed. [Standalone browser fixtures](../../../scripts/calendar/e2e/surface-fixture.tsx) exercise reuse without application providers. Database view registration remains separate.

The surface indexes only overlapping loaded days using binary search over timezone-aware day bounds. A weak timing cache reuses normalization for immutable items, and unchanged day membership retains its array identity. Day layouts cache overlap lanes; active intervals and reusable columns use heaps to avoid quadratic overlap scans. The feature adapter indexes calendar metadata and retains unchanged display items across status updates. Callers replace item objects when their timing or display changes.

Virtual rows and columns keep their date keys across range extension. Focused timed columns remain pinned; root-owned pointer sessions and previews survive cell unmount. A shared minute clock updates current-time decorations independently of event layout. The faint wall-clock reference spans the timed timeline even away from today, with a strong segment on today.

Calendar supports Day, Week and Month. Invalid route values normalize to Week. No year view is introduced.

## Loaded-date navigation

The [navigation controller](../../../apps/web/src/features/calendar/workspace/calendar-navigation.ts) holds only the latest explicit destination. Toolbar, Today, commands, mini-calendar and view changes retain the previous view until every visible readable calendar has complete destination coverage. Explicit progress appears inline; initial unloaded routes show an inline loading surface.

Viewport scrolling is local. After the gesture fully stops, the workspace visible date updates and the route `date` is replaced as a bookmark. That write must not change the surface jump target, reset geometry, or start pending navigation. Toolbar, mini-calendar and the schedule heading read the workspace visible date (falling back to the route). Explicit navigation still jumps the grid and waits for complete destination coverage.

[Cache subscriptions](../../../apps/web/src/features/calendar/sync/use-calendar-cache.ts) read buffered and destination windows separately, without fetching distant gaps. Events and coverage are observed in one IndexedDB transaction. Hidden and free/busy-only sources do not block readiness. Source enablement retains the current viewport with explicit loading status while expansion waits. Offline and failed loads retain the current extent, with retry available through the feature adapter.

## Continuous timeline geometry

[Timeline geometry](../../../packages/features/src/calendar-layout/timeline.ts) provides civil-date ranks, hidden-weekend mapping, fractional scroll anchors and contiguous coverage bounds independently of transport and rendering. Civil dates use Temporal rather than elapsed zoned milliseconds.

Range reads share overlapping jobs with two foreground slots per Google account and four globally; prefetch leaves one slot free. Range requests use 1,000-event Google pages and forward read cancellation through the gateway timeout. Transient GET failures retry with bounded jitter; writes are never automatically retried by this transport.

Date buffers are user/server-local advanced preferences (28 days per side for timed views, 56 for month, configurable 7–180). Requests split at 28 days, reduced to seven for calendars with paginated ranges. Cache pressure suspends speculative reads.

The timed [continuous timeline](../../../apps/web/src/shared/components/calendar/calendar-timeline.tsx) virtualizes stable date columns with one native two-axis scroller. Column headers and timezone rails are sticky; the full-height day bodies no longer synchronize independent scroll positions. Width is derived from the visible day count, and extending coverage preserves a fractional date anchor. Rest alignment is a single JavaScript snap to the nearest civil-date column after inertia stops. CSS mandatory snapping is not used: it continued paging after the gesture ended. The workspace visible date follows the leftmost column while scrolling so chrome (heading, mini-calendar) stays in sync; the route date is replaced only after rest. Buffer origin must not contract on that rest commit. Passive route dates keep the visual origin; only explicit date changes jump to the period start.

Month uses TanStack Virtual over complete, fixed-height week rows. Week-start keys remain stable when weekends are hidden. Extending earlier coverage adjusts the origin and pixel offset before paint; scroll handlers never restore attempted offsets. Row retirement occurs after gestures settle.

[Interaction host](../../../apps/web/src/shared/components/calendar/calendar-interactions.tsx) retains pointer sessions and previews above virtualized columns, computes civil-date displacement with scroll deltas and stops writes into incomplete dates. One clock provider drives the continuous wall-clock line and today segment. Focused timed columns are pinned as one extra virtual item.

Continuous scroll reports viewport demand separately from buffered demand. Settled visible dates bookmark route search with replace and must not remount or retarget the renderer; explicit navigation retains the previous view until destination coverage arrives. Progress is inline in the toolbar, and initial visits use an inline loading surface. The [workspace](../../../apps/web/src/features/calendar/workspace/calendar-workspace.tsx) visible date is what chrome reads; `CalendarSurface.date` is the last explicit jump target.

Observed foreground latency and scroll speed raise prefetch thresholds up to twice their baseline. Overscan is directional and bounded; large in-memory windows reduce buffer targets at 20,000 events. Structured metrics report latency, cache size, duplicate reads, layout duration and mounted columns without event content. The existing Calendar rollout flag gates this implementation; UI acceptance remains manual.

Cache materialization keys exclude viewport movement within an already materialized buffer. Such movement reads coverage metadata and missing intervals, without re-reading buffered event records or initiating canonical synchronization. Out-of-window explicit destinations retain a separately tagged cache snapshot.
