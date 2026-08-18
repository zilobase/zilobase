import { useCallback, useEffect, useId, useRef, useState } from "react"
import { EditorContent } from "@tiptap/react"
import { TextSelection } from "@tiptap/pm/state"
import { SelectionAiDiffDock } from "@/packages/editor/components/editor/selection-ai-diff-dock"
import { MobileActionBar } from "@/packages/editor/components/editor/mobile-action-bar"
import {
  PageMetadata,
  type PageMetadataHandle,
} from "@/packages/editor/components/editor/page-metadata"
import { PageLayoutModuleCanvas } from "@/packages/editor/components/editor/page-layout-module-canvas"
import { PageLayoutTabs } from "@/packages/editor/components/editor/page-layout-tabs"
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
import { useEditorMeetingActions } from "./use-editor-meeting-actions"
import { useEditorDragHandle } from "./use-editor-drag-handle"
import { useEditorExtensions } from "./use-editor-extensions"
import { useEditorInstance } from "./use-editor-instance"
import { useEditorMenuEffects } from "./use-editor-menu-effects"
import { useEditorRuntime } from "./use-editor-runtime"
import { useMobileNodeActions } from "./use-mobile-node-actions"
import { DatabaseView } from "@/packages/editor/extensions/database/views/database-view"
import {
  canMoveDatabaseBlockToPage,
  dropCrossEditorBlock,
  getBlockDragDatabaseId,
  type BlockDragPayload,
} from "@/packages/editor/components/editor/block-drag"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { UndoHistoryScope } from "@/shortcuts"
import { toast } from "sonner"

type PendingDatabaseBlockDrop = {
  canMove: boolean
  databaseId: string
  payload: BlockDragPayload
  pos: number
}

export function Editor({
  afterMetadata,
  commentController,
  collaboration,
  collaborationField,
  content = starterContent,
  cover,
  databaseId,
  databaseIds = [],
  editorContentRef,
  editable = true,
  enableComments = true,
  contentEditable = editable,
  metadataEditable = editable,
  structuralEditingEnabled = editable,
  commentsEditable = enableComments && editable,
  databaseEditable = editable,
  emoji,
  iconPosition,
  fullWidth = true,
  hideEditorContent = false,
  hideMetadata = false,
  layoutConfig,
  layoutPanelMode = "auto",
  layoutPreview = false,
  onLayoutChange,
  onContentChange,
  onCoverChange,
  onCreatePage,
  onEmbedDatabase,
  onEmbedPage,
  onEditorReady,
  onEmojiChange,
  onIconPositionChange,
  onOpenPage,
  onTitleChange,
  workspaceId,
  title,
  pageEditPreviewRef,
  pageId,
}: EditorProps = {}) {
  const editorId = useId()
  const editorSurfaceRef = useRef<HTMLElement | null>(null)
  const pageMetadataRef = useRef<PageMetadataHandle | null>(null)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [dragHandleMenuOpen, setDragHandleMenuOpen] = useState(false)
  const [blockCommentOpen, setBlockCommentOpen] = useState(false)
  const [pasteChoice, setPasteChoice] = useState<PasteChoiceState | null>(null)
  const [selectionAiPreview, setSelectionAiPreview] =
    useState<SelectionAiDiffPreview | null>(null)
  const [pendingDatabaseBlockDrop, setPendingDatabaseBlockDrop] =
    useState<PendingDatabaseBlockDrop | null>(null)
  const [activeLayoutTab, setActiveLayoutTab] = useState("content")
  const pendingPageEditRef = useRef<PageEditPreviewRequest | null>(null)
  const pageContentLayout = fullWidth
    ? { className: "", mode: "full" as const }
    : { className: "mx-auto max-w-5xl", mode: "narrow" as const }
  const activeLinkedTab = layoutConfig?.linkedTabs.find(
    (tab) => tab.id === activeLayoutTab,
  )

  useEffect(() => {
    if (layoutConfig?.structure !== "tabbed" || (activeLayoutTab !== "content" && !activeLinkedTab)) {
      setActiveLayoutTab("content")
    }
  }, [activeLayoutTab, activeLinkedTab, layoutConfig?.structure])

  const { databaseEditorRuntime, editorRuntimeRef } = useEditorRuntime(databaseEditable)
  const { createEditorDatabase, handleDatabasePageDrop } =
    useEditorDatabaseActions(workspaceId, pageId)
  const { createEditorMeeting } = useEditorMeetingActions(workspaceId, pageId)

  const { editorExtensions, editorLifecycleKey, initialContent, tocItems } =
    useEditorExtensions({
      collaboration,
      collaborationField,
      content,
      createEditorDatabase,
      createEditorMeeting,
      databaseEditorRuntime,
      editable: contentEditable,
      structuralEditingEnabled,
      onCreatePage,
      onEmbedPage,
      onOpenPage,
      workspaceId,
      pageId,
    })

  const { blockDropLine, editor, surfaceDragHandlers } = useEditorInstance({
    databaseEditorRuntime,
    dropPageOnDatabase: handleDatabasePageDrop,
    editable: contentEditable,
    editorContentRef,
    editorSurfaceRef,
    editorExtensions,
    editorId,
    editorLifecycleKey,
    editorRuntimeRef,
    initialContent,
    onContentChange,
    onCrossEditorDatabaseDrop: ({ payload, pos }) => {
      const sourceDatabaseId = getBlockDragDatabaseId(payload)
      if (!sourceDatabaseId) return false

      setPendingDatabaseBlockDrop({
        canMove: canMoveDatabaseBlockToPage(
          sourceDatabaseId,
          databaseId,
          databaseIds,
        ),
        databaseId: sourceDatabaseId,
        payload,
        pos,
      })
      return true
    },
    onEditorReady,
    onEmbedPage,
    onOpenPage,
    onMoveToTitle: () => pageMetadataRef.current?.focusTitleEnd() ?? false,
    setPasteChoice,
    pageId,
  })

  const completeDatabaseBlockDrop = async (mode: "copy" | "move") => {
    if (!editor || !pendingDatabaseBlockDrop) return

    const pendingDrop = pendingDatabaseBlockDrop

    if (mode === "copy" && onEmbedDatabase) {
      try {
        await onEmbedDatabase(pendingDrop.databaseId)
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not create the linked database view.",
        )
        return
      }
    }

    const completed = dropCrossEditorBlock(
      editor.view,
      pendingDrop.payload,
      pendingDrop.pos,
      mode,
    )

    if (!completed) {
      toast.error(
        mode === "move"
          ? "Could not move the database."
          : "Could not create the linked database view.",
      )
      return
    }

    setPendingDatabaseBlockDrop(null)
  }

  useEffect(() => {
    commentController?.setEditor(editor ?? null)
    return () => commentController?.setEditor(null)
  }, [commentController, editor])

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
  } = useEditorDragHandle(editor, dragHandleMenuOpen || blockCommentOpen)

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

  const focusPageBodyFromTitle = useCallback(() => {
    if (!editor || !editable) return

    const firstNode = editor.state.doc.firstChild

    if (
      !firstNode ||
      (firstNode.isTextblock && firstNode.content.size === 0)
    ) {
      editor.chain().focus("start").run()
      return
    }

    const paragraph = editor.schema.nodes.paragraph?.create()

    if (!paragraph) {
      editor.chain().focus("start").run()
      return
    }

    const transaction = editor.state.tr.insert(0, paragraph)
    transaction.setSelection(TextSelection.create(transaction.doc, 1))
    editor.view.dispatch(transaction.scrollIntoView())
    editor.view.focus()
  }, [editable, editor])

  const renderLayoutModule = (
    module: NonNullable<typeof layoutConfig>["modules"][number],
  ) => {
    if (module.type === "content") {
      return (
        <div
          className={cn(
            "relative min-w-0 max-w-full",
            module.region === "panel"
              ? "px-4 py-4"
              : pageContentLayout.className,
            layoutPreview &&
              "h-[32rem] overflow-hidden",
            onLayoutChange &&
              module.region === "main" &&
              "[&_.tiptap-editor]:px-8 [&_.tiptap-editor]:py-5",
          )}
          data-editor-page-content={pageContentLayout.mode}
          data-layout-content-preview={layoutPreview ? "true" : undefined}
          key={module.id}
        >
          <EditorContent editor={editor} />
          {layoutPreview ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-background via-background/85 to-transparent"
            />
          ) : null}
        </div>
      )
    }

    if (module.type === "discussions" && layoutConfig?.discussionsVisible === false) {
      return null
    }

    const layoutSection =
      module.type === "heading"
        ? "heading"
        : module.type === "discussions"
          ? "discussions"
          : "properties"

    return (
      <PageMetadata
        afterHeading={
          module.type === "heading" && afterMetadata ? (
            <div className={cn("pt-4", hideEditorContent && "pb-10")}>
              {afterMetadata}
            </div>
          ) : null
        }
        compact={module.region === "panel" || Boolean(onLayoutChange)}
        compactSpacing={onLayoutChange ? "comfortable" : "default"}
        collaborationUsers={
          module.type === "heading" ? collaboration?.users : undefined
        }
        contentClassName={module.region === "panel" ? undefined : pageContentLayout.className}
        cover={cover}
        databaseId={databaseId}
        editable={metadataEditable}
        enableComments={commentsEditable}
        forceDiscussionsExpanded={module.type === "discussions"}
        icon={emoji}
        iconPosition={iconPosition}
        key={module.id}
        layoutConfig={layoutConfig}
        layoutPropertyId={module.type === "property" ? module.propertyId : undefined}
        layoutSection={layoutSection}
        onCoverChange={onCoverChange}
        onIconChange={onEmojiChange}
        onIconPositionChange={onIconPositionChange}
        onOpenPage={onOpenPage}
        onTitleEnter={focusPageBodyFromTitle}
        onTitleChange={onTitleChange}
        workspaceId={workspaceId}
        title={title}
        pageId={pageId}
        ref={module.type === "heading" ? pageMetadataRef : undefined}
      />
    )
  }

  const editorBody = (
    <div className={cn(
      "flex w-full flex-col text-foreground",
      layoutPreview
        ? "h-full min-h-0"
        : hideMetadata
          ? "min-h-[16rem]"
          : "min-h-[calc(100svh-3rem)]",
    )}>
      <section
        className={cn(
          "relative min-h-0 flex-1",
          layoutPreview && "flex flex-col overflow-hidden",
        )}
        data-editor-surface
        ref={editorSurfaceRef}
        onDragEnd={surfaceDragHandlers.onDragEnd}
        onDragLeave={surfaceDragHandlers.onDragLeave}
        onDragOver={surfaceDragHandlers.onDragOver}
        onDragOverCapture={surfaceDragHandlers.onDragOverCapture}
        onDrop={surfaceDragHandlers.onDrop}
        onPointerLeave={() =>
          !dragHandleMenuOpen && !blockCommentOpen && clearDesktopDragHandle()
        }
        onClickCapture={handleMobileNodeClick}
        onPointerMoveCapture={updateDragTargetFromPointer}
      >
        <EditorChrome
          blockDropLine={blockDropLine}
          blockCommentOpen={blockCommentOpen}
          commentController={
            commentsEditable && commentController?.canEdit
              ? commentController
              : undefined
          }
          createEditorDatabase={createEditorDatabase}
          createEditorMeeting={createEditorMeeting}
          dragHandle={dragHandle}
          editable={contentEditable && structuralEditingEnabled}
          editor={editor}
          editorId={editorId}
          onClosePasteChoice={handleClosePasteChoice}
          onSelectionAiPreviewChange={handleSelectionAiPreviewChange}
          pageId={pageId}
          workspaceId={workspaceId}
          pasteChoice={pasteChoice}
          plusMenuOpen={plusMenuOpen}
          setDragHandleMenuOpen={setDragHandleMenuOpen}
          setBlockCommentOpen={setBlockCommentOpen}
          setPlusMenuOpen={setPlusMenuOpen}
          tocItems={layoutPreview ? [] : tocItems}
        />
        {hideMetadata ? (
          <div
            className="min-w-0"
            data-editor-page-content={pageContentLayout.mode}
          >
            <EditorContent editor={editor} />
          </div>
        ) : layoutConfig ? (
          <PageLayoutModuleCanvas
            config={layoutConfig}
            fixedAfterHeading={
              layoutConfig.structure === "tabbed" ? (
                <PageLayoutTabs
                  config={layoutConfig}
                  onChange={onLayoutChange}
                  onValueChange={setActiveLayoutTab}
                  value={activeLayoutTab}
                />
              ) : undefined
            }
            fullWidth={fullWidth}
            pageId={pageId}
            mainContentOverride={
              activeLinkedTab ? (
                <div
                  className={cn(
                    "relative min-w-0 p-5 md:px-12",
                    layoutPreview
                      ? "h-[32rem] overflow-hidden"
                      : "min-h-[calc(100svh-6rem)]",
                  )}
                >
                  <DatabaseView
                    activeViewId={activeLinkedTab.viewId}
                    databaseId={activeLinkedTab.databaseId}
                    editable={databaseEditable}
                    fullPage
                    onOpenPage={onOpenPage}
                    pageId={pageId}
                    showExpandButton={false}
                    workspaceId={workspaceId}
                  />
                  {layoutPreview ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-background via-background/85 to-transparent"
                    />
                  ) : null}
                </div>
              ) : undefined
            }
            onChange={onLayoutChange}
            panelMode={layoutPanelMode}
            renderModule={renderLayoutModule}
          />
        ) : (
          <>
            <PageMetadata
              afterHeading={
                afterMetadata ? (
                  <div className={cn("pt-4", hideEditorContent && "pb-10")}>
                    {afterMetadata}
                  </div>
                ) : null
              }
              collaborationUsers={collaboration?.users}
              contentClassName={pageContentLayout.className}
              cover={cover}
              databaseId={databaseId}
              editable={metadataEditable}
              enableComments={commentsEditable}
              icon={emoji}
              iconPosition={iconPosition}
              onCoverChange={onCoverChange}
              onIconChange={onEmojiChange}
              onIconPositionChange={onIconPositionChange}
              onOpenPage={onOpenPage}
              onTitleEnter={focusPageBodyFromTitle}
              onTitleChange={onTitleChange}
              workspaceId={workspaceId}
              title={title}
              pageId={pageId}
              ref={pageMetadataRef}
            />
            <div
              className={pageContentLayout.className}
              data-editor-page-content={pageContentLayout.mode}
            >
              {hideEditorContent ? null : <EditorContent editor={editor} />}
            </div>
          </>
        )}
        {contentEditable && structuralEditingEnabled && mobileNodeTarget ? (
          <MobileActionBar
            canMoveDown={canMoveMobileTarget("down")}
            canMoveUp={canMoveMobileTarget("up")}
            onMoveDown={() => moveMobileTarget("down")}
            onMoveUp={() => moveMobileTarget("up")}
          />
        ) : null}
        {contentEditable &&
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

  return (
    <UndoHistoryScope resetKey={pageId ?? editorId}>
      {editorBody}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setPendingDatabaseBlockDrop(null)
        }}
        open={pendingDatabaseBlockDrop !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDatabaseBlockDrop?.canMove
                ? "Move database or create a linked view?"
                : "This database can’t be moved here"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDatabaseBlockDrop?.canMove
                ? "Move the database into this page, or leave the original where it is and create a linked view here."
                : "This page is part of the database. Moving the database here would create a circular hierarchy, but you can create a linked view instead."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void completeDatabaseBlockDrop("copy")}
              variant={
                pendingDatabaseBlockDrop?.canMove ? "outline" : "default"
              }
            >
              Create linked view
            </AlertDialogAction>
            {pendingDatabaseBlockDrop?.canMove ? (
              <AlertDialogAction
                onClick={() => void completeDatabaseBlockDrop("move")}
              >
                Move
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </UndoHistoryScope>
  )
}

export default Editor
