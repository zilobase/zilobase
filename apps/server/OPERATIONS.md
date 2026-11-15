# Core application operation inventory

This inventory tracks extraction into the existing features and server packages.
A service implementation alone is **not** a supported direct application API:
callers also need request-equivalent authentication, policy and workspace checks.
The application boundaries below are implemented in the supported package entrypoints; validation results are recorded at the end of this document.
Package calls do not supply an actor in their payload. HTTP paths remain unchanged.

## Context and ownership

Client operations take `(ClientOperationContext, input)`. The context contains
`apiFetch`, the initialized `queryClient`, and optional `lifecycle`; operations
using authentication additionally require `auth`. Initialize with
`createZilobaseClient({ deployment, queryClient, apiFetch, lifecycle })`, pass the
same ports to operations and the provider, and dispose the returned client when
its runtime ends. Existing initialization arguments remain supported. Identity
comes from that client's session query. Controllers belong to the client/session,
including when no provider is mounted. A deployment/account/session change
expires pending work and disposes the previous controllers and shared collections.

The server entrypoint is `@zilobase/server/operations`. It binds
verified authentication, active/pinned workspace, scopes, runtime, policy, edition
and request identity before invoking domain services. Exporting a persistence
helper or dispatcher does not establish that boundary. HTTP serialization,
cookies, redirects, transport limits and provider callbacks remain adapters.

## Application operations

The following application operation families have package entrypoints. Existing domain query-option factories remain supported imperative read APIs. Operation dependency graphs are checked for React hooks/provider and platform imports. Retry descriptions apply to mutations unless noted.

| Domain                          | Supported actions                                                                                             | Client entrypoint                                                                                     | Server service owner / operation group                                | Authorization                                                                             | Retry behavior                                                          | Cache effects                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Databases: lifecycle            | create, update, archive, restore, favorite                                                                    | `features/databases`                                                                                  | `services/databases/lifecycle`; `databases.executeCommand`            | authenticated actor, workspace membership/ACL, locks, pinned workspace, `databases.write` | same command ID/body receipt replay; reused ID conflicts                | controller metadata/navigation projections and acknowledged deltas                          |
| Databases: access               | upsert/remove access, publish                                                                                 | `features/databases`                                                                                  | `services/databases/access`; `databases.executeCommand`               | resource full access, publishing policy, locks, workspace/scopes                          | database receipt protocol                                               | access collections and bootstrap authorization refresh                                      |
| Databases: sources              | create, update, link, unlink, replace view source, reorder                                                    | `features/databases`                                                                                  | `services/databases/data-sources`; `databases.executeCommand`         | host edit, source access, same workspace where required                                   | receipt protocol and source revision checks                             | host/source metadata and dependent windows                                                  |
| Databases: views                | create, update, delete, reorder, configuration changes                                                        | `features/databases`                                                                                  | `services/databases/views`; `databases.executeCommand`                | host edit, locks and scoped source access                                                 | receipt protocol                                                        | metadata projections, query hashes and record windows                                       |
| Databases: properties/templates | create, update, duplicate, delete; template create/update/archive/restore/apply                               | `features/databases`                                                                                  | `services/databases/schema`, `setup`; `databases.executeCommand`      | source edit, locks, property/template validation                                          | receipt protocol                                                        | shared schema, values, template metadata, dependent reads                                   |
| Databases: rows                 | place/create, update values/title, archive/restore, reorder, hierarchy, duplicate, transfer                   | `features/databases`                                                                                  | `services/databases/commands`, `records`; `databases.executeCommand`  | host/source edit; source/target/page ACL; same workspace; locks                           | receipt protocol, ordering locks and revision conflict errors           | ordered intentions, optimistic records/values, acknowledgements and realtime reconciliation |
| Databases: reads                | bootstrap, record window, export, access, mutation history                                                    | `features/databases`                                                                                  | `services/databases/read`, `history`; `databases`                     | resource read, public/guest capability, pinned workspace, `databases.read`                | existing Query policy; stale window clears snapshot once                | authorized collections, prefer-newest revisions, shared window references                   |
| Pages: lifecycle                | create, update, archive, restore, existing duplicate                                                          | `features/pages`                                                                                      | `services/pages/lifecycle`; `pages`                                   | session/resource ACL, workspace, locks, scopes                                            | no blanket mutation retry                                               | page detail, navigation deltas, title-dependent database windows                            |
| Pages: content                  | read, replace existing content                                                                                | `features/pages`                                                                                      | `services/pages/content`; `pages`                                     | page view/edit, active/pinned workspace, locks                                            | conflict checks; no blind retry                                         | collaboration persistence/document updates and page content state                           |
| Pages: navigation               | favorite, visits, hierarchy, relocate, convert/move teamspace, embed/remove embed                             | `features/pages`                                                                                      | `services/pages/navigation`, `hierarchy`, `placements`; `pages`       | actor/resource/workspace/teamspace ACL                                                    | no blanket retry                                                        | navigation collections, placements, favorites, visits                                       |
| Pages: sharing                  | access CRUD, publish, invitations accept/cancel/revoke, guest requests/review                                 | `features/pages`                                                                                      | `services/pages/sharing`, `page-guests`; `pages`                      | full access or verified invitation/request actor; guest policy; workspace/scopes          | no blanket retry                                                        | access references, page/navigation state, invitation/request queries                        |
| Pages: properties/layout        | property values; resolved layout, save/reset                                                                  | `features/pages`                                                                                      | `services/pages/properties`, `layouts`; `pages`                       | page/source edit or layout scope administration                                           | existing conflicts; no blanket retry                                    | page properties, database values/membership, layout cache                                   |
| Comments                        | existing server append                                                                                        | server only                                                                                           | `services/collaboration`; `pages.appendComment`                       | page edit/appropriate existing comment policy, workspace/scopes                           | no new retry promise                                                    | collaboration document persistence and broadcasts                                           |
| Setup/tasks/imports             | source setup/link/replace, CSV, templates, view config, bulk rows, task database creation, Notion import      | `features/databases`, `features/tasks`, `features/pages`                                              | compose existing application operations                               | each constituent operation enforces its own access                                        | preserve limits and partial success; never blindly retry whole workflow | same constituent cache effects; return created IDs/results                                  |
| Workspaces                      | list/create/update/delete, active workspace, invitations, members, guests and guest policy                    | `features/workspaces`                                                                                 | `services/workspaces`, `memberships`, `page-guests`; `workspaces`     | verified actor, owner/admin/member policy, edition, pinned token restrictions             | no blanket retry                                                        | workspace/session, principal/member/invitation and navigation invalidation                  |
| Teamspaces                      | list/create/update/archive/restore/recover-owner, invitation links, membership, principals, defaults/settings | `features/teamspaces`                                                                                 | `services/teamspaces`; `teamspaces`                                   | workspace/teamspace membership and administrative roles; OAuth unsupported                | no blanket retry                                                        | teamspace/principal/settings and navigation queries                                         |
| Automations                     | definitions CRUD/lifecycle, validate, secrets, catalog, execution history, Slack connect/channels             | `features/automations`                                                                                | `services/automations`; `automations`                                 | database access, automation feature policy, secret/admin restrictions                     | preserve existing transaction/batching; no blanket mutation retry       | definitions, capability/catalog, history caches                                             |
| Calendar                        | event writes, RSVP, duplicate/move, connections, sync, preferences, reads                                     | `features/calendar` (existing callable implementation)                                                | `services/calendar`; `calendar`                                       | connection/record ownership and provider capabilities; OAuth unsupported                  | existing settlement states/reconciliation only                          | calendar optimistic store, settled revisions, ranges and connections                        |
| Meetings                        | CRUD/lifecycle, recorder claim/release, consent, collaboration access to transcript/content                   | `features/meetings`                                                                                   | `services/meetings`; `meetings`                                       | meeting/page ACL, recorder ownership, meeting feature policy; OAuth unsupported           | no blanket retry                                                        | meeting detail/list and page metadata                                                       |
| Settings/account                | user/profile/instance settings, auth/account actions, API keys, OAuth apps/consents                           | `features/user-settings`, `features/auth`, `features/instance`, `features/api-keys`, `features/oauth` | corresponding services; `settings`, `auth`                            | verified account/admin, pinned restrictions, authentication/edition policy                | existing auth behavior; no blanket mutation retry                       | session, user settings, instance settings, key/app/consent lists                            |
| Search                          | existing resource/search queries                                                                              | `features/search`                                                                                     | `services/search`; `search`                                           | resource visibility, workspace membership/pinning, `search.read`                          | existing read query policy                                              | existing search references and collections                                                  |
| Notifications                   | inbox list, mark one/all read                                                                                 | `features/notifications`                                                                              | `services/notifications/inbox`; `notifications`                       | actor/workspace membership; OAuth unsupported                                             | no blanket mutation retry                                               | workspace inbox invalidation                                                                |
| Uploads                         | image/profile create, transfer, complete, remove                                                              | `features/uploads`                                                                                    | `services/images`, `services/user-settings/profile/images`; `uploads` | existing page/profile ownership, limits and storage policy                                | no blanket retry; retain partial create/transfer/complete state         | existing image/profile/page caches                                                          |
| Clipping                        | duplicate lookup and create                                                                                   | `features/clips`                                                                                      | `services/clips`; `clips`                                             | verified token, target page/workspace access, `clips.write`                               | extension retains existing token refresh only                           | created page/navigation results                                                             |

## Internal and adapter-only capabilities

Database dispatchers, receipt persistence, direct Drizzle writes, outbox delivery,
queue consumers, maintenance/recovery jobs, provider webhooks, sync workers,
physical byte transfer, audio capture, redirects and native integrations are not
public application operations. HTML/page conversion remains owned by the existing
conversion packages. Live editor formatting/selection/anchors/undo and Yjs UI
controllers remain in web. Chat/model integration, AI tools, new block commands,
and sibling products are excluded.

## Unsupported legacy meeting summary hook

`useGenerateMeetingSummary` calls `POST /meetings/:id/summary` and polls a job
endpoint. Neither endpoint is registered in `routes/meetings/meeting-routes.ts`.
Keep this legacy hook compatible while migrating other operations; do not export
it as a supported callable operation or create a summary backend in this refactor.

## Server package groups

`createServerOperations(context)` binds the actor, runtime ports, database environment, edition extension and request policy once. Inputs cannot replace that context. The supported groups are `databases`, `pages`, `workspaces`, `teamspaces`, `automations`, `calendar`, `meetings`, `userSettings`, `instance`, `apiKeys`, `search`, `notifications`, `auth`, `uploads` and `clips`.

- `databases.executeCommand` is the existing validated receipt/acknowledgement protocol. Reads are `getBootstrap`, `getRecordWindow`, `getExport`, `getAccess` and `getMutationHistory`.
- `pages` exposes lifecycle, content, properties, layouts, access, publishing, hierarchy, visits/favorites, guest invitations/requests and `appendComment`.
- `workspaces` exposes lifecycle, access targets, membership/invitations and guest policy/review actions. `teamspaces` exposes settings/defaults, lifecycle, membership, invitation links and principal management. There is no existing teamspace-delete endpoint to advertise.
- `automations` exposes definition CRUD, validation, receipt-aware duplication, pause/resume, catalog/capability, secrets, execution history/audit and Slack connection actions. HTTP adapters retain the create/replay status distinction.
- `calendar` exposes connection/source/calendar reads, event writes/reconciliation, range/search/catalog/sync and validated preferences. The existing settlement state and 200/202 HTTP distinction remain intact.
- `meetings` exposes create/read/update/delete, lifecycle, recorder claim/release, consent and collaboration-ticket preparation. Existing transcript/content access uses the ticket-authorized Yjs collaboration channel; there is no separate transcript REST endpoint. Transcript persistence remains owned by the authenticated recording runtime. Audio capture and websocket transport remain adapters.
- `userSettings`, `instance` and `apiKeys` expose their existing validated settings/account administration. `search.workspace` and `notifications.list`/`markRead` use the same visibility and membership services as HTTP.
- `auth` exposes the existing Better Auth APIs for sign-in/verification/account actions, workspace auth operations, OAuth clients/consents and session reads. Provider callbacks, browser redirects, cookie serialization and registration adapter behavior remain at the authentication boundary. A verified session token can be supplied through `authentication.session`; optional `request` carries original authentication/extension metadata when available. These methods do not introduce a second authentication implementation.
- `uploads` exposes page/profile create/complete/remove and image URL resolution. Binary HTTP streams and storage transfer remain adapters. `clips.create`/`findDuplicate` reuse the existing conversion and ACL services.

Domain service input validation is shared with package callers. HTTP supplies deferred JSON readers so authentication and permission decisions retain their existing ordering. `ServerOperationError` retains denial body, status and challenge headers for HTTP serialization.

## Upload and clipping adapters

Features upload operations accept metadata plus an injected `transfer(target, createdRecord)` callback. That callback receives the created upload ID so a caller can retain a partial upload for recovery. A failed transfer never automatically completes, retries or deletes it. Separate create/complete operations are exported for callers needing explicit phase control. Profile completion/removal updates the same session query consumed by React.

Web passes browser `File` bytes to its existing desktop/browser networking adapter. Signed S3 transfers omit application credentials; binding transfers retain their authentication headers and instance URL mapping. Clipper token refresh remains in the extension transport and retries a 401 once; other failures do not replay the mutation.

## Named client operation exports

The lists below contain application operations. Domain entrypoints also export their existing query-option factories for imperative reads with the same QueryClient. Types named `*Input`/`*Result` or `*OperationInput`/`*OperationResult` accompany the operations.

- `@zilobase/features/api-keys`: `createApiKey`, `deleteApiKey`, `updateApiKey`.
- `@zilobase/features/auth`: `changePassword`, `deleteAccount`, `requestEmailVerificationOtp`, `requestSignInOtp`, `setPassword`, `signInWithOtp`, `signInWithPassword`, `signOut`, `signUp`, `updateUserProfile`, `verifyEmailOtp`.
- `@zilobase/features/automations`: `createDatabaseAutomation`, `createDatabaseAutomationSecret`, `databaseAutomationLifecycle`, `startSlackAutomationOauth`, `updateDatabaseAutomation`, `validateDatabaseAutomation`.
- `@zilobase/features/calendar`: `connectCalendar`, `disconnectCalendarConnection`, `executeCalendarMutation`, `reconcileCalendarWrites`, `saveCalendarPreferences`.
- `@zilobase/features/clips`: `createClip`, `findDuplicateClip`.
- `@zilobase/features/databases`: `addDatabaseProperty`, `addDatabaseRow`, `addDatabaseView`, `applyDatabaseTemplate`, `archiveDatabaseRow`, `archiveDatabaseTemplate`, `createDatabase`, `createDatabaseDataSource`, `createDatabaseTemplate`, `deleteDatabase`, `deleteDatabaseAccess`, `deleteDatabaseProperty`, `deleteDatabaseView`, `duplicateDatabaseProperty`, `linkDatabaseDataSource`, `replaceDatabaseViewDataSource`, `restoreDatabase`, `restoreDatabaseRow`, `restoreDatabaseTemplate`, `runDatabaseRecordActions`, `setDatabaseFavorite`, `setDatabasePublished`, `unlinkDatabaseDataSource`, `updateDataSource`, `updateDatabase`, `updateDatabaseProperty`, `updateDatabasePropertyValue`, `updateDatabaseTemplate`, `updateDatabaseView`, `upsertDatabaseAccess`.
- `@zilobase/features/instance`: `updateInstanceSettings`.
- `@zilobase/features/meetings`: `claimMeetingRecorder`, `createMeeting`, `deleteMeeting`, `meetingLifecycle`, `recordMeetingConsent`, `releaseMeetingRecorder`, `updateMeeting`.
- `@zilobase/features/notifications`: `markInProductNotificationRead`.
- `@zilobase/features/pages`: `acceptPageGuestInvitation`, `cancelPageGuestInvitation`, `convertPageToTeamspace`, `createPage`, `deletePage`, `deletePageAccess`, `duplicatePage`, `embedPageItem`, `getPage`, `getPageContent`, `getPageProperties`, `invitePageGuest`, `movePageToTeamspace`, `recordItemVisit`, `removePageEmbed`, `replacePageContent`, `resetPageLayout`, `restorePage`, `revokePageGuest`, `savePageLayout`, `setPageFavorite`, `setPagePublished`, `updatePage`, `updatePagePropertyValue`, `upsertPageAccess`.
- `@zilobase/features/teamspaces`: `acceptTeamspaceInvite`, `addTeamspacePrincipal`, `createTeamspace`, `removeTeamspacePrincipal`, `setTeamspaceMembership`, `teamspaceLifecycle`, `updateTeamspace`, `updateTeamspaceDefaults`, `updateTeamspaceInviteLink`, `updateTeamspacePrincipal`, `updateTeamspaceSettings`.
- `@zilobase/features/uploads`: `completePageImageUpload`, `completeProfileImageUpload`, `createPageImageUpload`, `createProfileImageUpload`, `removePageImage`, `removeProfileImage`, `uploadPageImage`, `uploadProfileImage`.
- `@zilobase/features/user-settings`: `updateUserSettings`.
- `@zilobase/features/workspaces`: `acceptWorkspaceInvitation`, `createWorkspace`, `deleteWorkspace`, `inviteWorkspaceMember`, `promoteWorkspaceGuest`, `removeWorkspaceMember`, `reviewWorkspaceGuestRequest`, `revokeWorkspaceGuest`, `setActiveWorkspace`, `updateWorkspace`, `updateWorkspaceGuestPolicy`, `updateWorkspaceMember`.

- `@zilobase/features/oauth`: `listOAuthApps`, `listOAuthConsents`, `publicOAuthClient`, `createOAuthApp`, `deleteOAuthApp`, `revokeOAuthConsent`, `submitOAuthConsent` and `requestGoogleAuthorization` accept operation contexts; existing transport-only signatures remain compatible. `submitOAuthConsent(context, input)` additionally requires the authentication port.

## Validation recorded for this refactor

Validated on 2026-10-19 in the shared working tree:

- `npm run test:packages`: 512 features tests, 6 page-context tests and 9 HTML conversion tests passed.
- `npm run test:web`: 597 checks passed, including upload transfer, desktop server replacement, cache and existing React consumer checks.
- `npm run test:server`: 755 tests passed, 13 existing skips; coverage gates, 260 query regression tests and server build passed.
- `npm test --workspace @zilobase/clipper`: 6 transport tests passed, including the single 401 refresh/retry boundary.
- Workspace typecheck, architecture checks (including 112 published export conditions), lint and formatting passed. Lint retains existing warnings.
- Web and clipper production builds passed; the web bundle budget passed.
- T3 browser smoke exercised mounted table and kanban consumers: optimistic sort retained its confirmed query identity, row movement survived a stale refresh, and acknowledgement settled the pending move without losing it. The signed-out application login screen also mounted.
- A focused authentication regression verifies successful sign-in with an observed session query and later session invalidation/refetch. Upload adapter coverage verifies that changing the desktop server during byte transfer prevents completion against the replacement server.

The desktop check covers the shared networking adapter; it is not a packaged native application launch. The unsupported legacy meeting-summary hook described above remains unchanged.

## Cleanup passes

The behavior-preserving cleanup keeps operation definitions beside their exported functions and uses named input/result contracts. Hooks reuse those inputs, while `runClientMutation` retains identity guards and mutation/cache execution. Shared principal, template and row-state factories remain domain-owned.

The passes cover small client mutations; authentication, membership and integration operations; page/database operations; server management wrappers and meeting guards; OAuth compatibility types; architecture coverage; and recorder operations. Server helpers preserve the order of policy, actor, workspace and payload checks. Context-based and legacy transport-only OAuth signatures remain supported.

Across the 63 reviewed operation implementation files, the cleanup removes 98 one-use mutation-definition wrappers and renames the retained shared principal factory. Their combined length changes from 10,217 to 9,699 lines. No source modules are moved or deleted.

Cleanup validation on 2026-10-19:

- 520 features tests and 597 web checks passed, including identity transitions, optimistic overlap, authentication refresh, uploads and existing React consumers.
- 759 server tests passed with 13 existing skips, plus 260 query regressions; coverage gates and server build passed. New direct-call tests verify meeting denial ordering before payload access.
- Workspace typechecks, lint, formatting and architecture checks passed. Existing lint warnings remain.
- Operation graph tests follow dynamic imports and erased type exports correctly, discover all 16 published React entrypoints, reject transport/auth aliases in hook owners and check the server API's transitive HTTP boundary.
- The web production build and bundle budget passed. Existing platform transport and storage implementations retain their behavior.
- One existing route-error profile test missed its 10 ms settling window under parallel validation; its focused run and subsequent full web runs passed.

Offline session-policy ownership and the unsupported legacy meeting-summary UI remain separate follow-ups.
