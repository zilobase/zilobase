import { readFile } from "node:fs/promises";

export function register({ readSource, assert, loadModule, test }) {
  test("invitation links require exactly one non-empty id", async () => {
    const { readSingleInvitationId } = await loadModule(
      "/src/lib/invitation-link.ts",
    );

    assert.equal(readSingleInvitationId("?id=page-invite-1"), "page-invite-1");
    assert.equal(readSingleInvitationId("?id=%20"), null);
    assert.equal(readSingleInvitationId("?id=one&id=two"), null);
    assert.equal(readSingleInvitationId(""), null);
  });

  test("page guest UI keeps invitation, management, and shell concerns separate", async () => {
    const [acceptance, shareMenu, teamSettings, pageShell] = await Promise.all([
      readSource("/src/pages/accept-page-invitation.tsx"),
      readSource("/src/features/sidebar/components/nav-actions.tsx"),
      readSource("/src/pages/settings/team.tsx"),
      readSource("/src/pages/page.tsx"),
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
    assert.match(pageShell, /<Badge variant="outline">Guest<\/Badge>/);
  });
}
