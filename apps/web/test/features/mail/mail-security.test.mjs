export function register({ assert, loadModule, readSource, readWorkspace, test }) {
  test("mail attachment filenames cannot escape the browser download boundary", async () => {
    const { safeMailDownloadFilename } = await loadModule("/src/features/mail/model/mail-attachment.ts")
    assert.equal(safeMailDownloadFilename("../../invoice\r\n.html"), "_.._invoice__.html")
    assert.equal(safeMailDownloadFilename(""), "attachment")
    assert.equal(safeMailDownloadFilename("a".repeat(300)).length, 180)
  })

  test("mail responses and OAuth result pages use strict cache, referrer, and CSP controls", async () => {
    const routes = await readWorkspace("/apps/server/src/features/mail/routes.ts")
    assert.match(routes, /Cache-Control[^\n]*private, no-store, max-age=0/)
    assert.match(routes, /Referrer-Policy[^\n]*no-referrer/)
    assert.match(routes, /Content-Security-Policy[^\n]*default-src 'none'/)
    assert.match(routes, /content-disposition[^\n]*attachment/)
  })

  test("disconnect, logout, and desktop replacement all close mail caches before deletion", async () => {
    const [mailPage, offlineStore, mailDatabase] = await Promise.all([
      readSource("/src/features/mail/pages/mail.tsx"),
      readSource("/src/features/offline/model/offline-store.ts"),
      readSource("/src/features/mail/cache/mail-database.ts"),
    ])
    assert.match(mailPage, /method: "DELETE"/)
    assert.match(mailPage, /destroyMailDatabase/)
    assert.match(offlineStore, /clearAllOfflineData[^]*deleteIndexedDatabasesForPrefix/)
    assert.match(offlineStore, /prepareMailDatabasesForDeletion/)
    assert.match(mailDatabase, /BroadcastChannel/)
  })
}
