# Team and guest tabs + teamspaces implementation plan

Status: Implemented in five green, independently committed phases
Date: 2026-08-22
Scope: Zilobase community, cloud adapter, and Enterprise-compatible extension points

## 1. Outcome

Deliver two related changes:

1. Reorganize `Settings -> Team` into separate **Team** and **Guests** tabs without changing the current workspace-member and page-guest meanings.
2. Add first-class **teamspaces**: workspace-scoped content areas with their own discovery mode, membership, owners, permissions, security policy, pages, sidebar section, lifecycle, and workspace-wide administration.

The target is Notion-like behavior, adapted to Zilobase's existing roles, page access rules, standalone databases, page guests, temporary members, self-hosting, and Enterprise audit extension.

## 2. Reference behavior and terminology

The Notion reference establishes these product behaviors:

- Every workspace has at least one teamspace.
- A teamspace is `open`, `closed`, or `private`.
- Teamspaces have owners and members.
- A teamspace can be made a default so current and future workspace members join it.
- Workspace owners can restrict teamspace creation to workspace owners.
- Users can browse discoverable teamspaces, join open ones, leave non-default ones, and add or move pages into a teamspace.
- Teamspace owners manage General, Members, Permissions, and Security settings.
- Teamspaces are archived and restored, not permanently deleted.
- Workspace owners can search/filter teamspaces, recover ownerless teamspaces, and manage archived teamspaces.

Zilobase terminology in this plan:

- **Workspace member**: a row in the existing `member` table with role `owner`, `admin`, `member`, or `temporary`.
- **Page guest**: an external user in the existing `workspace_guest` table who only has explicit page access.
- **Sharing group**: the existing `team` + `teamMember` records used as access-rule targets. This is not a teamspace.
- **Teamspace**: a new content container inside a workspace.
- **Teamspace owner/member**: a role inside one teamspace; it does not change the person's workspace role.

## 3. Current-state findings

The repository already provides most prerequisites:

- `apps/web/src/pages/settings/team.tsx` contains member invitations, roles, temporary access, registration policy, guest policy, guest requests, promotion, revocation, and lists.
- `workspace_guest`, `page_guest_invitation`, and `page_guest_request` already distinguish guests from workspace members.
- `page_access` supports `user`, sharing-group `team`, and public principals with `view`, `comment`, `edit`, and `full` access.
- `access.ts` centralizes effective page/database access and accessible-page enumeration.
- `page_item_placement` supplies page/database hierarchy, but there is no teamspace parent.
- The sidebar currently labels any root page with any `page_access` rule as `isTeamspace`; this is actually a shared page, not a teamspace.
- The existing `team` table is a Better Auth/sharing-group concept and lacks teamspace identity, roles, access mode, lifecycle, security, defaults, and content ownership.
- Realtime collaboration, search, database access, guest routes, and publishing all depend on the same access model and must be updated together.

Important architectural decision: do **not** overload or rename the existing `team` table. Add explicit teamspace tables and rename the misleading client/API `isTeamspace` flag to `isShared` during the migration.

## 4. Product requirements

### 4.1 Team settings tabs

Keep the existing `/settings/team` route and add URL-backed tabs using `?tab=team` and `?tab=guests`. Default to `team` and gracefully normalize unknown values.

**Team tab**

- Server registration section for the existing eligible instance owner.
- Invite member form.
- Workspace member list and role/temporary-expiration controls.
- Pending workspace invitations.
- Existing permissions remain: owners/admins manage members; only owners change owner roles; the last workspace owner cannot be removed or demoted.

**Guests tab**

- Guest invitation policy.
- Pending guest access requests with approve/reject actions.
- Page guest list with pages and access levels.
- Revoke guest action.
- Promote guest to workspace member action for workspace owners.
- Members who cannot administer guests either see a read-only explanatory state or do not see the tab. Prefer a visible disabled/read-only state so the member/guest distinction is discoverable.

UI details:

- Use the existing tabs component with `variant="underline"` below `SettingsHeader`.
- Show count badges: active workspace members + pending invitations on Team, and page guests + pending guest requests on Guests.
- Preserve keyboard navigation and mobile horizontal scrolling.
- Keep independent loading/error/empty states so one failed request does not blank both tabs.
- Make the selected tab deep-linkable and browser-history aware.

### 4.2 Workspace-wide teamspace administration

Add `Teamspaces` to `SettingsSidebar` and route it as `/settings/teamspaces`.

The page contains:

- **Default teamspaces** multi-select. Updating defaults applies to current active workspace members and to future membership grants.
- **Who can create teamspaces** setting: `workspace_owners` or `workspace_members`.
- Search and filters for active/archived status, owner, access mode, and optionally ownerless teamspaces.
- A table/list with teamspace, owners, member count, access, security summary, and updated timestamp.
- `New teamspace` action.
- Row actions based on authority: open settings, join as member, take ownership, archive, restore.
- Private teamspaces must not appear to ordinary non-members. Only workspace owners get the all-teamspaces administrative view.

### 4.3 Create a teamspace

Creation is available from:

- `Settings -> Teamspaces -> New teamspace`.
- The sidebar `Teamspaces` heading `+` action.
- The global `New` menu, if the actor is allowed to create teamspaces.

Required inputs:

- Name, 1-120 characters.
- Optional description, maximum 2,000 characters.
- Emoji/icon using the existing icon picker value format.
- Access mode: `open`, `closed`, or `private`.

Creation behavior:

- The creator becomes a teamspace owner.
- The teamspace starts active and non-default.
- No page access is granted outside the configured teamspace baseline.
- An optional first page may be created after the container transaction succeeds; failure to create that page must not roll back or hide the teamspace.
- The result is idempotent under retried requests through a client request ID or database uniqueness guard.

### 4.4 Access modes

| Mode | Discoverable by workspace members | Self-join | Invite | Visible to guests |
| --- | --- | --- | --- | --- |
| Open | Yes | Yes | Owners or members, subject to invite policy | Only through explicit page guest access when guests are enabled |
| Closed | Yes | No | Owners or members, subject to invite policy | Only through explicit page guest access when guests are enabled |
| Private | Only teamspace principals and workspace owners in admin mode | No | Owners only by default | Only through explicit page guest access when guests are enabled; never browseable |

Opening an open teamspace from Browse does not silently change state. The user explicitly selects `Join`, after which the teamspace appears in their sidebar.

### 4.5 Teamspace membership and roles

- Only active workspace members can be direct teamspace members/owners.
- Page guests cannot join teamspaces.
- A sharing group may be added as a teamspace member or owner in the full release. Its users receive effective access while they remain in that group.
- Direct role: `owner` or `member`.
- Teamspace owners always have `full` content access and can manage teamspace settings.
- Teamspace members receive the configured member baseline access.
- A member can leave a non-default teamspace unless they are its last direct owner.
- Default teamspaces cannot be left while still default.
- Normal UI prevents removal/demotion of the last direct owner. If a teamspace becomes ownerless through workspace-member removal, expiry, SCIM, or group changes, workspace owners can claim ownership.
- Removing a user from a workspace immediately removes effective teamspace access. A cleanup job may delete stale teamspace-principal rows, but authorization must not depend on cleanup timing.
- Promoting a page guest to a workspace member does not automatically join non-default teamspaces.

### 4.6 Default teamspaces

- A workspace must always have at least one active default teamspace after initial setup.
- Making a teamspace default adds every active workspace member as a teamspace member while preserving existing teamspace owners.
- Future membership grants call a teamspace-membership hook in the same transaction and join every default teamspace.
- Removing default status is source-aware: remove automatically added membership only, preserve explicitly invited members and owners. This is safer than removing every person indiscriminately.
- Changes are transactional, show a confirmation with the number of affected people, and emit an audit event.
- Recommend no more than three defaults in UI copy, but do not hard-limit unless product decides to enforce it.

### 4.7 Teamspace settings

Open a settings dialog from the teamspace `...` menu with four tabs.

**General**

- Icon, name, description.
- Archive action with impact confirmation.
- Read-only teamspace ID/copy link can be included for supportability.

**Members**

- Default-teamspace toggle for workspace owners.
- Search and add active workspace members and sharing groups.
- List direct users/groups and show effective role/source.
- Change owner/member role.
- Remove direct principal.
- Enable, rotate, copy, or disable an invite link when permitted.

**Permissions**

- Access mode: open, closed, private.
- Teamspace owner baseline: `full`, fixed.
- Teamspace member baseline: `view`, `comment`, `edit`, or `full`; default `edit`.
- Everyone else baseline: `none`; open teamspaces become accessible after explicit self-join.
- Who may invite members: `owners` or `owners_and_members`.
- Who may edit the teamspace sidebar: `owners` or `owners_and_members`.
- Optional per-user/group content-access override for Enterprise-capable deployments.

**Security**

- Invite link enabled/disabled.
- Guests enabled/disabled.
- Public publishing enabled/disabled.
- Export enabled/disabled.
- Workspace-level policy is the ceiling. A teamspace owner can make a teamspace more restrictive; only a workspace owner may make it less restrictive where the workspace policy permits.
- Security settings must be enforced in server routes, not only hidden in UI.

### 4.8 Teamspace content and navigation

- Sidebar sections become `Private`, one section per joined/default teamspace, and `Shared` for explicit shares that are not teamspace content.
- Each teamspace heading shows its icon/name, expand/collapse state, `+` page action, and `...` menu.
- A `More`/Browse teamspaces action lists joined and discoverable open/closed teamspaces.
- Create page under a teamspace from its `+` action.
- Move a root page or standalone database into another permitted teamspace.
- Move content back to Private only when the actor owns the destination private scope and doing so would not expose or strand nested collaborators without confirmation.
- Children inherit their top-level content scope. Cross-teamspace parent/child placements are rejected.
- Drag/drop uses the same move service as the explicit Move dialog.
- Store collapse/order preferences per user and teamspace, extending `sidebar_config` rather than putting presentation state on the teamspace.
- Favorites and recents may show accessible content from any scope; their row should display a teamspace badge/context.

### 4.9 Turn an existing page into a teamspace

Offer `Turn into teamspace` only when:

- The actor has `full` access to the page.
- The page is an active root page, not a database row or database host page.
- The actor is a workspace owner or a teamspace owner and passes the workspace creation policy.
- The page and its descendants have no invalid cross-workspace placements.

The transaction:

1. Creates the teamspace with the page name/icon/summary as defaults.
2. Makes the actor an owner.
3. Moves the selected page tree under the new teamspace without changing page IDs, URLs, content, comments, favorites, or collaboration documents.
4. Preserves explicit page access rules.
5. Warns before conversion if the selected access mode would broaden access beyond the existing explicit rules.

Do not conflate the page with the container in storage; retaining an independent teamspace record avoids lifecycle and permission coupling.

### 4.10 Archive and restore

- Teamspaces are soft-archived, never hard-deleted through product UI.
- Archive removes the section from member sidebars and prevents new content/membership mutations.
- Existing pages remain stored. Direct links return an archived-teamspace state to authorized owners rather than leaking content to others.
- Workspace owners who own or claim the teamspace can restore it.
- Restore reinstates the same membership, page placement, settings, and sidebar visibility.
- At least one active default teamspace must remain; the last active default cannot be archived.

## 5. Data model

Add a migration after `0047_guest_access_controls.sql`.

### 5.1 Workspace columns

Add to `workspace`:

- `teamspace_creation_policy text not null default 'workspace_members'`
- check: `workspace_owners | workspace_members`

If workspace-wide security ceilings are not already modeled by the time this ships, add explicit boolean columns for guest, public-sharing, and export ceilings. Avoid burying authorization-critical policy in `metadata`.

### 5.2 `teamspace`

- `id text primary key`
- `workspace_id text not null references workspace(id) on delete cascade`
- `name text not null`
- `description text`
- `icon jsonb`
- `access_mode text not null default 'closed'`
- `member_access_level text not null default 'edit'`
- `invite_policy text not null default 'owners_and_members'`
- `sidebar_edit_policy text not null default 'owners_and_members'`
- `is_default boolean not null default false`
- `invite_link_enabled boolean not null default false`
- `invite_link_token_hash text`
- `guests_enabled boolean not null default true`
- `public_sharing_enabled boolean not null default true`
- `export_enabled boolean not null default true`
- `created_by_id text references user(id) on delete set null`
- `archived_by_id text references user(id) on delete set null`
- `archived_at timestamptz`
- `created_at`, `updated_at`

Constraints/indexes:

- Access, access-level, and policy checks.
- Unique case-insensitive active name per workspace.
- Workspace + archived + updated index.
- Workspace + default partial index.
- Unique non-null invite-link token hash.

### 5.3 `teamspace_principal`

Use a principal table instead of reusing `teamMember`:

- `id text primary key`
- `teamspace_id text not null references teamspace(id) on delete cascade`
- `principal_type text not null`: `user | team`
- `principal_id text not null`
- `role text not null`: `owner | member`
- `membership_source text not null`: `creator | explicit | default | self_join | invite_link | group`
- `access_level_override text`
- `added_by_id text references user(id) on delete set null`
- `created_at`, `updated_at`
- Unique `(teamspace_id, principal_type, principal_id)`.

Because a polymorphic principal cannot use a normal foreign key, service code must validate the target is an active workspace member or a sharing group in the same workspace. If strict foreign keys are preferred, split this into `teamspace_member` and `teamspace_group` tables.

### 5.4 Content scope

Add nullable `teamspace_id` to `page` and `database`:

- A root page/database with `teamspace_id = null` is private/shared legacy content.
- A teamspace root has `teamspace_id` set.
- Descendants resolve the same scope through primary placements; move services update the subtree in one transaction so access checks remain fast.
- Add workspace + teamspace + deleted indexes.
- Add service invariants that a parent and child share the same teamspace scope and workspace.

Persisting the resolved teamspace on descendants intentionally denormalizes scope. Central move/convert services must be the only writers, and invariant tests/repair tooling must detect drift.

### 5.5 Optional membership-history table

For traceability and source transitions, add `teamspace_membership_event` or rely on Enterprise audit events. Community can initially rely on timestamps plus structured logs; Enterprise must receive security events.

## 6. Effective access model

Centralize this in `access.ts`; no route should duplicate it.

Evaluation order for a teamspace page:

1. Reject deleted content and normal access to archived teamspaces.
2. Verify active workspace membership or an allowed page-guest record.
3. Workspace owner does not automatically receive content access to private teamspaces in normal browsing. Admin actions use a separate explicit administrative capability.
4. Direct/team-group teamspace owner grants `full`.
5. Direct/team-group teamspace member grants the principal override or teamspace member baseline.
6. Existing inherited `page_access` rules may grant a higher page-specific level.
7. Page-guest access is considered only if `guests_enabled` and an explicit page rule exists.
8. Public access is considered only if `public_sharing_enabled` and workspace policy permits it.
9. Return the highest allowed content level; teamspace security ceilings can still deny publishing, guest invitation, or export actions.

For private/shared legacy roots, keep the current creator + inherited `page_access` behavior.

Critical compatibility change: do not apply `graph.hasOwnedRootAccess` to a teamspace root merely because a user originally created it. After a page is moved into a teamspace, teamspace role and page rules define access.

Update all access consumers:

- Page reads/writes, content replacement, move, delete, restore, share, publish, export.
- Accessible page enumeration, search, recents, favorites, AI context/tools.
- Database hosts, standalone databases, database rows and realtime.
- Page/database collaboration tickets and cloud-adapter security.
- Guest invitations/requests and guest revocation.
- Public API/API-key workspace checks.

## 7. Server API and services

Create `features/teamspaces/` with route, service, schemas, policy helpers, and tests. Keep transactional rules in a `TeamspaceService`; route handlers should only authenticate, validate, invoke, and map errors.

### 7.1 Workspace-level endpoints

- `GET /workspaces/:workspaceId/teamspace-settings`
- `PATCH /workspaces/:workspaceId/teamspace-settings`
- `PUT /workspaces/:workspaceId/default-teamspaces`
- `GET /workspaces/:workspaceId/teamspaces`
- `POST /workspaces/:workspaceId/teamspaces`

List query parameters: `status`, `access`, `ownerId`, `ownerless`, `membership`, `search`, `cursor`, `limit`, `sort`.

### 7.2 Teamspace endpoints

- `GET /workspaces/:workspaceId/teamspaces/:teamspaceId`
- `PATCH /workspaces/:workspaceId/teamspaces/:teamspaceId`
- `POST .../:teamspaceId/join`
- `POST .../:teamspaceId/leave`
- `POST .../:teamspaceId/archive`
- `POST .../:teamspaceId/restore`
- `POST .../:teamspaceId/claim-ownership`
- `GET .../:teamspaceId/principals`
- `POST .../:teamspaceId/principals`
- `PATCH .../:teamspaceId/principals/:principalId`
- `DELETE .../:teamspaceId/principals/:principalId`
- `POST .../:teamspaceId/invite-link/rotate`
- `DELETE .../:teamspaceId/invite-link`
- `POST /teamspace-invitations/:token/accept`

Private-resource lookups return 404 to unauthorized non-members to avoid existence disclosure. Mutations use strict Zod schemas, workspace/teamspace consistency checks, transaction-level row locking, and conflict responses for stale/last-owner/default constraints.

### 7.3 Content endpoints

- Extend page/database create payloads with optional `teamspaceId`.
- Add a single move endpoint that accepts destination type (`private`, `teamspace`, or parent item), validates scope, and updates the entire subtree atomically.
- Add `POST /pages/:pageId/convert-to-teamspace`.
- Return `teamspaceId`, effective teamspace role, and inherited-access summary in page/navigation payloads.

### 7.4 Membership lifecycle hooks

- On workspace membership grant, add defaults in the same transaction.
- On workspace member removal/temporary expiry, authorization immediately ignores teamspace principal rows and cleanup removes them.
- On sharing-group membership changes, effective teamspace access updates without materializing duplicate user rows.
- On guest promotion, add defaults after workspace membership is successfully granted.

### 7.5 Audit event names

At minimum:

- `teamspace.created`, `teamspace.updated`, `teamspace.archived`, `teamspace.restored`
- `teamspace.access_changed`, `teamspace.security_changed`
- `teamspace.principal_added`, `teamspace.principal_removed`, `teamspace.role_changed`
- `teamspace.joined`, `teamspace.left`, `teamspace.ownership_claimed`
- `teamspace.defaults_changed`, `teamspace.creation_policy_changed`
- `teamspace.invite_link_enabled`, `teamspace.invite_link_rotated`, `teamspace.invite_link_disabled`
- `page.teamspace_changed`, `page.converted_to_teamspace`

Never record raw invite tokens or sensitive page content.

## 8. Client architecture and UI work

### 8.1 Feature package

Add `packages/features/src/teamspaces/`:

- Types and normalized DTOs.
- Query keys/options for list, detail, principals, browse, and workspace policy.
- Hooks for create/update/join/leave/archive/restore/defaults/principals/invite link/move/convert.
- Narrow invalidation helpers covering teamspace queries, page navigation, access summaries, and session/workspace queries where necessary.

### 8.2 Settings pages

- Refactor `pages/settings/team.tsx` into a small tab shell plus `team-tab.tsx` and `guests-tab.tsx`; move existing sections with minimal logic change first.
- Add `pages/settings/teamspaces.tsx` for workspace administration.
- Add `teamspace-settings-dialog.tsx` and four tab components.
- Register the route in `router.tsx` and dialog resolver in `app-layout.tsx`.
- Add `Teamspaces` to `settings-sidebar.tsx`, positioned with other workspace administration sections.

### 8.3 Sidebar/navigation

- Replace `SidebarPageSections.teamspacePages` with a structure containing `privatePages`, `sharedPages`, and an ordered array of `{ teamspace, pages }`.
- Rename the current `isTeamspace` page field to `isShared` before adding true `teamspaceId`.
- Render joined/default teamspaces individually in `app-sidebar.tsx`.
- Add Browse, create page, settings, members, join/leave, archive actions.
- Extend expansion storage keys with the teamspace ID.
- Update drag/drop and Move menus to call the centralized move endpoint.

### 8.4 Share and page UI

- Show inherited teamspace access separately from explicit page rules.
- Explain when a user cannot remove inherited access at the page level.
- Hide/disable guest, publish, and export actions when the teamspace ceiling denies them, while still enforcing denial server-side.
- Add teamspace context to page breadcrumbs/header and move destination picker.

### 8.5 Responsive and accessible behavior

- Settings tables become cards on narrow screens.
- All tab lists and filter rows scroll horizontally without clipping actions.
- Dialogs trap focus and return focus to their trigger.
- Menus expose disabled reasons.
- Confirmations name the teamspace and affected member/page counts.
- Use live regions/toasts for async completion and inline errors for form failures.

## 9. Migration and backward compatibility

### 9.1 Safe rollout sequence

1. Ship additive tables/columns and dual-read capability behind a `teamspaces` feature flag.
2. Create one empty default teamspace (recommended name: `General`) for each existing workspace; add active workspace members with `default` source and preserve owners.
3. Do **not** automatically move current shared roots into that teamspace. Doing so with a baseline permission could expose pages to more members than their current explicit rules allow.
4. Rename existing `isTeamspace` output/use to `isShared`, retaining a temporary compatibility alias for one release if external clients consume it.
5. Keep existing Private and Shared sections while teamspaces are enabled. Pages move only through an explicit user/admin action.
6. New workspaces create their initial default teamspace in the workspace-creation transaction.
7. Enable writes for internal users, then all deployments, then remove the compatibility alias after telemetry confirms no old clients remain.

### 9.2 Migration invariants

- No page ID, database ID, URL, content, Yjs document, comment, favorite, visit, or explicit access rule changes during backfill.
- Every workspace has at least one active default teamspace.
- Every teamspace has at least one resolvable owner after normal creation.
- No teamspace principal references a user/group outside the workspace.
- No page subtree spans multiple teamspace scopes.
- Re-running backfill is idempotent.
- Migration has a down path that removes new empty/backfilled structures without touching existing content.

### 9.3 Repair/diagnostic command

Add a read-only checker and an explicit repair mode for:

- Missing default teamspace.
- Ownerless teamspace.
- Invalid cross-workspace principal.
- Scope drift inside a page subtree.
- Archived default teamspace.
- Invite-link hash collision or enabled link without token.

## 10. Test plan

### 10.1 Unit/service tests

- Access matrix for workspace roles, teamspace roles, sharing groups, modes, archived state, page rules, guests, and public access.
- Last-owner, default-teamspace, source-aware removal, self-join, leave, and claim-ownership invariants.
- Create, update, archive, restore, move, and convert transactions.
- Cross-workspace ID rejection and private-teamspace non-disclosure.
- Temporary-member expiry and guest-promotion behavior.
- Security ceiling enforcement for guest invites, publish, and export.
- Scope propagation and rollback for deep page trees.

### 10.2 API tests

- 401/403/404/409 distinctions for every endpoint.
- Strict payload parsing, pagination, filtering, sorting, and idempotent retries.
- Concurrent owner removal/default update/archive operations.
- Invite-link enable/rotate/revoke/accept and token secrecy.
- API keys cannot cross workspaces or bypass teamspace access.

### 10.3 Web tests

- Team/Guests tab deep links, counts, permissions, loading, errors, and mobile layout.
- Settings sidebar route and teamspace management filters/actions.
- Sidebar section grouping, Browse/Join/Leave, persistence, and empty states.
- Create/move/convert/archive/restore UI flows.
- Share dialog inherited-access explanations and security-disabled actions.
- Navigation model tests for mixed Private, Shared, teamspace, database, meeting, favorite, and recent items.

### 10.4 Realtime and integration tests

- Page and database collaboration tickets follow new access immediately after join, removal, archive, guest disable, or temporary expiry.
- Cloud-adapter room access matches server access decisions.
- Search, AI page tools, recents, favorites, publishing, exports, imports, and database rows do not leak inaccessible content.
- Self-hosted migration/upgrade tests and Enterprise audit-event tests.

### 10.5 End-to-end role scenarios

Cover workspace owner, admin, member, temporary member, page guest, teamspace owner, teamspace member, group member, and non-member across open/closed/private teamspaces.

## 11. Delivery phases

### Phase 1: Team/Guests separation

- Refactor the current Team settings into URL-backed tabs.
- Preserve all behavior and add focused web tests.
- This phase can ship independently.

### Phase 2: Teamspace domain foundation

- Add schema, migrations, service/policy layer, DTOs, feature flag, default-teamspace backfill, audit hooks, and repair checker.
- Add access-matrix tests before enabling UI writes.

### Phase 3: Core teamspaces

- Create/list/detail/update.
- Direct user owner/member roles.
- Open/closed/private discovery and join/leave.
- Page creation/move and per-teamspace sidebar sections.
- Workspace Teamspaces settings page and per-teamspace General/Members/Permissions tabs.

### Phase 4: Lifecycle and security

- Archive/restore, ownerless recovery, defaults, creation policy, invite links.
- Guest/public/export ceilings.
- Convert page to teamspace.
- Realtime/search/AI/public API integration hardening.

### Phase 5: Full parity and polish

- Sharing-group principals and optional custom principal overrides.
- Advanced filters and bulk administration.
- Mobile polish, accessibility audit, performance/load checks, documentation, and compatibility-alias removal.

Each phase must be deployable with old clients still functioning. Do not enable teamspace creation until the access resolver, navigation filtering, collaboration tickets, guest/public restrictions, and migration invariants are all covered by tests.

## 12. Acceptance criteria

The feature is complete when:

- Team and guest administration are separate, deep-linkable tabs with unchanged existing capabilities.
- Every new workspace has an initial default teamspace; existing workspaces receive one without broadening page access.
- Authorized users can create open/closed/private teamspaces and manage General, Members, Permissions, and Security.
- Default membership applies to current and future active workspace members.
- Users can browse/join/leave according to access mode and cannot discover unauthorized private teamspaces.
- Sidebar content is grouped by actual teamspace; legacy explicit shares remain in Shared.
- Pages/databases can be created in or moved between permitted scopes without losing IDs/content/history.
- Eligible pages can be converted into teamspaces safely.
- Archive/restore and ownerless recovery work without permanent deletion.
- Guests, publishing, export, realtime collaboration, search, AI, API keys, and standalone databases all honor teamspace policy.
- No route relies only on client-side hiding for authorization.
- Migrations, rollback, repair checks, unit/API/web/E2E tests, self-hosted upgrade tests, and user documentation are complete.

## 13. Decisions to confirm before implementation

Recommended defaults are included so implementation can proceed without blocking, but product should confirm them during Phase 2:

1. Team-tab labels: use **Team** and **Guests** as requested, rather than Members and Guests.
2. Initial teamspace name: `General` for all workspaces, rather than deriving `<workspace name> HQ`.
3. Feature availability: ship all access modes in community; keep only custom per-principal overrides and advanced audit/reporting capability-gated.
4. Open teamspaces: require explicit `Join`; do not grant view access merely by browsing.
5. Default removal: preserve explicit members/owners and remove only automatically added membership.
6. Admin authority: workspace admins can create and list discoverable teamspaces, but workspace-wide defaults, private-teamspace override, ownership claims, and global creation policy remain owner-only.
7. Archived direct links: show an archived state only to authorized owners; return not found to other users.

## 14. Documentation updates

- Update `Team and invitations` with the Team/Guests tab split.
- Add `Intro to teamspaces`, `Manage teamspaces`, and `Teamspace permissions and security` pages to the docs site.
- Update sharing docs to explain inherited teamspace access versus explicit page access.
- Update sidebar, workspace, self-hosting upgrade, API, and Enterprise audit documentation.
- Add a migration note explaining that existing Shared pages are intentionally not auto-moved.
