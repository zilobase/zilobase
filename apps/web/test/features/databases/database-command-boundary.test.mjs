export function register({ assert, loadModule, sourcePath, test }) {
  test('database derivation has no runtime React, editor or UI dependencies', async () => {
    const { build } = await import('esbuild')
    const result = await build({
      entryPoints: [sourcePath('/src/features/databases/views/model/database-view-model.ts')],
      bundle: true, platform: 'node', format: 'esm', write: false, metafile: true,
    })
    assert.deepEqual(Object.keys(result.metafile.inputs).filter(path =>
      /node_modules\/(react|react-dom|@tiptap)|\/shared\/(ui|components)\//.test(path)
    ), [])
  })

  test('view presentation supplies icons while derivation exposes only field descriptors', async () => {
    const { deriveDatabaseViewModel } = await loadModule('/src/features/databases/views/model/database-view-model.ts')
    const { getDatabaseViewModel } = await loadModule('/src/features/databases/views/components/database-view-model.tsx')
    const input = { activeViewId: null, payload: null }
    const data = deriveDatabaseViewModel(input)
    const view = getDatabaseViewModel(input)
    assert.deepEqual(data.sortFieldOptions[0].fieldIcon, { kind: 'name' })
    assert.equal('icon' in data.sortFieldOptions[0], false)
    assert.equal('fieldIcon' in view.sortFieldOptions[0], false)
    assert.equal(typeof view.sortFieldOptions[0].icon, 'object')
    assert.equal(view.sortFieldOptions[0], view.filterFieldOptions[0])
    assert.equal(view.sortFieldOptions[0].label, data.sortFieldOptions[0].label)
  })

  test('view commands report clipboard outcomes and date-property failure through supplied feedback', async () => {
    const { getDatabaseViewCommands } = await loadModule('/src/features/databases/commands/database-view-commands.ts')
    const events = []
    let dateCallbacks
    const mutation = { isPending: false, mutate() {}, async mutateAsync() {} }
    const input = {
      activeDatabaseFilters: [], activeDatabaseSorts: [], activeView: { id: 'v1', type: 'table', config: {} },
      databaseId: 'source-1', editable: true, isKanbanView: false, items: [], kanbanGroupProperty: null,
      timelineDateProperty: null, properties: [], payload: { database: { config: {} }, properties: [] },
      mutations: { addDatabaseView: mutation, addProperty: { ...mutation, mutate: (_input, callbacks) => { dateCallbacks = callbacks } }, addRow: mutation, updateDatabase: mutation, updateDatabaseView: mutation, updatePage: mutation, updateProperty: mutation, updateValue: mutation },
      setActiveViewId() {}, setFilterPickerOpen() {}, setShowFilterPill() {}, setShowSortPill() {}, setSortPickerOpen() {},
      notify: { success: message => events.push(['success', message]), error: message => events.push(['error', message]) },
      copyViewLink: async id => { events.push(['copy', id]) },
    }
    const commands = getDatabaseViewCommands(input)
    commands.copyDatabaseViewLink()
    await Promise.resolve(); await Promise.resolve()
    assert.deepEqual(events, [['copy', 'source-1'], ['success', 'Copied link to view']])
    getDatabaseViewCommands({ ...input, copyViewLink: async () => { throw new Error('denied') } }).copyDatabaseViewLink()
    await Promise.resolve(); await Promise.resolve()
    assert.deepEqual(events.at(-1), ['error', "Couldn't copy link to view"])
    commands.setupTimelineDateProperty()
    dateCallbacks.onSuccess({ property: { id: 'date-property' } })
    assert.notDeepEqual(events.at(-1), ['error', "Couldn't add date property"])
    dateCallbacks.onError()
    assert.deepEqual(events.at(-1), ['error', "Couldn't add date property"])
  })
}
