export function register({ assert, readSource, test }) {
  test("AI context uses the explicit database export outside interactive collections", async () => {
    const [context, conversation] = await Promise.all([
      readSource("/src/features/ai/context/use-page-ai-context.ts"),
      readSource("/src/features/ai/conversations/use-conversation-context.ts"),
    ])

    assert.match(context, /databaseContextExportQueryOptions/)
    assert.match(context, /databaseContextExportQueryKey/)
    assert.match(context, /database-context-export/)
    assert.doesNotMatch(context, /databaseQueryOptions/)
    assert.match(conversation, /useDatabaseMetadata\(databaseId\)/)
    assert.doesNotMatch(conversation, /useDatabase\(databaseId\)/)
  })
}
