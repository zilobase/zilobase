export function register({ assert, loadModule, readSource, test }) {
  test("page edit bridge closes on offline, errors, denial, and startup expiry", async () => {
    const { canEditPageDuringConnection } = await loadModule(
      "/src/features/editor/collaboration/collaboration-readiness.ts",
    );
    const connecting = {
      online: true,
      error: null,
      cacheError: null,
      blocked: false,
      startupAllowed: true,
      status: "connecting",
      synced: false,
    };
    assert.equal(canEditPageDuringConnection(connecting), true);
    assert.equal(canEditPageDuringConnection({ ...connecting, online: false }), false);
    assert.equal(canEditPageDuringConnection({ ...connecting, error: "ticket failed" }), false);
    assert.equal(
      canEditPageDuringConnection({ ...connecting, cacheError: new Error("disk") }),
      false,
    );
    assert.equal(canEditPageDuringConnection({ ...connecting, blocked: true }), false);
    assert.equal(canEditPageDuringConnection({ ...connecting, startupAllowed: false }), false);
    assert.equal(
      canEditPageDuringConnection({
        ...connecting,
        startupAllowed: false,
        status: "connected",
        synced: true,
      }),
      true,
    );
    assert.equal(
      canEditPageDuringConnection({
        ...connecting,
        startupAllowed: false,
        status: "disconnected",
        synced: true,
      }),
      false,
    );
  });
}
