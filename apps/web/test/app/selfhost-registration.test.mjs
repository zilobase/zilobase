export function register({ readSource, assert, test }) {
  test("invitation signup survives account creation and email verification", async () => {
    const [signup, otp, invitationPage, provider] = await Promise.all([
      readSource("/src/components/signup-form.tsx"),
      readSource("/src/components/otp-form.tsx"),
      readSource("/src/pages/accept-invitation.tsx"),
      readSource("/src/providers/features-provider.tsx"),
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
    const teamSettings = await readSource("/src/pages/settings/team.tsx")

    assert.match(teamSettings, /member\.role === "owner"/)
    assert.match(teamSettings, /\/api\/instance\/settings/)
    assert.match(teamSettings, /value="invite-only"/)
    assert.match(teamSettings, /value="open"/)
  })
}
