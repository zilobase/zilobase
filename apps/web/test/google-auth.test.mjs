export function register({ assert, loadModule, test }) {
  test("auth return paths reject external redirects", async () => {
    const { getAuthReturnPath } = await loadModule("/src/lib/google-auth.ts")

    assert.equal(
      getAuthReturnPath("/dashboard", "?returnTo=%2Fdesktop-auth%3Fpath%3D%252Fonboarding"),
      "/dashboard",
    )
    assert.equal(
      getAuthReturnPath("/dashboard", "?returnTo=https%3A%2F%2Fevil.test"),
      "/dashboard",
    )
    assert.equal(
      getAuthReturnPath("/dashboard", "?returnTo=%2F%2Fevil.test"),
      "/dashboard",
    )
  })
}
