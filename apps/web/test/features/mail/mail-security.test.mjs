export function register({ assert, loadModule, readSource, readWorkspace, test }) {
  test("mail attachment filenames cannot escape the browser download boundary", async () => {
    const { safeMailDownloadFilename } = await loadModule("/src/features/mail/messages/mail-attachment.ts")
    assert.equal(safeMailDownloadFilename("../../invoice\r\n.html"), "_.._invoice__.html")
    assert.equal(safeMailDownloadFilename(""), "attachment")
    assert.equal(safeMailDownloadFilename("a".repeat(300)).length, 180)
  })

  test("mail responses and OAuth result pages use strict cache, referrer, and CSP controls", async () => {
    const routes = (await Promise.all([
      "/apps/server/src/features/mail/routes.ts",
      "/apps/server/src/features/mail/connections/routes.ts",
      "/apps/server/src/features/mail/compose/routes.ts",
    ].map(readWorkspace))).join("\n")
    assert.match(routes, /Cache-Control[^\n]*private, no-store, max-age=0/)
    assert.match(routes, /Referrer-Policy[^\n]*no-referrer/)
    assert.match(routes, /Content-Security-Policy[^\n]*default-src 'none'/)
    assert.match(routes, /content-disposition[^\n]*attachment/)
  })

  test("disconnect, logout, and desktop replacement all close mail caches before deletion", async () => {
    const [workspaceSettings, indexedCleanup, mailDatabase, mailController] = await Promise.all([
      readSource("/src/features/workspaces/settings/workspace-mail-connection-state.ts"),
      readSource("/src/platform/storage/indexed-data-cleanup.ts"),
      readSource("/src/features/mail/storage/mail-database.ts"),
      readSource("/src/features/mail/sync/mail-sync-controller.ts"),
    ])
    assert.match(workspaceSettings, /method: "DELETE"/)
    assert.match(workspaceSettings, /destroyMailDatabase/)
    assert.match(indexedCleanup, /prepareMailDatabasesForDeletion/)
    assert.match(indexedCleanup, /prepareCalendarDatabasesForDeletion/)
    assert.match(indexedCleanup, /deleteIndexedDatabasesForPrefix/)
    assert.match(await readSource("/src/app/runtime/desktop-server-replacement.ts"), /clearIndexedDataForServer/)
    assert.match(mailDatabase, /BroadcastChannel/)
    assert.doesNotMatch(mailController, /closeMailDatabase/)
    assert.match(mailController, /cleanup only cancels this React consumer/)
  })
}
