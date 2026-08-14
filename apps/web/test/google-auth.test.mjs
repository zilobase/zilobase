export function register({ assert, loadModule, test }) {
  test("auth return paths reject external redirects", async () => {
    const { getAuthReturnPath } = await loadModule("/src/lib/google-auth.ts")

    assert.equal(
      getAuthReturnPath("/recents", "?returnTo=%2Fdesktop-auth%3Fpath%3D%252Fonboarding"),
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
  })
}
