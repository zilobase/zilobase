import { readFile } from "node:fs/promises"

export function register({ assert, test }) {
  test("invitation signup survives account creation and email verification", async () => {
    const [signup, otp, invitationPage, provider] = await Promise.all([
      readFile(new URL("../src/components/signup-form.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/components/otp-form.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/pages/accept-invitation.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/providers/features-provider.tsx", import.meta.url), "utf8"),
    ])

    assert.match(signup, /getInvitationAuthSearch\(\)/)
    assert.match(signup, /invitationId \? \{ invitationId \} : \{\}/)
    assert.match(signup, /purpose: "email-verification", returnTo/)
    assert.match(signup, /signInWithGoogle\(returnTo, invitationId\)/)
    assert.match(otp, /window\.location\.assign\(returnTo\)/)
    assert.match(invitationPage, /to="\/signup"/)
    assert.match(provider, /input\.callbackURL \?\?/)
  })

  test("self-hosted registration settings are owner-facing", async () => {
    const teamSettings = await readFile(
      new URL("../src/pages/settings/team.tsx", import.meta.url),
      "utf8",
    )

    assert.match(teamSettings, /member\.role === "owner"/)
    assert.match(teamSettings, /\/api\/instance\/settings/)
    assert.match(teamSettings, /value="invite-only"/)
    assert.match(teamSettings, /value="open"/)
  })
}
