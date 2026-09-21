export function register({ assert, loadModule, readSource, test }) {
  const load = () =>
    loadModule(
      "/src/features/editor/collaboration/collaboration-readiness.ts",
    )

  test("page editing waits for the collaboration provider's initial sync", async () => {
    const { isPageCollaborationReady } = await load()
    const ready = {
      document: {},
      error: null,
      provider: {},
      synced: true,
    }

    assert.equal(isPageCollaborationReady(ready), true)
    assert.equal(isPageCollaborationReady({ ...ready, document: null }), false)
    assert.equal(isPageCollaborationReady({ ...ready, provider: null }), false)
    assert.equal(isPageCollaborationReady({ ...ready, synced: false }), false)
    assert.equal(isPageCollaborationReady({ ...ready, error: "failed" }), false)
  })

  test("reload protection follows unacknowledged collaboration changes", async () => {
    const { hasPendingCollaborationChanges } = await load()

    assert.equal(hasPendingCollaborationChanges(undefined), false)
    assert.equal(hasPendingCollaborationChanges({ unsyncedChanges: 0 }), false)
    assert.equal(hasPendingCollaborationChanges({ unsyncedChanges: 1 }), true)
  })

  test("page composition gates all editing and reruns recovery at sync readiness", async () => {
    const [editor, pane] = await Promise.all([
      readSource("/src/features/editor/composition/editor.tsx"),
      readSource("/src/features/pages/pane/page-editor-pane.tsx"),
    ])

    assert.match(pane, /isPageCollaborationReady\(collaboration\)/)
    assert.match(
      pane,
      /databaseEditable=\{databaseEditingReady && liveEditingReady\}/,
    )
    assert.match(
      pane,
      /getEditorHandle,[\s\S]*liveEditingReady,[\s\S]*navigation/,
    )
    assert.match(editor, /window\.addEventListener\("beforeunload"/)
    assert.match(editor, /hasPendingCollaborationChanges\(collaboration\)/)
  })
}
