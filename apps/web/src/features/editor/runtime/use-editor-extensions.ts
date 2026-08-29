import { useMemo, useState } from "react"
import type { Content, Extensions } from "@tiptap/core"
import type { TableOfContentDataItem } from "@tiptap/extension-table-of-contents"
import { normalizeEditorContent } from "./create-base-extensions"
import { createBaseExtensions } from "./create-base-extensions"
import type { UseEditorExtensionsOptions } from "../core/types"

export type { UseEditorExtensionsOptions }

export const useEditorExtensions = ({
  collaboration,
  collaborationField,
  content,
  createEditorDatabase,
  createEditorMeeting,
  databaseEditorRuntime,
  editable,
  structuralEditingEnabled,
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
        collaborationField,
        createEditorDatabase,
        createEditorMeeting,
        databaseEditorRuntime,
        editable,
        structuralEditingEnabled,
        onCreatePage,
        onEmbedPage,
        onOpenPage,
        onTocUpdate: setTocItems,
        workspaceId,
        pageId,
      }),
    [
      createEditorDatabase,
      createEditorMeeting,
      collaboration,
      collaborationField,
      databaseEditorRuntime,
      editable,
      structuralEditingEnabled,
      onCreatePage,
      onEmbedPage,
      onOpenPage,
      workspaceId,
      pageId,
    ],
  )

  // Tiptap's Collaboration extension binds to one Y.XmlFragment when the
  // editor is created. Recreate the editor when a meeting switches between
  // notes, summary, and transcript, and when realtime presence becomes ready.
  // Extensions are fixed at creation, so an editor created before its provider
  // exists otherwise never installs CollaborationCaret.
  const collaborationPresenceKey =
    collaboration?.provider && collaboration.user ? "presence" : "content-only"
  const editorLifecycleKey = collaboration
    ? `${pageId ?? "collaboration"}:${collaborationField ?? "default"}:${collaborationPresenceKey}`
    : pageId ?? "draft"
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
