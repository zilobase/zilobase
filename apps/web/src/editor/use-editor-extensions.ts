import { useMemo, useState } from "react"
import type { Content, Extensions } from "@tiptap/core"
import type { TableOfContentDataItem } from "@tiptap/extension-table-of-contents"
import { normalizeEditorContent } from "./create-base-extensions"
import { createBaseExtensions } from "./create-base-extensions"
import type { UseEditorExtensionsOptions } from "./types"

export type { UseEditorExtensionsOptions }

export const useEditorExtensions = ({
  collaboration,
  content,
  createEditorDatabase,
  databaseEditorRuntime,
  editable,
  onCreatePage,
  onEmbedPage,
  onOpenPage,
  workspaceId,
  pageId,
}: UseEditorExtensionsOptions) => {
  const [tocItems, setTocItems] = useState<TableOfContentDataItem[]>([])

  const editorExtensions = useMemo<Extensions>(
    () =>
      createBaseExtensions({
        collaboration,
        createEditorDatabase,
        databaseEditorRuntime,
        editable,
        onCreatePage,
        onEmbedPage,
        onOpenPage,
        onTocUpdate: setTocItems,
        workspaceId,
        pageId,
      }),
    [
      createEditorDatabase,
      collaboration,
      databaseEditorRuntime,
      editable,
      onCreatePage,
      onEmbedPage,
      onOpenPage,
      workspaceId,
      pageId,
    ],
  )

  const editorLifecycleKey = pageId ?? "draft"
  const initialContent = collaboration
    ? undefined
    : (normalizeEditorContent(content) as Content)

  return {
    editorExtensions,
    editorLifecycleKey,
    initialContent,
    tocItems,
  }
}
