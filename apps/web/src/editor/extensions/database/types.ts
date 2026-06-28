export type DatabaseBlockEditorRuntime = {
  getEditable: () => boolean
  subscribe: (listener: () => void) => () => void
}

export type DatabaseBlockOptions = {
  currentPageId?: string | null
  editable?: boolean
  editorRuntime?: DatabaseBlockEditorRuntime
  onOpenPage?: (pageId: string) => void
  workspaceId?: string | null
}
