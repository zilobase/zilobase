export const DATABASE_PAGE_DRAG_MIME = "application/x-zilobase-database-page"
export const databaseColumnMinWidth = 180
export const databaseColumnDefaultWidth = 200
export const databaseNameColumnDefaultWidth = databaseColumnDefaultWidth * 1.25
export const databaseAddPropertyColumnDefaultWidth = databaseColumnDefaultWidth

export type DatabaseBlockEditorRuntime = {
  getEditable: () => boolean
  subscribe: (listener: () => void) => () => void
}

export type DatabaseBlockOptions = {
  currentPageId?: string | null
  editable?: boolean
  editorRuntime?: DatabaseBlockEditorRuntime
  onOpenPage?: (
    pageId: string,
    options?: { databaseId?: string | null },
  ) => void
  workspaceId?: string | null
}
