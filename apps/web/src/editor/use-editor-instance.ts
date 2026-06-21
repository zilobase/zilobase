import { useEffect, useMemo, useState, type MutableRefObject } from "react"
import { useEditor } from "@tiptap/react"
import type { Content, Editor, Extensions } from "@tiptap/core"
import type { DatabaseBlockEditorRuntime } from "@/packages/editor/extensions/database"
import { registerBlockDragSource } from "@/packages/editor/components/editor/block-drag"
import {
  createEditorDragHandlers,
  createEditorDropHandler,
} from "./editor-drop-handlers"
import { handleProviderLinkPaste, normalizePastedEditorHTML } from "./paste"
import { syncExtensionOptions } from "./sync-extension-options"
import type { BlockDropLine, PasteChoiceState } from "./types"
import { useLatestRef } from "./use-latest-ref"

type UseEditorInstanceOptions = {
  databaseEditorRuntime: DatabaseBlockEditorRuntime
  dropPageOnDatabase: (event: DragEvent) => boolean
  editable: boolean
  editorContentRef?: MutableRefObject<(() => unknown) | null>
  editorExtensions: Extensions
  editorId: string
  editorLifecycleKey: string
  editorRuntimeRef: MutableRefObject<{
    editable: boolean
    listeners: Set<() => void>
  }>
  initialContent: Content | undefined
  onContentChange?: (content: unknown) => void
  onEditorReady?: (editor: Editor | null) => void
  onOpenPage?: (pageId: string) => void
  setPasteChoice: (choice: PasteChoiceState | null) => void
  workspaceId?: string | null
}

export const useEditorInstance = ({
  databaseEditorRuntime,
  dropPageOnDatabase,
  editable,
  editorContentRef,
  editorExtensions,
  editorId,
  editorLifecycleKey,
  editorRuntimeRef,
  initialContent,
  onContentChange,
  onEditorReady,
  onOpenPage,
  setPasteChoice,
  workspaceId,
}: UseEditorInstanceOptions) => {
  const [blockDropLine, setBlockDropLine] = useState<BlockDropLine | null>(null)

  const onContentChangeRef = useLatestRef(onContentChange)
  const dropPageOnDatabaseRef = useLatestRef(dropPageOnDatabase)
  const handleProviderLinkPasteRef = useLatestRef(
    (view: Parameters<typeof handleProviderLinkPaste>[0], event: ClipboardEvent) =>
      handleProviderLinkPaste(view, event, editable, setPasteChoice)
  )

  const editorDropHandler = useMemo(
    () =>
      createEditorDropHandler(
        (event) => dropPageOnDatabaseRef.current(event),
        setBlockDropLine
      ),
    []
  )

  const editorDragHandlers = useMemo(
    () => createEditorDragHandlers(setBlockDropLine),
    []
  )

  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: initialContent,
      editable,
      onUpdate: ({ editor: currentEditor }) => {
        if (editable) onContentChangeRef.current?.(currentEditor.getJSON())
      },
      editorProps: {
        attributes: { class: "tiptap-editor", "aria-label": "Document editor" },
        handleDrop: editorDropHandler,
        handlePaste: (view, event) =>
          handleProviderLinkPasteRef.current(view, event),
        transformPastedHTML: normalizePastedEditorHTML,
        handleDOMEvents: editorDragHandlers,
      },
    },
    [editorLifecycleKey]
  )

  useEffect(() => {
    if (!editorContentRef) return
    editorContentRef.current = editor ? () => editor.getJSON() : null
    return () => {
      editorContentRef.current = null
    }
  }, [editor, editorContentRef])

  useEffect(() => {
    onEditorReady?.(editor ?? null)
    return () => {
      onEditorReady?.(null)
    }
  }, [editor, onEditorReady])

  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.extensionManager) return
    syncExtensionOptions(editor, {
      databaseEditorRuntime,
      editable,
      editorRuntimeRef,
      onOpenPage,
      workspaceId,
    })
  }, [databaseEditorRuntime, editor, editable, editorRuntimeRef, onOpenPage, workspaceId])

  useEffect(() => {
    if (!editor) return
    return registerBlockDragSource(editorId, editor)
  }, [editor, editorId])

  return { blockDropLine, editor }
}