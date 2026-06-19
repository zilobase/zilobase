import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { EditorContent, useEditor } from "@tiptap/react"
import type { Extensions } from "@tiptap/core"
import type { TableOfContentDataItem } from "@tiptap/extension-table-of-contents"
import Collaboration from "@tiptap/extension-collaboration"
import CollaborationCaret from "@tiptap/extension-collaboration-caret"
import { useAddDatabaseRow, useCreateDatabase } from "@notelab/features/databases"
import { ColumnControls } from "@/packages/editor/components/editor/column-controls"
import { DragBlockMenu } from "@/packages/editor/components/editor/drag-block-menu"
import { registerBlockDragSource } from "@/packages/editor/components/editor/block-drag"
import { MobileActionBar } from "@/packages/editor/components/editor/mobile-action-bar"
import { SelectionBubbleMenu } from "@/packages/editor/components/editor/selection-bubble-menu"
import { TableControls } from "@/packages/editor/components/editor/table-controls"
import { WorkspaceMetadata } from "@/packages/editor/components/editor/workspace-metadata"
import { toast } from "sonner"
import { useWorkspaceCollaboration } from "./use-workspace-collaboration"
import { starterContent } from "./constants"
import {
  createCollaborationSeedUpdate,
  normalizeEditorContent,
  renderCollaborationCaret,
  renderCollaborationSelection,
} from "./collaboration"
import { createBaseExtensions } from "./create-base-extensions"
import { dropPageOnDatabase } from "./database-page-drag"
import { findScrollLockElement } from "./dom"
import {
  createEditorDragHandlers,
  createEditorDropHandler,
} from "./editor-drop-handlers"
import { EditorTableOfContents } from "./editor-table-of-contents"
import { handleProviderLinkPaste, normalizePastedEditorHTML } from "./paste"
import { PasteChoiceMenu } from "./paste-choice-menu"
import { runToolbarCommand } from "./run-toolbar-command"
import { syncExtensionOptions } from "./sync-extension-options"
import type { BlockDropLine, EditorProps, PasteChoiceState } from "./types"
import { useEditorDragHandle } from "./use-editor-drag-handle"
import { useEditorRuntime } from "./use-editor-runtime"
import { useMobileNodeActions } from "./use-mobile-node-actions"

export function Editor({
  content = starterContent,
  cover,
  editorContentRef,
  editable = true,
  emoji,
  fullWidth = true,
  onCollaborationReadyChange,
  onContentChange,
  onCoverChange,
  onCreatePage,
  onEmbedPage,
  onEmojiChange,
  onOpenPage,
  onTitleChange,
  organizationId,
  title,
  workspaceId,
  workspaceUpdatedAt,
}: EditorProps = {}) {
  const editorId = useId()
  const editorSurfaceRef = useRef<HTMLElement | null>(null)
  const [blockDropLine, setBlockDropLine] = useState<BlockDropLine | null>(null)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [dragHandleMenuOpen, setDragHandleMenuOpen] = useState(false)
  const [pasteChoice, setPasteChoice] = useState<PasteChoiceState | null>(null)
  const [tocItems, setTocItems] = useState<TableOfContentDataItem[]>([])
  const pageContentLayout = fullWidth
    ? { className: "", mode: "full" as const }
    : { className: "mx-auto max-w-5xl", mode: "narrow" as const }

  const { databaseEditorRuntime, editorRuntimeRef } = useEditorRuntime(editable)
  const createDatabase = useCreateDatabase()
  const addDatabaseRow = useAddDatabaseRow(organizationId)

  const createEditorDatabase = useCallback(async () => {
    if (!organizationId || !workspaceId) return null
    const payload = await createDatabase.mutateAsync({
      name: "New database",
      organizationId,
      pageId: workspaceId,
    })
    return payload.database.id
  }, [createDatabase, organizationId, workspaceId])

  const handleDatabasePageDrop = useCallback(
    (event: DragEvent) =>
      dropPageOnDatabase(event, {
        addDatabaseRow,
        onError: (message) => toast.error(message),
      }),
    [addDatabaseRow]
  )

  const onContentChangeRef = useRef(onContentChange)
  const dropPageOnDatabaseRef = useRef(handleDatabasePageDrop)
  const handleProviderLinkPasteRef = useRef(
    (view: Parameters<typeof handleProviderLinkPaste>[0], event: ClipboardEvent) =>
      handleProviderLinkPaste(view, event, editable, setPasteChoice)
  )

  useEffect(() => {
    onContentChangeRef.current = onContentChange
  }, [onContentChange])

  useEffect(() => {
    dropPageOnDatabaseRef.current = handleDatabasePageDrop
  }, [handleDatabasePageDrop])

  useEffect(() => {
    handleProviderLinkPasteRef.current = (view, event) =>
      handleProviderLinkPaste(view, event, editable, setPasteChoice)
  }, [editable])

  const collaborationEnabled = editable && Boolean(workspaceId)
  const baseExtensions = useMemo(
    () =>
      createBaseExtensions({
        collaborationEnabled,
        createEditorDatabase,
        databaseEditorRuntime,
        editable,
        onCreatePage,
        onEmbedPage,
        onOpenPage,
        onTocUpdate: setTocItems,
        organizationId,
        workspaceId,
      }),
    [
      collaborationEnabled,
      createEditorDatabase,
      databaseEditorRuntime,
      editable,
      onCreatePage,
      onEmbedPage,
      onOpenPage,
      organizationId,
      workspaceId,
    ]
  )

  const seedUpdate = useMemo(
    () =>
      collaborationEnabled
        ? createCollaborationSeedUpdate(content, baseExtensions)
        : null,
    [baseExtensions, collaborationEnabled, content]
  )

  const collaboration = useWorkspaceCollaboration({
    enabled: collaborationEnabled,
    seedUpdate,
    workspaceId,
    workspaceUpdatedAt,
  })

  const { provider, user, ydoc } = collaboration
  const collaborationReady = Boolean(provider && user && ydoc)

  const editorExtensions = useMemo<Extensions>(() => {
    if (!collaborationReady || !provider || !user || !ydoc) {
      return baseExtensions
    }
    return [
      ...baseExtensions,
      Collaboration.configure({ document: ydoc }),
      CollaborationCaret.configure({
        provider,
        user,
        render: renderCollaborationCaret,
        selectionRender: renderCollaborationSelection,
      }),
    ]
  }, [baseExtensions, collaborationReady, provider, user, ydoc])

  const editorLifecycleKey = `${workspaceId ?? "draft"}:${
    collaborationReady ? "collaboration" : "plain"
  }`

  useEffect(() => {
    onCollaborationReadyChange?.(collaborationReady)
  }, [collaborationReady, onCollaborationReadyChange])

  const editorDropHandler = useMemo(
    () => createEditorDropHandler(
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
      content: collaborationReady ? undefined : normalizeEditorContent(content),
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
    if (!editor || editor.isDestroyed || !editor.extensionManager) return
    syncExtensionOptions(editor, {
      databaseEditorRuntime,
      editorEditable: editable,
      editorRuntimeRef,
      onOpenPage,
      workspaceId,
    })
  }, [databaseEditorRuntime, editor, editable, editorRuntimeRef, onOpenPage, workspaceId])

  useEffect(() => {
    if (!editor) return
    return registerBlockDragSource(editorId, editor)
  }, [editor, editorId])

  useEffect(() => {
    if (!plusMenuOpen) return
    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlusMenuOpen(false)
    }
    window.addEventListener("keydown", closeMenu)
    return () => window.removeEventListener("keydown", closeMenu)
  }, [plusMenuOpen])

  useEffect(() => {
    if (!dragHandleMenuOpen) return
    const scrollLockElement = findScrollLockElement(editorSurfaceRef.current)
    const originalOverflowY = scrollLockElement.style.overflowY
    const originalOverscrollBehavior = scrollLockElement.style.overscrollBehavior
    scrollLockElement.style.overflowY = "hidden"
    scrollLockElement.style.overscrollBehavior = "none"
    return () => {
      scrollLockElement.style.overflowY = originalOverflowY
      scrollLockElement.style.overscrollBehavior = originalOverscrollBehavior
    }
  }, [dragHandleMenuOpen])

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

  return (
    <div className="flex min-h-[calc(100svh-3rem)] w-full flex-col text-foreground">
      <section
        className="min-h-0 flex-1"
        data-editor-surface
        ref={editorSurfaceRef}
        onPointerLeave={() => !dragHandleMenuOpen && clearDesktopDragHandle()}
        onClickCapture={handleMobileNodeClick}
        onPointerMoveCapture={updateDragTargetFromPointer}
      >
        {editable && editor && dragHandle ? (
          <div
            className="drag-handle"
            style={{
              left: dragHandle.position.left,
              top: dragHandle.position.top,
            }}
          >
            <DragBlockMenu
              editor={editor}
              editorId={editorId}
              isOpen={plusMenuOpen}
              onMenuStateChange={setDragHandleMenuOpen}
              onCreateDatabase={createEditorDatabase}
              onOpenChange={setPlusMenuOpen}
              target={dragHandle.target}
            />
          </div>
        ) : null}
        {blockDropLine ? (
          <div
            className="block-drag-drop-line"
            style={{
              left: blockDropLine.left,
              top: blockDropLine.top,
              width: Math.max(0, blockDropLine.right - blockDropLine.left),
            }}
          />
        ) : null}
        {editable ? (
          <>
            <SelectionBubbleMenu
              editor={editor}
              runCommand={(action, attrs) =>
                runToolbarCommand(editor, action, attrs)
              }
            />
            <ColumnControls editor={editor} />
            <TableControls editor={editor} />
          </>
        ) : null}
        <EditorTableOfContents editor={editor} items={tocItems} />
        {pasteChoice && editor ? (
          <PasteChoiceMenu
            editor={editor}
            pasteChoice={pasteChoice}
            onClose={() => setPasteChoice(null)}
          />
        ) : null}
        <WorkspaceMetadata
          contentClassName={pageContentLayout.className}
          cover={cover}
          editable={editable}
          icon={emoji}
          onCoverChange={onCoverChange}
          onIconChange={onEmojiChange}
          onTitleChange={onTitleChange}
          organizationId={organizationId}
          title={title}
          workspaceId={workspaceId}
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
      </section>
    </div>
  )
}

export default Editor