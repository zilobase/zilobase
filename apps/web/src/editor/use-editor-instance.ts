import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react"
import { useEditor } from "@tiptap/react"
import type { Content, Editor, Extensions } from "@tiptap/core"
import type { DatabaseBlockEditorRuntime } from "@/packages/editor/extensions/database"
import {
  createEditorDragDrop,
  registerBlockDragSource,
} from "@/packages/editor/components/editor/block-drag"
import {
  getDropDatabaseElement,
  insertDraggedDatabasePage,
  isDraggingPageToEditor,
  shouldSkipEditorDropLine,
} from "./database-page-drag"
import {
  handleProviderLinkPaste,
  handleTypedLinkChoice,
  normalizePastedEditorHTML,
} from "./paste"
import { updateExtensionOptions } from "./update-extension-options"
import type { BlockDropLine, PasteChoiceState } from "./types"
import { useLatestRef } from "./use-latest-ref"

type UseEditorInstanceOptions = {
  databaseEditorRuntime: DatabaseBlockEditorRuntime
  dropPageOnDatabase: (event: DragEvent) => boolean
  editable: boolean
  editorContentRef?: MutableRefObject<(() => unknown) | null>
  editorSurfaceRef?: RefObject<HTMLElement | null>
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
  onEmbedPage?: (pageId: string) => void | Promise<void>
  onOpenPage?: (pageId: string) => void
  setPasteChoice: (choice: PasteChoiceState | null) => void
  pageId?: string | null
}

export const useEditorInstance = ({
  databaseEditorRuntime,
  dropPageOnDatabase,
  editable,
  editorContentRef,
  editorSurfaceRef,
  editorExtensions,
  editorId,
  editorLifecycleKey,
  editorRuntimeRef,
  initialContent,
  onContentChange,
  onEditorReady,
  onEmbedPage,
  onOpenPage,
  setPasteChoice,
  pageId,
}: UseEditorInstanceOptions) => {
  const [blockDropLine, setBlockDropLine] = useState<BlockDropLine | null>(null)
  const editorRef = useRef<Editor | null>(null)

  const onContentChangeRef = useLatestRef(onContentChange)
  const onEmbedPageRef = useLatestRef(onEmbedPage)
  const dropPageOnDatabaseRef = useLatestRef(dropPageOnDatabase)
  const handleProviderLinkPasteRef = useLatestRef(
    (view: Parameters<typeof handleProviderLinkPaste>[0], event: ClipboardEvent) =>
      handleProviderLinkPaste(view, event, editable, setPasteChoice)
  )
  const handleTypedLinkChoiceRef = useLatestRef(
    (view: Parameters<typeof handleTypedLinkChoice>[0], event: KeyboardEvent) =>
      handleTypedLinkChoice(view, event, editable, setPasteChoice)
  )

  const dragDrop = useMemo(
    () =>
      createEditorDragDrop(setBlockDropLine, {
        dropPageOnDatabase: (event) => dropPageOnDatabaseRef.current(event),
        getView: () =>
          editorRef.current && !editorRef.current.isDestroyed
            ? editorRef.current.view
            : null,
        insertDraggedPage: (view, event) =>
          insertDraggedDatabasePage(
            view,
            event,
            (embeddedPageId) => onEmbedPageRef.current?.(embeddedPageId),
            pageId
          ),
        isDraggingPage: isDraggingPageToEditor,
        isOverDatabaseDrop: (event) => Boolean(getDropDatabaseElement(event)),
        shouldSkipDropLine: shouldSkipEditorDropLine,
        surfaceRef: editorSurfaceRef,
      }),
    [editorSurfaceRef],
  )

  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: initialContent,
      editable,
      // ProseMirror updates its own DOM. Keep transactions from rerendering the
      // entire React editor shell; controls subscribe to the editor directly.
      shouldRerenderOnTransaction: false,
      onCreate: ({ editor: currentEditor }) => {
        editorRef.current = currentEditor
      },
      onUpdate: ({ editor: currentEditor }) => {
        if (editable) onContentChangeRef.current?.(currentEditor.getJSON())
      },
      editorProps: {
        attributes: { class: "tiptap-editor", "aria-label": "Document editor" },
        handleDrop: dragDrop.handleDrop,
        handleDOMEvents: {
          ...dragDrop.domEvents,
          keydown: (view, event) =>
            event.key === "Enter"
              ? handleTypedLinkChoiceRef.current(view, event)
              : false,
          keyup: (view, event) =>
            event.key === " "
              ? handleTypedLinkChoiceRef.current(view, event)
              : false,
        },
        handlePaste: (view, event) =>
          handleProviderLinkPasteRef.current(view, event),
        transformPastedHTML: normalizePastedEditorHTML,
      },
    },
    [editorLifecycleKey]
  )

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

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
    updateExtensionOptions(editor, {
      databaseEditorRuntime,
      editable,
      editorRuntimeRef,
      onOpenPage,
      pageId,
    })
  }, [databaseEditorRuntime, editor, editable, editorRuntimeRef, onOpenPage, pageId])

  useEffect(() => {
    if (!editor) return
    return registerBlockDragSource(editorId, editor)
  }, [editor, editorId])

  return { blockDropLine, editor, surfaceDragHandlers: dragDrop.surfaceProps }
}
