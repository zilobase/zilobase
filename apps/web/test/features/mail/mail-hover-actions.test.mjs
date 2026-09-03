import { readMailFeatureSource } from "./mail-feature-source.mjs"

export function register({ assert, readSource, test }) {
  test("mail hover actions have preview, reorder, hide, remove, and add flows", async () => {
    const [panel, settings, page] = await Promise.all([
      readSource("/src/features/mail/components/mail-hover-actions-panel.tsx"),
      readSource("/src/features/mail/components/mail-view-settings-menu.tsx"),
      readMailFeatureSource(readSource),
    ])

    assert.match(panel, /Preview/)
    assert.match(panel, /Reorder\.Group/)
    assert.match(panel, /Hide hover action/)
    assert.match(panel, /Delete hover action/)
    assert.match(panel, /Add hover action/)
    assert.match(settings, /hoverActionsEditor/)
    assert.match(page, /hoverActions=\{activePersistedView\?\.config\.hoverActions\}/)
    assert.match(page, /hoverActions\.filter\(\(action\) => !action\.hidden\)/)
  })

  test("hover action catalog and specific-label configuration are complete", async () => {
    const panel = await readSource("/src/features/mail/components/mail-hover-actions-panel.tsx")
    for (const kind of ["star", "archive", "bin", "read_unread", "remind", "command", "any_label", "spam", "reply", "specific_label", "unsubscribe"]) {
      assert.match(panel, new RegExp(`${kind}:`), `missing ${kind}`)
    }
    assert.match(panel, /Choose a label/)
    assert.match(panel, /\["star", "bookmark", "heart", "tag"\]/)
    assert.match(panel, /When label is applied/)
    for (const effect of ["Archive", "Bin", "No effect"]) assert.ok(panel.includes(effect))
  })
}
