# Workspaces

## Owning modules and interface

- [apps/server/src/features/workspaces](../../../apps/server/src/features/workspaces)
- [apps/web/src/features/workspaces](../../../apps/web/src/features/workspaces)
- [packages/features/src/workspaces](../../../packages/features/src/workspaces)

## Main flow

Workspace queries and hooks support workspace selection and invitations. The [membership screen](../../../apps/web/src/features/workspaces/screens/workspace-members.tsx) owns the `/settings/team` tabs, with [member commands](../../../apps/web/src/features/workspaces/members/commands) separating invitation/editing state and mutation feedback from member rendering. [Access rules](../../../apps/web/src/features/workspaces/members/model/member-access.ts) preserve temporary-expiration conversion and owner-editing restrictions. [Guest administration](../../../apps/web/src/features/workspaces/guests/components/workspace-guests.tsx) distinguishes page guests from workspace membership and keeps promotion and invitation policy explicit.

The [workspace settings screen](../../../apps/web/src/features/workspaces/screens/workspace-settings.tsx) composes details, import and deletion sections under [settings](../../../apps/web/src/features/workspaces/settings). Form commands own their validation and lifecycle; the [app settings composition](../../../apps/web/src/app/shell/content/workspace-settings.tsx) supplies AI policy presentation for both routes and panes. [Invitation acceptance](../../../apps/web/src/features/workspaces/screens/accept-invitation.tsx) keeps authentication and workspace selection ordering. Pinned instance owners see [registration settings](../../../apps/web/src/features/workspaces/settings/registration-settings.tsx) in membership administration. Server routes integrate the authenticated principal with workspace settings and authorized navigation reads. App providers coordinate active-workspace selection with authentication.

## Authorization and persistence

[Workspace routes](../../../apps/server/src/features/workspaces/routes.ts) expose authenticated `GET /workspaces` as `{ workspaces: [...] }` and `GET /workspaces/:workspaceId` as `{ workspace: ... }`. Lists include only active memberships; detail reads require current membership. OAuth requires `workspaces.read`, lists only the granted workspace and rejects other workspace IDs. API keys use the same workspace pin. Member invitation, member update, workspace settings patch, and deletion confirmation bodies decode JSON with Schema (`onExcessProperty: "error"` for member mutations and delete confirmation). [Route tests](../../../apps/server/src/app/routes.test.ts) cover OAuth filtering, cross-workspace denial, membership revocation, and payload validation.

Workspace and membership records anchor feature ownership. Active-workspace checks and scoped key checks are separate from resource-level access. Workspace settings belong to the settings submodule.

## Side effects, failures and recovery

Workspace changes invalidate navigation and client queries. Invitation links cross authentication and routing. Temporary invitation deadlines use local input converted to ISO; changing to a permanent role clears the submitted deadline. Member removal retains explicit confirmation. Failed settings mutations preserve the draft and expose the server error. Other clients recover hierarchy and membership changes through focus, reopen or explicit authorized reads; there is no navigation ticket/socket flow.

## Verification and change points

[Member command tests](../../../apps/web/test/features/workspaces/member-commands.test.mjs) and [settings command tests](../../../apps/web/test/features/workspaces/settings-commands.test.mjs) exercise actual React hooks with controlled mutations and transport. SSR exercises render state and commands; it does not establish mounted effect timing or browser focus behavior. Start with [the existing tests or model](../../../packages/features/src/workspaces/active-workspace.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
