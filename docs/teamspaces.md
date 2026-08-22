# Teamspaces

Teamspaces are workspace-scoped content areas for departments, projects, and shared knowledge. They are separate from sharing groups: a sharing group can be assigned to a teamspace, but it is not itself a teamspace.

## Administration

Open **Settings -> Teamspaces** to:

- create, search, and filter active teamspaces;
- choose whether all workspace members or only workspace owners may create them;
- join open teamspaces or leave non-default teamspaces;
- set a default teamspace for current and future workspace members;
- manage direct members and sharing groups, including owner/member roles and optional content-access overrides;
- configure member access, invite policy, sidebar-edit policy, guest access, public sharing, and exports;
- create or disable workspace-only invite links;
- bulk archive non-default teamspaces, restore archived teamspaces, and recover ownerless teamspaces.

The Team settings page uses URL-backed **Team** and **Guests** tabs. Workspace membership and page-guest access remain distinct.

## Access model

| Access mode | Workspace discovery | Self-join | Membership required for content |
| --- | --- | --- | --- |
| Open | Yes | Yes | Yes |
| Closed | Yes | No | Yes |
| Private | Principals and workspace owners only | No | Yes |

Teamspace owners receive full access. Members receive the teamspace baseline unless their direct user or sharing-group principal has an override. If several principals apply, the most permissive effective access is used. Page-specific rules may add access only within the teamspace security ceiling: disabling guests or public sharing blocks those routes even when an older page grant still exists.

Default teamspaces cannot be left or archived. Changing defaults preserves explicitly invited principals and owners. Product deletion is soft archive; restore keeps content placement and membership.

## Content behavior

Pages and standalone databases store a `teamspaceId`. Descendants inherit the root content scope, and cross-teamspace parent/child placements are rejected. Authorized users can create content inside a teamspace, move a page tree between scopes, or turn an eligible root page into a new teamspace without changing page IDs or URLs.

The sidebar renders one section per joined/default teamspace. Explicitly shared content outside a teamspace remains in **Shared**. The page navigation payload names this state `isShared`; the former misleading `isTeamspace` alias has been removed.

## HTTP API

Routes are under `/api/workspaces/:workspaceId`:

- `GET/POST /teamspaces`
- `GET/PATCH /teamspaces/:teamspaceId`
- `POST /teamspaces/:teamspaceId/join|leave|archive|restore|recover-owner`
- `GET/POST /teamspaces/:teamspaceId/principals`
- `PATCH/DELETE /teamspaces/:teamspaceId/principals/:principalId`
- `PATCH /teamspaces/:teamspaceId/invite-link`
- `POST /teamspace-invites/accept`
- `GET/PATCH /teamspace-settings`
- `PATCH /teamspace-defaults`
- `POST /pages/:pageId/convert-to-teamspace`
- `PATCH /pages/:pageId/teamspace`

Authorization is enforced by the server. Clients must treat `403` as insufficient authority, `404` as unavailable or undiscoverable, and `409` as a lifecycle or invariant conflict.

## Deployment and verification

Migration `0048_teamspace_foundation.sql` adds the workspace policy, teamspace/principal records, content scope, indexes, constraints, and a default teamspace for existing workspaces. Deploy the migration before the application version.

Recommended smoke test after deployment:

1. Open the Team and Guests settings tabs and verify their URL state.
2. Create open, closed, and private teamspaces with two workspace users.
3. Add a user and a sharing group, change an access override, and verify effective page/database access.
4. Create and move a nested page tree; confirm the sidebar and direct links agree.
5. Disable guest/public sharing and verify existing grants no longer bypass the ceiling.
6. Change the default, archive and restore a non-default teamspace, and recover an ownerless teamspace.

For implementation history and detailed acceptance criteria, see [teamspaces-implementation-plan.md](./teamspaces-implementation-plan.md).
