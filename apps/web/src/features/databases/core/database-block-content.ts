export function createDatabaseSetupBlockContent(databaseId: string) {
  return [
    {
      type: "databaseBlock",
      attrs: {
        databaseId,
        setupMode: true,
        showTitle: true,
      },
    },
    { type: "paragraph" },
  ]
}
