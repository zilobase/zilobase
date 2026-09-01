export function register({ assert, readSource, test }) {
  test("database sync shows processing state and locks an active destination", async () => {
    const panel = await readSource("/src/features/mail/components/mail-database-sync-panel.tsx")
    assert.match(panel, /database-sync-status/)
    assert.match(panel, /refetchInterval: 15_000/)
    assert.match(panel, /synced} synced/)
    assert.match(panel, /pending} pending/)
    assert.match(panel, /paused/)
    assert.match(panel, /config\.databaseSync\.enabled/)
  })

  test("mail page supplies the persisted view identity to sync status", async () => {
    const page = await readSource("/src/features/mail/pages/mail.tsx")
    assert.match(page, /viewId=\{activePersistedView\.id\}/)
  })
}
