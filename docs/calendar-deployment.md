# Calendar v1 deployment and acceptance

Calendar is a private Google Calendar client scoped to the signed-in user and selected workspace. It has independent rollout, OAuth credentials, storage and realtime protocols from Mail. The implementation is on `zilobase-calendar` in core and the cloud adapter. General availability remains disabled until the live acceptance checklist below passes.

## Configure an isolated pilot

For source development, store encrypted Calendar credentials in core `.env.development`
and the sibling cloud adapter's `.env.development`. Hosted production credentials
belong in the adapter's encrypted `.env.production`; saving that file does not
update live Workers. The deployment scripts inject Calendar secrets into both
Workers when Calendar is enabled. Preserve existing token encryption keys.

The default local Google redirect URIs are
`http://localhost:3000/calendar/oauth/google/callback` (Node) and
`http://127.0.0.1:3010/calendar/oauth/google/callback` (Worker). Hosted production
uses `https://api.zilobase.com/calendar/oauth/google/callback`. These server-side
flows do not require authorized JavaScript origins. Desktop uses the same Google
callbacks; its application handoff is not a Google redirect URI.

For local testing, set `MAIL_ENABLED=true`, `VITE_FEATURE_MAIL=true`,
`CALENDAR_ENABLED=true`, and `VITE_FEATURE_CALENDAR=true` in each development
environment file. `CALENDAR_ENABLED_WORKSPACE_IDS=*` allows all workspaces in
the isolated local database. Restart the local API, background runner, and web
development server after changing these settings. Production uses the pilot
allowlist described below.

1. Apply the normal additive database migrations (`npm run db:migrate`), including Calendar migrations 0087–0089. Take the normal database backup first. Do not undo migrations to disable rollout.
2. Enable the Google Calendar API in a dedicated Google OAuth project/client. Register the exact canonical API origin plus `/calendar/oauth/google/callback` as an authorized redirect URI. Desktop uses the same web callback and then the existing `zilobase://open` handoff. Configure the normal canonical API/web origins for the deployment.
3. Set server `CALENDAR_GOOGLE_CLIENT_ID`, `CALENDAR_GOOGLE_CLIENT_SECRET`, and `CALENDAR_TOKEN_ENCRYPTION_KEY`. The encryption key must be an independent base64-encoded 32-byte random key; keep it stable and in the deployment secret store. Mail credentials are not fallbacks. Back up the key securely; replacing it requires account reconnection.
4. Set `CALENDAR_WEBHOOK_URL` to the publicly reachable HTTPS API origin plus `/calendar/google/webhook`. Preserve Google's `X-Goog-*` headers through the proxy. This endpoint authenticates channel secrets/resource identity; it does not use the user's browser session.
5. Build the web client with `VITE_FEATURE_CALENDAR=true`. Set server `CALENDAR_ENABLED=true` and `CALENDAR_ENABLED_WORKSPACE_IDS` to an explicit comma-separated pilot workspace allowlist. Empty allowlists disable access. Reserve `*` for a separately approved general rollout.
6. Keep the existing background maintenance runner active. `calendar.sync_recovery` runs every minute under the existing durable maintenance lease and advances sync, maintains watches and drains notification receipts. Node must attach `/calendar-realtime` and use the existing realtime bus; multi-instance deployments need the shared bus configuration. Proxies must support WebSocket upgrade and at least the 20-second heartbeat interval.
7. As a pilot user, request `GET /workspaces/:workspaceId/calendar/configuration`. All returned checks must pass. This authenticated endpoint exposes booleans only. It checks configuration presence/format and runtime capabilities; actual callback reachability and provider consent still require the live checks below.

OAuth requests `openid`, `email`, `calendar.events`, `calendar.calendarlist`, and `calendar.calendars.readonly` (Calendar scopes use the `https://www.googleapis.com/auth/` prefix). Completion rejects missing required grants. Configure Google consent/test users and any required verification before expanding access. Do not log authorization codes, refresh tokens, event bodies, attendees or raw provider responses.

## Automated gates

Run these from core:

```sh
FALLOW_AUDIT_BASE=415caa0cbc427d2b5c81c4ed562e06064303e012 npm run verify:core
npm run test:architecture
npm run quality:web-bundle
npm run verify:desktop
npm run test:calendar:integration
npm run test:calendar:browser
```

The integration runner creates, migrates and drops a disposable PostgreSQL database using the local Node development profile. It never runs the fixture against the application database. Browser acceptance uses an isolated fixture server and mocked provider transport with real IndexedDB, route interactions and sockets. It saves twelve theme screenshots and verifies that cached day/week/month navigation with 1,000 occurrences stays below 100 ms. These tests do not establish live Google acceptance.

Run `npm run build` and `npm test` in the cloud adapter against the matching core checkout. The adapter suite includes real durable-object/socket tests. The audit base is the original core branch point (`415caa0c`), pinned because local `main` can move independently; inherited findings in older Mail/clipper work must not be mistaken for Calendar regressions. No audit thresholds are relaxed.

## Live acceptance — required before general availability

Use disposable calendars, two explicitly authorized Google accounts, and consenting test invitees. Record runtime/version, date, expected behavior and observed result for every row. Run the web checks on both Node and hosted adapter deployments and the callback/notification checks on desktop.

| Check | Required observation |
| --- | --- |
| OAuth | Connect two accounts, cancel consent, reconnect revoked credentials; web and desktop return to the correct server. Missing consent and replay fail safely. |
| Isolation | Switch users/workspaces/accounts; neither private event contents nor cached details cross scope. Disconnect one account while the other remains usable. |
| Views | Day/week/month/agenda, multi-day/all-day overlap, search within the displayed period, zones and DST produce consistent dates. Review all six theme families in light/dark and narrow layouts. |
| Writes | Create, edit, duplicate, same-account move, delete, drag and resize. Exactly one write is sent on drop; offline controls are disabled. |
| Guests and Meet | Send invitations only to consenting test users; change guests, RSVP and inspect Meet success/pending/failure. Retry a lost response without duplicate events or invitations. |
| Recurrence | Edit one occurrence, following occurrences and the whole series; verify moved/cancelled exceptions, COUNT limits, DST and split recovery after restart. |
| External changes | Edit/delete in Google; verify watch invalidation and local convergence. Disable push and verify provider recovery polling catches the change. |
| Recovery | Expire tickets, interrupt sockets, suspend/resume the device, use multiple tabs, and lose connectivity. Cached periods remain readable and offline feedback remains explicit without a routine sync-status strip. |
| Reminders | Navigate away from Calendar; one reminder appears across open tabs. Test permission denial, edited/cancelled events, wake-up and disconnect. No closed-app delivery is promised. |
| Disable | Disable Calendar independently and confirm Mail continues working. Re-enable the pilot and verify reconnection/cache recovery. |

Current automated acceptance is not a substitute for these live rows. No production deployment or live invitation delivery is part of the local implementation verification.

## Sync cadence and local development

Google webhooks dispatch Calendar work immediately after recording durable dirty markers. Event tasks drain committed revision notifications before completing; calendar-list tasks refresh metadata and queue event streams. Normal processing targets seconds after webhook receipt, subject to provider delivery, queue load and pagination. The minute-based maintenance runner repairs interrupted work and missed dispatches.

Visible online clients use jittered recovery checks at approximately one minute without active provider-watch coverage, or five minutes when provider watches and the websocket are both healthy. The 20-second socket heartbeat is not a Google poll. Failure backoff is bounded; focus/visibility/connectivity recovery triggers coalesced checks. A connected websocket alone does not prove Google push is available.

Localhost requires a reachable HTTPS webhook URL to receive Google notifications. Without `CALENDAR_WEBHOOK_URL`, local development intentionally uses fallback polling. Configure a reachable endpoint and restart the relevant runtimes before expecting push; no client change can make Google deliver to a private localhost address. Realtime tickets return `providerWatchExpiresAt` only for complete active coverage. Check actual external event convergence in addition to configuration booleans.

The existing `calendar.sync` background resource payload supports `[accountId, calendarId]` and `[accountId, null]` for list refreshes. Deploy matching core code to task consumers before the webhook producer when rolling out across separate runtimes. Missing watch metadata on older realtime-ticket responses safely retains fallback polling. The metadata-only catalog endpoint must be deployed before the updated web client.

## Operations and recovery

Server metrics are structured `calendar.*` records containing only a numeric value and success/failure outcome. Browser metrics are local `zilobase:calendar:metric` custom events; an existing telemetry integration can subscribe without including identity or event data. Implemented measurements cover sync lag, cache hits, range latency, watch expiry, reconnects, throttling, ambiguous writes and reminders. Use these with the existing background runner health; configuration readiness does not prove the runner is executing.

Investigate growing sync lag/watch expiry and repeated throttling before expanding the allowlist. Reconnect revoked accounts through settings. Leave ambiguous operation receipts intact: status reconciliation checks provider markers/ETags and deterministic IDs; do not generate replacement operation IDs to force a retry. Following-series edits resume their saved steps. Cached canonical data remains stale during expired-token recovery until a complete replacement generation commits.

Disable access with `CALENDAR_ENABLED=false` and rebuild without `VITE_FEATURE_CALENDAR` when removing the UI. Preserve data and encryption keys for a reversible rollback. Disconnect while enabled to stop watches and remove the binding/cache; the account is removed only after its final binding is deleted. Existing short-lived realtime tickets expire; invalidation packets contain revision metadata only. Mail flags and OAuth configuration remain independent.

## Supported boundaries

Imported recurrence rules remain intact unless explicitly changed. Following edits support a single RRULE; complex imported rule sets require the external Google action. Following splits reset later exceptions to match Google's documented model. Search is bounded to the displayed period. Cached reading requires previously loaded periods. Provider mutations require connectivity, and system reminders require permission while an app window is running.

Page/database integration, bookings, published availability, automatic blocking, offline writes, closed-app alarms, cross-account moves, bulk operations, calendar lifecycle/subscription management and ACL administration are outside v1.

## References

[CalendarCN](https://github.com/vmnog/calendarcn) informed interaction/layout design; no source code was copied. [Notion event workflows](https://www.notion.com/help/manage-your-calendars-and-events) and [settings](https://www.notion.com/help/notion-calendar-settings) informed product behavior. Provider rules follow Google's [incremental sync](https://developers.google.com/workspace/calendar/api/guides/sync) and [recurrence](https://developers.google.com/workspace/calendar/api/guides/recurringevents) documentation. Zilobase components and semantic tokens remain the visual source of truth.

## Refresh-only 404 after a local code update

A running API may still have the old route table after the web client reloads.
In particular, the client now reads `GET /connections/:bindingId/catalog` during
refresh; older APIs support `/ranges` but do not mount `/catalog`. This can show
an intermittent 404 while ordinary schedule loading still succeeds. Restart the
local API manually after updating both workspaces. An unauthenticated 401 is not
a route-compatibility check: authentication middleware runs before routing.
Verify an authenticated catalog request returns 200 after restarting. Do not
suppress all 404s: missing or inaccessible provider resources still require
attention. Cached schedules remain available during recovery.

## Layout regression coverage

The [Calendar browser fixture](../scripts/calendar/e2e/fixture.tsx) mounts the
production workspace controller, padded pane header, resizable/mobile dock, and
Calendar/AI visibility arbitration. Its AI content is a fixture; event details
and editing use the production components. The browser suite covers topbar order
and compact controls, eye-only visibility, muted names, action spacing, dialog
cancellation/failure, draft retention across dock and breakpoint changes, nested
keyboard controls, focus restoration, and scoped event deep links. It also keeps
the snapping, pinned-header, continuous-Month, cache recovery and 1,000-event
navigation checks. Tests intercept provider requests and do not start or restart
the development application/API. Light/dark screenshots are emitted in the
configured Playwright output directory for visual review.

## Empty grid with successful range requests

Check that each event in `/ranges` has structured `start` and `end` objects
(`dateTime`/`timeZone` or `date`). A previous response mapper accidentally spread
the request range over events, replacing these objects with range-boundary
strings. Google snapshots remained correct, but the browser overlap filter
could not place these malformed events. Update and restart the API, then reload
Calendar and allow its next successful range refresh to replace affected cache
entries. No Google reconnection or database migration is required. The integration
suite checks provider time preservation through the response mapper and the
same overlap/layout functions used by the browser.
