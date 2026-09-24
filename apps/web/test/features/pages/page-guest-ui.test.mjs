import { readFile } from "node:fs/promises";

export function register({ readSource, assert, loadModule, test }) {
  test("invitation links require exactly one non-empty id", async () => {
    const { readSingleInvitationId } = await loadModule(
      "/src/features/workspaces/invitations/invitation-link.ts",
    );

    assert.equal(readSingleInvitationId("?id=page-invite-1"), "page-invite-1");
    assert.equal(readSingleInvitationId("?id=%20"), null);
    assert.equal(readSingleInvitationId("?id=one&id=two"), null);
    assert.equal(readSingleInvitationId(""), null);
  });

  test("page guest UI keeps invitation, management, and shell concerns separate", async () => {
    const [acceptance, shareMenu, teamSettings, pageShell, sharedHeader] = await Promise.all([
      readSource("/src/features/pages/screens/accept-page-invitation.tsx"),
      Promise.all([
        readSource("/src/features/sidebar/components/item-share-dropdown.tsx"),
        readSource("/src/features/sidebar/commands/use-item-sharing.ts"),
      ]).then((parts) => parts.join("\n")),
      Promise.all([
        readSource("/src/features/workspaces/screens/workspace-members.tsx"),
        readSource("/src/features/workspaces/guests/components/workspace-guests.tsx"),
      ]).then((parts) => parts.join("\n")),
      readSource("/src/features/pages/screens/page.tsx"),
      readSource("/src/features/pages/publication/shared-page-header.tsx"),
    ]);

    assert.match(acceptance, /useAcceptPageGuestInvitation/);
    assert.match(acceptance, /to="\/p\/\$pageId"/);
    assert.match(shareMenu, /Invite a page guest/);
    assert.match(shareMenu, /value="comment">Comment/);
    assert.match(shareMenu, /Pending owner approval/);
    assert.match(shareMenu, /useRevokePageGuest/);
    assert.match(teamSettings, /Page guests/);
    assert.match(teamSettings, /useRevokeWorkspaceGuest/);
    assert.match(teamSettings, /Require owner approval/);
    assert.match(teamSettings, /Convert to member/);
    assert.match(pageShell, /publishedShare === "guest"/);
    assert.match(sharedHeader, /<Badge variant="outline">Guest<\/Badge>/);
  });
}
