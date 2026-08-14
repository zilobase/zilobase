export function register({ assert, loadModule, test }) {
  test("auth return paths reject external redirects", async () => {
    const { getAuthReturnPath, getInvitationAuthSearch } = await loadModule("/src/lib/google-auth.ts")

    assert.equal(
      getAuthReturnPath(
        "/recents",
        "?returnTo=%2Fdesktop-auth%3Fpath%3D%252Fonboarding",
      ),
      "/recents",
    )
    assert.equal(
      getAuthReturnPath("/recents", "?returnTo=https%3A%2F%2Fevil.test"),
      "/recents",
    )
    assert.equal(
      getAuthReturnPath("/recents", "?returnTo=%2F%2Fevil.test"),
      "/recents",
    )
    assert.equal(
      getAuthReturnPath(
        "/recents",
        "?returnTo=https%3A%2F%2Fapi.zilobase.test%2Fdesktop%2Fauthorize%3Fstate%3Dsafe",
      ),
      "https://api.zilobase.test/desktop/authorize?state=safe",
    )
    assert.equal(
      getAuthReturnPath(
        "/recents",
        "?returnTo=https%3A%2F%2Fapi.zilobase.test%2Fother",
      ),
      "/recents",
    )
    assert.equal(
      getAuthReturnPath(
        "/recents",
        "?returnTo=https%3A%2F%2Fuser%40api.zilobase.test%2Fdesktop%2Fauthorize",
      ),
      "/recents",
    )

    const originalWindow = globalThis.window
    globalThis.window = { location: { origin: "https://app.zilobase.test", search: "" } }
    try {
      assert.deepEqual(
        getInvitationAuthSearch(
          "?returnTo=%2Faccept-invitation%3Fid%3Dinvite-1",
        ),
        {
          invitation: "invite-1",
          returnTo: "/accept-invitation?id=invite-1",
        },
      )
      assert.deepEqual(
        getInvitationAuthSearch(
          "?returnTo=https%3A%2F%2Fevil.test%2Faccept-invitation%3Fid%3Dstolen",
        ),
        {},
      )
      assert.deepEqual(
        getInvitationAuthSearch("?invitation=one&invitation=two"),
        {},
      )
    } finally {
      globalThis.window = originalWindow
    }
  })
}
