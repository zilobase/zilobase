# Teamspaces

## Owning modules and interface

- [apps/server/src/features/teamspaces](../../../apps/server/src/features/teamspaces)
- [apps/web/src/features/teamspaces](../../../apps/web/src/features/teamspaces)
- [packages/features/src/teamspaces](../../../packages/features/src/teamspaces)

## Main flow

[Teamspace membership](../../../apps/server/src/features/teamspaces/teamspace-membership.ts) owns default membership and principal removal through the existing TeamspaceService interface. Teamspace management owns organization of workspace content; policy, security and integrity modules resolve visibility and membership constraints. The [directory screen](../../../apps/web/src/features/teamspaces/screens/teamspaces.tsx) presents teamspaces through [directory state](../../../apps/web/src/features/teamspaces/commands/use-teamspace-directory.ts), which owns search selection, invitation handling, filters and batch archive coordination. Workspace-wide membership lives in [workspaces](../workspaces/README.md), separate from teamspace principals.

The [creation entrypoint](../../../apps/web/src/features/teamspaces/creation/index.ts) is shared by settings and Library; one dialog owns draft validation and mutation feedback while preserving each caller’s input IDs. [Management commands](../../../apps/web/src/features/teamspaces/commands/use-teamspace-management.ts) own member candidates, principal mutation payloads, icon updates and invite-link feedback. The [management dialog](../../../apps/web/src/features/teamspaces/components/manage-teamspace-dialog.tsx) presents general, members, permissions and security controls. Changing the selected teamspace/tab retains the existing keyed dialog lifecycle.

## Authorization and persistence

Teamspaces, principals and team membership live in Postgres. Security policy controls public sharing, guests and export on associated pages/databases. Content operations must resolve policy for the content being accessed. Teamspace creation, settings, defaults, invite links, and principal assignments decode JSON bodies with Schema (`onExcessProperty: "error"`). [Route tests](../../../apps/server/src/features/teamspaces/routes.test.ts) cover strict validation and payload errors.

## Server management interface

[Management](../../../apps/server/src/features/teamspaces/management.ts) shares its visibility loader between reads and management checks. Settings, archive and restore use one private transaction operation that updates the teamspace in a transaction, then leaves operation-specific auditing to the caller. Restore retains its unique-name conflict mapping; join retains its own policy.

## Side effects, failures and recovery

Management changes can affect content ownership and navigation. Batch archive runs sequentially, stops on the first failure, and clears selection only after every selected archive succeeds. Invite acceptance requires a matching active workspace and guards pending/success states. Existing principals are excluded from member/group candidates. Invite links retain the workspace and token query parameters. Integrity checks protect associations; preserve transaction and authorization behavior when reorganizing management implementation.

## Verification and change points

[Management command tests](../../../apps/web/test/features/teamspaces/management-commands.test.mjs) cover candidate filtering, principal requests and archive ordering/failure with controlled adapters; [creation tests](../../../apps/web/test/features/teamspaces/teamspace-creation.test.mjs) cover required fields and trimming. Start with [the existing tests or model](../../../apps/server/src/features/teamspaces/integrity.test.ts) and the adjacent tests in the owning modules. Exercise observable outcomes through the owning interface; a source assertion alone does not establish runtime behavior. Run the affected workspace scripts described in [testing and quality](../../setup/testing-and-quality.md).

Update this guide when ownership, interfaces, authorization, persistence or cross-module flows change. [Architecture index](../../README.md).
