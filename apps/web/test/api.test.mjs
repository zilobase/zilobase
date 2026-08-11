export function register({ assert, loadModule, test }) {
  test("desktop builds use the hosted API", async () => {
    const { resolveApiBaseUrl } = await loadModule("/src/lib/api.ts")

    assert.equal(
      resolveApiBaseUrl(new URL("tauri://localhost/login")),
      "https://api.zilobase.com",
    )
    assert.equal(
      resolveApiBaseUrl(new URL("http://tauri.localhost/login")),
      "https://api.zilobase.com",
    )
  })
}
