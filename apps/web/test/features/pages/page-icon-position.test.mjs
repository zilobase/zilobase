export function register({ assert, loadModule, readSource, test }) {
  test("pages default icons to the top while preserving explicit inline positions", async () => {
    const { getPageIconPosition } = await loadModule(
      "/packages/features/src/pages/queries.ts",
    )

    assert.equal(getPageIconPosition({ metadata: null }), "top")
    assert.equal(getPageIconPosition({ metadata: {} }), "top")
    assert.equal(
      getPageIconPosition({ metadata: { iconPosition: "top" } }),
      "top",
    )
    assert.equal(
      getPageIconPosition({ metadata: { iconPosition: "inline" } }),
      "inline",
    )
  })

  test("top icons use action-row spacing and database icons stay inline", async () => {
    const [metadataSource, databaseSource, pageEditorSource] = await Promise.all([
      readSource("/src/features/databases/components/page-metadata.tsx"),
      readSource("/src/features/databases/screens/database.tsx"),
      readSource("/src/features/pages/pane/page-editor-pane.tsx"),
    ])

    assert.match(metadataSource, /: "mb-1 w-fit"/)
    assert.match(metadataSource, /relative z-10 mb-1 w-fit/)
    assert.equal(
      metadataSource.match(
        /allowIconPositionChange \? updateIconPosition : undefined/g,
      )?.length,
      2,
    )
    assert.match(databaseSource, /allowIconPositionChange=\{false\}/)
    assert.match(databaseSource, /iconPosition="inline"/)
    assert.doesNotMatch(databaseSource, /onIconPositionChange=/)
    assert.match(
      pageEditorSource,
      /const nextIconPosition = nextEmoji \? iconPosition : "top"/,
    )
    assert.match(pageEditorSource, /iconPosition: nextIconPosition/)
  })
}
