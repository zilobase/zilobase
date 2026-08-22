import { readFile } from "node:fs/promises";

export function register({ assert, loadModule, test }) {
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
      readFile(
        new URL("../src/pages/accept-page-invitation.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../src/components/nav-actions.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/pages/settings/team.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/pages/page.tsx", import.meta.url), "utf8"),
    ]);

    assert.match(acceptance, /useAcceptPageGuestInvitation/);
    assert.match(acceptance, /to="\/p\/\$pageId"/);
    assert.match(shareMenu, /Invite a page guest/);
    assert.match(shareMenu, /useRevokePageGuest/);
    assert.match(teamSettings, /Page guests/);
    assert.match(teamSettings, /useRevokeWorkspaceGuest/);
    assert.match(pageShell, /publishedShare === "guest"/);
    assert.match(pageShell, /<Badge variant="outline">Guest<\/Badge>/);
  });
}
