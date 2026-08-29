export function register({ assert, loadModule, test }) {
  test("desktop diagnostics serialize only approved non-secret fields", async () => {
    const { formatDesktopDiagnostic } = await loadModule(
      "/src/lib/desktop-diagnostics.ts",
    )
    const message = formatDesktopDiagnostic("keyring.initialization", {
      duration_ms: 42.4,
      email: "person@example.com",
      owner: "account-1",
      password: "password",
      status: "success",
      token: "secret-token",
      token_present: true,
      url: "zilobase://auth?token=secret-token",
    })

    assert.equal(
      message,
      "[diagnostics] event=keyring.initialization duration_ms=42 status=success token_present=true",
    )
    assert.equal(message.includes("secret"), false)
    assert.equal(message.includes("example.com"), false)
  })

  test("desktop diagnostics reject unsafe event and error names", async () => {
    const { formatDesktopDiagnostic } = await loadModule(
      "/src/lib/desktop-diagnostics.ts",
    )

    assert.equal(formatDesktopDiagnostic("bad event", { status: "success" }), null)
    assert.equal(
      formatDesktopDiagnostic("renderer.failure", {
        error_type: "Error token=secret",
        status: "error",
      }),
      "[diagnostics] event=renderer.failure status=error",
    )
  })
}
