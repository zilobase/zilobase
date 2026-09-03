export function register({ assert, readSource, test }) {
  test("database view consumers subscribe to narrow stable contexts", async () => {
    const [context, chart, propertySettings] = await Promise.all([
      readSource("/src/features/databases/views/model/database-view-context.tsx"),
      readSource("/src/features/databases/views/chart/view/database-chart-view.tsx"),
      readSource("/src/features/databases/properties/configuration/index.tsx"),
    ])

    assert.match(context, /const DatabaseDataContext = createContext/)
    assert.match(context, /const DatabaseUiContext = createContext/)
    assert.match(context, /const DatabaseActionsContext = createContext/)
    assert.match(context, /const DatabaseRealtimeContext = createContext/)
    assert.match(context, /useStableContextSlice\(undoableValue, databaseDataKeys\)/)
    assert.match(context, /previous\.current!\[key\] !== value\[key\]/)
    assert.doesNotMatch(context, /const DatabaseViewContext = createContext/)
    assert.doesNotMatch(context, /function useDatabaseViewContext/)

    assert.match(chart, /useDatabaseDataContext/)
    assert.match(chart, /useDatabaseUiContext/)
    assert.doesNotMatch(chart, /useDatabaseActionsContext/)
    assert.match(propertySettings, /useDatabaseActionsContext/)
    assert.doesNotMatch(propertySettings, /useDatabaseDataContext/)
    assert.doesNotMatch(propertySettings, /useDatabaseUiContext/)
  })
}
