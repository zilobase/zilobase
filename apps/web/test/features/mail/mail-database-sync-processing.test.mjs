import { readMailFeatureSource } from "./mail-feature-source.mjs"

export function register({ assert, readSource, readWorkspace, test }) {
  test("database sync shows processing state and locks an active destination", async () => {
    const [panel, queries] = await Promise.all([
      readSource("/src/features/mail/components/mail-database-sync-panel.tsx"),
      readWorkspace("/packages/features/src/mail/queries.ts"),
    ])
    assert.match(queries, /database-sync-status/)
    assert.match(queries, /refetchInterval: 15_000/)
    assert.match(panel, /synced} synced/)
    assert.match(panel, /pending} pending/)
    assert.match(panel, /paused/)
    assert.match(panel, /config\.databaseSync\.enabled/)
  })

  test("mail page supplies the persisted view identity to sync status", async () => {
    const page = await readMailFeatureSource(readSource)
    assert.match(page, /viewId=\{activePersistedView\.id\}/)
  })
}
