export function register({ assert, readSource, test }) {
  test("mail filter drafts preview without persistence and expose explicit save actions", async () => {
    const [editor, page, viewsHook, queryHook] = await Promise.all([
      readSource("/src/features/mail/components/mail-filter-editor.tsx"),
      readSource("/src/features/mail/pages/mail.tsx"),
      readSource("/src/features/mail/model/use-mail-views.ts"),
      readSource("/src/features/mail/model/use-indexed-mail-view.ts"),
    ])

    assert.match(page, /const \[draftFilter, setDraftFilter\]/)
    assert.match(page, /filter: activePersistedView && effectiveFilter/)
    assert.match(page, /onSave=\{\(\) => void saveFilters\(\)\}/)
    assert.match(page, /saveFiltersAsNewView/)
    assert.match(editor, /Unsaved filter/)
    assert.match(editor, /Save filters/)
    assert.match(editor, /Save as new view/)
    assert.match(editor, /maxMailFilterDepth/)
    assert.match(editor, /maxMailFilterConditions/)
    assert.match(editor, /DatabaseConditionEditor/)
    assert.match(editor, /DatabaseSearchableMenuItems/)
    assert.match(viewsHook, /method: "PATCH"/)
    assert.match(viewsHook, /method: "POST"/)
    assert.match(queryHook, /filter: input\.filter/)
  })

  test("mail filter picker exposes quick and searchable full catalogs", async () => {
    const editor = await readSource("/src/features/mail/components/mail-filter-editor.tsx")

    assert.match(editor, /mailQuickFilterCatalog\.map/)
    assert.match(editor, /More filters/)
    assert.match(editor, /Search all mail filters/)
    assert.match(editor, /mailSystemPropertyCatalog/)
  })
}
