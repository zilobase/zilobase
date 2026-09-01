export function register({ assert, readSource, test }) {
  test("database settings reuse the mail view drawer and lock the destination workspace", async () => {
    const [panel, settings] = await Promise.all([
      readSource("/src/features/mail/components/mail-database-sync-panel.tsx"),
      readSource("/src/features/mail/components/mail-view-settings-menu.tsx"),
    ])
    assert.match(settings, /databaseEditor/)
    assert.match(panel, /Destination workspace/)
    assert.match(panel, /disabled value="Current workspace"/)
    assert.match(panel, /Mail never syncs across workspace boundaries/)
  })

  test("database sync is explicit, confirmed, and records a new-only boundary", async () => {
    const panel = await readSource("/src/features/mail/components/mail-database-sync-panel.tsx")
    assert.match(panel, /Subject → Title is required/)
    assert.match(panel, /Create property/)
    assert.match(panel, /window\.confirm/)
    assert.match(panel, /Enabling records the cutoff now/)
    assert.match(panel, /Existing mail is never backfilled/)
    assert.match(panel, /Create new/)
    assert.match(panel, /Create source/)
  })
}
