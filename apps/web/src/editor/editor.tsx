import { useCallback, useEffect, useId, useRef, useState } from "react"
import { EditorContent } from "@tiptap/react"
import { SelectionAiDiffDock } from "@/packages/editor/components/editor/selection-ai-diff-dock"
import { MobileActionBar } from "@/packages/editor/components/editor/mobile-action-bar"
import { PageMetadata } from "@/packages/editor/components/editor/page-metadata"
import { starterContent } from "./constants"
import {
  getFullDocumentPreviewRange,
  parseMarkdownContent,
} from "./editor-ai-utils"
import { EditorChrome } from "./editor-chrome"
import { setSelectionAiPreviewMeta } from "./extensions/selection-ai-preview"
import type {
  EditorProps,
  PasteChoiceState,
  SelectionAiDiffPreview,
  PageEditPreviewControls,
  PageEditPreviewRequest,
} from "./types"
import { useEditorDatabaseActions } from "./use-editor-database-actions"
import { useEditorDragHandle } from "./use-editor-drag-handle"
import { useEditorExtensions } from "./use-editor-extensions"
import { useEditorInstance } from "./use-editor-instance"
import { useEditorMenuEffects } from "./use-editor-menu-effects"
import { useEditorRuntime } from "./use-editor-runtime"
import { useMobileNodeActions } from "./use-mobile-node-actions"

export function Editor({
  content = starterContent,
  cover,
  databaseId,
  editorContentRef,
  editable = true,
  enableComments = true,
  emoji,
  fullWidth = true,
  onContentChange,
  onCoverChange,
  onCreatePage,
  onEmbedPage,
  onEditorReady,
  onEmojiChange,
  onOpenPage,
  onTitleChange,
  workspaceId,
  title,
  pageEditPreviewRef,
  pageId,
}: EditorProps = {}) {
  const editorId = useId()
  const editorSurfaceRef = useRef<HTMLElement | null>(null)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [dragHandleMenuOpen, setDragHandleMenuOpen] = useState(false)
  const [pasteChoice, setPasteChoice] = useState<PasteChoiceState | null>(null)
  const [selectionAiPreview, setSelectionAiPreview] =
    useState<SelectionAiDiffPreview | null>(null)
  const pendingPageEditRef = useRef<PageEditPreviewRequest | null>(null)
  const pageContentLayout = fullWidth
    ? { className: "", mode: "full" as const }
    : { className: "mx-auto max-w-5xl", mode: "narrow" as const }

  const { databaseEditorRuntime, editorRuntimeRef } = useEditorRuntime(editable)
  const { createEditorDatabase, handleDatabasePageDrop } =
    useEditorDatabaseActions(workspaceId, pageId)

  const { editorExtensions, editorLifecycleKey, initialContent, tocItems } =
    useEditorExtensions({
      content,
      createEditorDatabase,
      databaseEditorRuntime,
      editable,
      onCreatePage,
      onEmbedPage,
      onOpenPage,
      workspaceId,
      pageId,
    })

  const { blockDropLine, editor, surfaceDragHandlers } = useEditorInstance({
    databaseEditorRuntime,
    dropPageOnDatabase: handleDatabasePageDrop,
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
  })

  useEditorMenuEffects({
    dragHandleMenuOpen,
    editorSurfaceRef,
    plusMenuOpen,
    setPlusMenuOpen,
  })

  const {
    dragHandle,
    clearDesktopDragHandle,
    resolveDragTargetFromPoint,
    updateDragTargetFromPointer,
  } = useEditorDragHandle(editor, dragHandleMenuOpen)

  const {
    mobileNodeTarget,
    canMoveMobileTarget,
    moveMobileTarget,
    handleMobileNodeClick,
  } = useMobileNodeActions(editor, resolveDragTargetFromPoint)

  const handleClosePasteChoice = useCallback(() => setPasteChoice(null), [])

  const clearPageEditPreview = useCallback(
    (options?: { silent?: boolean }) => {
      if (!options?.silent && pendingPageEditRef.current) {
        pendingPageEditRef.current.onDeclined?.()
      }

      pendingPageEditRef.current = null
      setSelectionAiPreview((current) =>
        current?.source === "page-edit" ? null : current,
      )
    },
    [],
  )

  const clearSelectionAiPreview = useCallback(() => {
    if (pendingPageEditRef.current) {
      clearPageEditPreview()
      return
    }

    setSelectionAiPreview(null)
  }, [clearPageEditPreview])

  const handleSelectionAiPreviewChange = useCallback(
    (preview: SelectionAiDiffPreview | null) => {
      if (preview && preview.source !== "page-edit") {
        pendingPageEditRef.current = null
      }

      setSelectionAiPreview(preview)
    },
    [],
  )

  const showPageEditPreview = useCallback(
    (request: PageEditPreviewRequest) => {
      if (!editor || editor.isDestroyed || !editable) {
        return false
      }

      const parsedPreview = parseMarkdownContent(editor, request.afterMarkdown, {
        unwrapPlainFencedBlock: true,
      })

      if (!parsedPreview) {
        return false
      }

      const range = getFullDocumentPreviewRange(editor)
      pendingPageEditRef.current = request
      setSelectionAiPreview({
        baselineMarkdown: request.beforeMarkdown,
        from: range.from,
        generatedMarkdown: request.afterMarkdown,
        isStreaming: false,
        source: "page-edit",
        to: range.to,
        toolCallId: request.toolCallId,
        useBeforeBaseline: request.useBeforeBaseline,
      })

      return true
    },
    [editable, editor],
  )

  const acceptPageEditPreview = useCallback(() => {
    const pendingEdit = pendingPageEditRef.current

    if (!editor || !pendingEdit || editor.isDestroyed) {
      return false
    }

    const parsed = parseMarkdownContent(editor, pendingEdit.afterMarkdown, {
      unwrapPlainFencedBlock: true,
    })

    if (!parsed) {
      return false
    }

    editor.view.dispatch(setSelectionAiPreviewMeta(editor.state.tr, null))
    editor.commands.setContent({
      type: "doc",
      content: parsed.content,
    })
    onContentChange?.(editor.getJSON())
    pendingEdit.onAccepted?.()
    pendingPageEditRef.current = null
    setSelectionAiPreview(null)
    return true
  }, [editor, onContentChange])

  useEffect(() => {
    if (!pageEditPreviewRef) {
      return
    }

    const controls: PageEditPreviewControls = {
      accept: () => acceptPageEditPreview(),
      clear: (options) => clearPageEditPreview(options),
      isActive: () => pendingPageEditRef.current != null,
      show: (request) => showPageEditPreview(request),
      toolCallId: () => pendingPageEditRef.current?.toolCallId ?? null,
    }

    pageEditPreviewRef.current = controls

    return () => {
      pageEditPreviewRef.current = null
    }
  }, [
    acceptPageEditPreview,
    clearPageEditPreview,
    showPageEditPreview,
    pageEditPreviewRef,
  ])

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return
    }

    const parsedPreview = selectionAiPreview
      ? parseMarkdownContent(editor, selectionAiPreview.generatedMarkdown, {
          unwrapPlainFencedBlock: true,
        })
      : null
    const parsedBaseline = selectionAiPreview?.baselineMarkdown
      ? parseMarkdownContent(editor, selectionAiPreview.baselineMarkdown, {
          unwrapPlainFencedBlock: true,
        })
      : null

    editor.view.dispatch(
      setSelectionAiPreviewMeta(
        editor.state.tr,
        selectionAiPreview
          ? {
              baselineContent: parsedBaseline?.content,
              baselineMarkdown: selectionAiPreview.baselineMarkdown,
              from: selectionAiPreview.from,
              generatedContent: parsedPreview?.content,
              generatedMarkdown: selectionAiPreview.generatedMarkdown,
              isStreaming: selectionAiPreview.isStreaming,
              to: selectionAiPreview.to,
              useBeforeBaseline: selectionAiPreview.useBeforeBaseline,
            }
          : null,
      ),
    )
  }, [editor, selectionAiPreview])

  const acceptSelectionAiPreview = useCallback(() => {
    if (pendingPageEditRef.current) {
      acceptPageEditPreview()
      return
    }

    if (!editor || !selectionAiPreview || selectionAiPreview.isStreaming) {
      return
    }

    const parsed = parseMarkdownContent(
      editor,
      selectionAiPreview.generatedMarkdown,
      { unwrapPlainFencedBlock: true },
    )

    if (!parsed) {
      clearSelectionAiPreview()
      return
    }

    editor.view.dispatch(setSelectionAiPreviewMeta(editor.state.tr, null))
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: selectionAiPreview.from, to: selectionAiPreview.to },
        parsed.content,
      )
      .run()
    clearSelectionAiPreview()
  }, [
    acceptPageEditPreview,
    clearSelectionAiPreview,
    editor,
    selectionAiPreview,
  ])

  return (
    <div className="flex min-h-[calc(100svh-3rem)] w-full flex-col text-foreground">
      <section
        className="relative min-h-0 flex-1"
        data-editor-surface
        ref={editorSurfaceRef}
        onDragEnd={surfaceDragHandlers.onDragEnd}
        onDragLeave={surfaceDragHandlers.onDragLeave}
        onDragOver={surfaceDragHandlers.onDragOver}
        onDrop={surfaceDragHandlers.onDrop}
        onPointerLeave={() => !dragHandleMenuOpen && clearDesktopDragHandle()}
        onClickCapture={handleMobileNodeClick}
        onPointerMoveCapture={updateDragTargetFromPointer}
      >
        <EditorChrome
          blockDropLine={blockDropLine}
          createEditorDatabase={createEditorDatabase}
          dragHandle={dragHandle}
          editable={editable}
          editor={editor}
          editorId={editorId}
          onClosePasteChoice={handleClosePasteChoice}
          onSelectionAiPreviewChange={handleSelectionAiPreviewChange}
          workspaceId={workspaceId}
          pasteChoice={pasteChoice}
          plusMenuOpen={plusMenuOpen}
          setDragHandleMenuOpen={setDragHandleMenuOpen}
          setPlusMenuOpen={setPlusMenuOpen}
          tocItems={tocItems}
        />
        <PageMetadata
          contentClassName={pageContentLayout.className}
          cover={cover}
          databaseId={databaseId}
          editable={editable}
          enableComments={enableComments}
          icon={emoji}
          onCoverChange={onCoverChange}
          onIconChange={onEmojiChange}
          onTitleChange={onTitleChange}
          workspaceId={workspaceId}
          title={title}
          pageId={pageId}
        />
        <div
          className={pageContentLayout.className}
          data-editor-page-content={pageContentLayout.mode}
        >
          <EditorContent editor={editor} />
        </div>
        {editable && mobileNodeTarget ? (
          <MobileActionBar
            canMoveDown={canMoveMobileTarget("down")}
            canMoveUp={canMoveMobileTarget("up")}
            onMoveDown={() => moveMobileTarget("down")}
            onMoveUp={() => moveMobileTarget("up")}
          />
        ) : null}
        {editable &&
        selectionAiPreview &&
        selectionAiPreview.source !== "page-edit" ? (
          <SelectionAiDiffDock
            isStreaming={selectionAiPreview.isStreaming}
            onAccept={acceptSelectionAiPreview}
            onDecline={clearSelectionAiPreview}
          />
        ) : null}
      </section>
    </div>
  )
}

export default Editor
