export const DATABASE_PAGE_DRAG_MIME = "application/x-notelab-database-page"
export const databaseColumnMinWidth = 180
export const databaseNameColumnDefaultWidth = 220
export const databaseAddPropertyColumnDefaultWidth = 180

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
