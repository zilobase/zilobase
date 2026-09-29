export function register({ assert, loadModule, readSource, test }) {
  test("page collaboration acquires one cached document before connecting", async () => {
    const source = await readSource("/src/features/editor/collaboration/use-page-collaboration.ts");

    assert.match(source, /await acquirePageDocument\(user\.id, pageId\)/);
    assert.match(source, /if \(!next\.hasPersistedState\)/);
    assert.match(source, /setEntry\(next\)/);
    assert.doesNotMatch(source, /new Y\.Doc\(/);
  });

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
