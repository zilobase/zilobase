import { useCallback, useEffect, useRef, useState } from "react"
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react"
import { EditorContent, useEditor } from "@tiptap/react"
import CharacterCount from "@tiptap/extension-character-count"
import {
  Details,
  DetailsContent,
  DetailsSummary,
} from "@tiptap/extension-details"
import DragHandle from "@tiptap/extension-drag-handle-react"
import type { NestedOptions } from "@tiptap/extension-drag-handle"
import Placeholder from "@tiptap/extension-placeholder"
import { Table } from "@tiptap/extension-table"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableRow } from "@tiptap/extension-table-row"
import TaskList from "@tiptap/extension-task-list"
import TextAlign from "@tiptap/extension-text-align"
import { BackgroundColor, Color, TextStyle } from "@tiptap/extension-text-style"
import Typography from "@tiptap/extension-typography"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"
import StarterKit from "@tiptap/starter-kit"

import {
  DragBlockMenu,
  dragHandleComputePositionConfig,
} from "@/packages/editor/components/editor/drag-block-menu"
import { MobileActionBar } from "@/packages/editor/components/editor/mobile-action-bar"
import { SelectionBubbleMenu } from "@/packages/editor/components/editor/selection-bubble-menu"
import { TableControls } from "@/packages/editor/components/editor/table-controls"
import { WorkspaceMetadata } from "@/packages/editor/components/editor/workspace-metadata"
import type {
  DragHandleTarget,
  ToolbarAction,
  ToolbarAttrs,
} from "@/packages/editor/components/editor/types"
import { useCreateDatabase } from "@/features/databases/hooks"
import { BookmarkBlock } from "@/packages/editor/extensions/bookmark-block"
import { CodeBlockShiki } from "@/packages/editor/extensions/code-block-shiki"
import {
  DATABASE_PAGE_DRAG_MIME,
  DatabaseBlock,
} from "@/packages/editor/extensions/database"
import { EmojiExtension } from "@/packages/editor/extensions/emoji"
import { FileBlock } from "@/packages/editor/extensions/file-block"
import { ImageBlock } from "@/packages/editor/extensions/image-block"
import {
  PageBlock,
  type CreatedPage,
} from "@/packages/editor/extensions/page-block"
import { ShadcnTaskItem } from "@/packages/editor/extensions/shadcn-task-item"
import { SlashCommand } from "@/packages/editor/extensions/slash-command"
import { VideoBlock } from "@/packages/editor/extensions/video-block"

const starterContent = `
  <h1>Draft your next workspace doc</h1>
  <p>
    Type <code>/</code> on a new line to open the block menu. Use Markdown-style
    shortcuts, checklists, quotes, code blocks, and rich inline formatting.
  </p>
  <ul data-type="taskList">
    <li data-type="taskItem" data-checked="false">Capture the idea</li>
    <li data-type="taskItem" data-checked="true">Shape it into a clean doc</li>
  </ul>
  <blockquote>Fast notes, structured blocks, zero ceremony.</blockquote>
`

const emptyContent = "<p></p>"

const dragHandleNestedOptions: NestedOptions = {
  edgeDetection: "none",
  rules: [
    {
      id: "preferNestedChildren",
      evaluate: ({ node, pos, $pos }) => {
        const parentContainerTypes = [
          "blockquote",
          "details",
          "detailsContent",
          "bulletList",
          "orderedList",
          "taskList",
        ]

        if (parentContainerTypes.includes(node.type.name)) {
          return 1000
        }

        if (node.type.name !== "taskItem") {
          return 0
        }

        let childPos = pos + 1

        for (let index = 0; index < node.childCount; index += 1) {
          const child = node.child(index)
          const childStart = childPos
          const childEnd = childStart + child.nodeSize

          if (
            child.type.name === "taskList" &&
            $pos.pos >= childStart &&
            $pos.pos <= childEnd
          ) {
            return 1000
          }

          childPos = childEnd
        }

        return 0
      },
    },
  ],
}

type EditorProps = {
  content?: unknown
  emoji?: string
  onContentChange?: (content: unknown) => void
  onCreatePage?: () => Promise<CreatedPage>
  onEmojiChange?: (emoji: string) => void
  onOpenPage?: (pageId: string) => void
  onTitleChange?: (title: string) => void
  organizationId?: string | null
  title?: string
  workspaceId?: string | null
}

type NodePlacement = {
  index: number
  parent: ProseMirrorNode | null
  pos: number
}

function insertDraggedDatabasePage(view: EditorView, event: DragEvent) {
  const payload = event.dataTransfer?.getData(DATABASE_PAGE_DRAG_MIME)

  if (!payload) {
    return false
  }

  let pageId: unknown

  try {
    pageId = (JSON.parse(payload) as { pageId?: unknown }).pageId
  } catch {
    return false
  }

  if (typeof pageId !== "string" || !pageId) {
    return false
  }

  const coords = view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  })
  const pageBlockType = view.state.schema.nodes.pageBlock

  if (!coords || !pageBlockType) {
    return false
  }

  const pageBlock = pageBlockType.create({ pageId })

  try {
    view.dispatch(view.state.tr.insert(coords.pos, pageBlock).scrollIntoView())
    view.focus()
    event.preventDefault()
    return true
  } catch {
    const $pos = view.state.doc.resolve(coords.pos)
    const fallbackPos = $pos.depth > 0 ? $pos.after(1) : coords.pos

    try {
      view.dispatch(view.state.tr.insert(fallbackPos, pageBlock).scrollIntoView())
      view.focus()
      event.preventDefault()
      return true
    } catch {
      return false
    }
  }
}

function hasDraggedDatabasePage(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes(
    DATABASE_PAGE_DRAG_MIME
  )
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 767px)").matches
}

export function Editor({
  content = starterContent,
  emoji,
  onContentChange,
  onCreatePage,
  onEmojiChange,
  onOpenPage,
  onTitleChange,
  organizationId,
  title,
  workspaceId,
}: EditorProps = {}) {
  const dragHandlePosRef = useRef<number | null>(null)
  const pointerDragTargetRef = useRef<DragHandleTarget | null>(null)
  const [dragHandleTarget, setDragHandleTarget] =
    useState<DragHandleTarget | null>(null)
  const [mobileNodeTarget, setMobileNodeTarget] =
    useState<DragHandleTarget | null>(null)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const createDatabase = useCreateDatabase()
  const createEditorDatabase = useCallback(async () => {
    if (!organizationId || !workspaceId) {
      return null
    }

    const payload = await createDatabase.mutateAsync({
      name: "New database",
      organizationId,
      pageId: workspaceId,
    })

    return payload.database.id
  }, [createDatabase, organizationId, workspaceId])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === "heading") {
            return "Heading"
          }

          return "Type / for blocks, or just start writing"
        },
      }),
      TaskList,
      ShadcnTaskItem.configure({
        nested: true,
      }),
      TextStyle,
      Color,
      BackgroundColor,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Details.configure({
        HTMLAttributes: {
          class: "editor-details",
        },
        persist: true,
      }),
      DetailsSummary.configure({
        HTMLAttributes: {
          class: "editor-details-summary",
        },
      }),
      DetailsContent.configure({
        HTMLAttributes: {
          class: "editor-details-content",
        },
      }),
      ImageBlock,
      VideoBlock,
      FileBlock,
      BookmarkBlock,
      DatabaseBlock.configure({
        currentPageId: workspaceId,
        onOpenPage,
        organizationId,
      }),
      PageBlock.configure({
        currentPageId: workspaceId,
        onCreatePage,
        onOpenPage,
        organizationId,
      }),
      EmojiExtension,
      CodeBlockShiki.configure({
        defaultLanguage: null,
        defaultTheme: "github-dark",
        themes: {
          light: "github-light",
          dark: "github-dark",
        },
      }),
      Table.configure({
        cellMinWidth: 180,
        HTMLAttributes: {
          class: "editor-table",
        },
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Typography,
      CharacterCount,
      SlashCommand.configure({
        onCreateDatabase: createEditorDatabase,
        onCreatePage,
        onOpenPage,
      }),
    ],
    content: normalizeEditorContent(content),
    onUpdate: ({ editor }) => {
      onContentChange?.(editor.getJSON())
    },
    editorProps: {
      attributes: {
        class: "tiptap-editor",
        "aria-label": "Document editor",
      },
      handleDrop: (view, event) => insertDraggedDatabasePage(view, event),
      handleDOMEvents: {
        dragover: (_view, event) => {
          if (!hasDraggedDatabasePage(event)) {
            return false
          }

          if (
            event.target instanceof HTMLElement &&
            event.target.closest(".database-table-wrap")
          ) {
            return false
          }

          if (event.dataTransfer) {
            event.preventDefault()
            event.dataTransfer.dropEffect = "copy"
          }

          return false
        },
      },
    },
  })

  useEffect(() => {
    if (!plusMenuOpen) {
      return
    }

    const closeMenu = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlusMenuOpen(false)
      }
    }

    window.addEventListener("keydown", closeMenu)

    return () => {
      window.removeEventListener("keydown", closeMenu)
    }
  }, [plusMenuOpen])

  const getDragHandleVirtualElement = useCallback(() => {
    if (!editor || dragHandlePosRef.current === null) {
      return null
    }

    const domNode = editor.view.nodeDOM(dragHandlePosRef.current)

    if (!(domNode instanceof HTMLElement)) {
      return null
    }

    const nodeRect = domNode.getBoundingClientRect()
    const editorRect = editor.view.dom.getBoundingClientRect()
    const editorStyle = window.getComputedStyle(editor.view.dom)
    const paddingLeft = Number.parseFloat(editorStyle.paddingLeft) || 0
    const railLeft = editorRect.left + Math.max(16, paddingLeft - 64)

    return {
      getBoundingClientRect: () =>
        new DOMRect(railLeft, nodeRect.top, 0, nodeRect.height),
    }
  }, [editor])

  const resolveDragTargetFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!editor) {
        return null
      }

      const view = editor.view
      const editorElement = view.dom
      const elements = view.root.elementsFromPoint(
        clientX,
        clientY
      )
      const isInsideEditor = elements.some(
        (element) =>
          element instanceof HTMLElement &&
          editorElement.contains(element)
      )

      if (!isInsideEditor) {
        const currentTarget = pointerDragTargetRef.current
        const currentDom =
          currentTarget && view.nodeDOM(currentTarget.pos)

        if (currentDom instanceof HTMLElement) {
          const rect = currentDom.getBoundingClientRect()

          if (clientY >= rect.top && clientY <= rect.bottom) {
            return currentTarget
          }
        }

        return null
      }

      const coords = view.posAtCoords({
        left: clientX,
        top: clientY,
      })

      if (!coords) {
        return null
      }

      const $pos = view.state.doc.resolve(coords.pos)
      const parentContainerTypes = new Set([
        "blockquote",
        "details",
        "detailsContent",
        "bulletList",
        "orderedList",
        "taskList",
        "tableRow",
        "tableCell",
        "tableHeader",
      ])

      for (let depth = $pos.depth; depth > 0; depth -= 1) {
        const node = $pos.node(depth)
        const parent = depth > 0 ? $pos.node(depth - 1) : null
        const index = depth > 0 ? $pos.index(depth - 1) : 0

        if (node.isInline || node.isText) {
          continue
        }

        if (parentContainerTypes.has(node.type.name)) {
          continue
        }

        if (
          index === 0 &&
          (parent?.type.name === "taskItem" ||
            parent?.type.name === "listItem")
        ) {
          continue
        }

        const pos = $pos.before(depth)

        return { node, pos }
      }

      return null
    },
    [editor]
  )

  const resolveDragTargetFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) =>
      resolveDragTargetFromPoint(event.clientX, event.clientY),
    [resolveDragTargetFromPoint]
  )

  const updateDragTargetFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const nextTarget = resolveDragTargetFromPointer(event)

      pointerDragTargetRef.current = nextTarget

      if (!nextTarget || nextTarget.pos === dragHandlePosRef.current) {
        return
      }

      dragHandlePosRef.current = nextTarget.pos
      setDragHandleTarget(nextTarget)
    },
    [resolveDragTargetFromPointer]
  )

  const handleDragNodeChange = useCallback(
    ({ node, pos }: { node: ProseMirrorNode | null; pos: number }) => {
      const pointerTarget = pointerDragTargetRef.current
      const nextTarget =
        pointerTarget ??
        (node && pos >= 0
          ? {
              node,
              pos,
            }
          : null)

      dragHandlePosRef.current = nextTarget?.pos ?? null
      setDragHandleTarget(
        nextTarget
      )
      setPlusMenuOpen(false)
    },
    []
  )

  const getTargetPlacement = useCallback(
    (target: DragHandleTarget | null): NodePlacement | null => {
      if (!editor || !target) {
        return null
      }

      let placement: NodePlacement | null = null

      editor.state.doc.descendants((node, pos, parent, index) => {
        if (pos !== target.pos || node.type !== target.node.type) {
          return
        }

        placement = { index, parent, pos }
        return false
      })

      return placement
    },
    [editor]
  )

  const canMoveMobileTarget = useCallback(
    (direction: "up" | "down") => {
      const placement = getTargetPlacement(mobileNodeTarget)

      if (!placement?.parent) {
        return false
      }

      return direction === "up"
        ? placement.index > 0
        : placement.index < placement.parent.childCount - 1
    },
    [getTargetPlacement, mobileNodeTarget]
  )

  const moveMobileTarget = useCallback(
    (direction: "up" | "down") => {
      if (!editor || !mobileNodeTarget) {
        return
      }

      const placement = getTargetPlacement(mobileNodeTarget)

      if (!placement?.parent) {
        return
      }

      const source = editor.state.doc.nodeAt(placement.pos)

      if (!source) {
        setMobileNodeTarget(null)
        return
      }

      const sourceEnd = placement.pos + source.nodeSize
      const tr = editor.state.tr
      let nextPos = placement.pos

      if (direction === "up") {
        if (placement.index === 0) {
          return
        }

        const previous = placement.parent.child(placement.index - 1)
        nextPos = placement.pos - previous.nodeSize

        tr.delete(placement.pos, sourceEnd).insert(nextPos, source)
      } else {
        if (placement.index >= placement.parent.childCount - 1) {
          return
        }

        const next = placement.parent.child(placement.index + 1)
        nextPos = placement.pos + next.nodeSize

        tr.delete(placement.pos, sourceEnd).insert(nextPos, source)
      }

      editor.view.dispatch(tr.scrollIntoView())
      editor.view.focus()
      setMobileNodeTarget({ node: source, pos: nextPos })
      dragHandlePosRef.current = nextPos
      setDragHandleTarget({ node: source, pos: nextPos })
    },
    [editor, getTargetPlacement, mobileNodeTarget]
  )

  const handleMobileNodeClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!editor || !isMobileViewport()) {
        setMobileNodeTarget(null)
        return
      }

      const targetElement = event.target

      if (
        !(targetElement instanceof HTMLElement) ||
        targetElement.closest(
          "[data-mobile-action-bar], button, input, textarea, select, [role='button']"
        )
      ) {
        return
      }

      const nextTarget = resolveDragTargetFromPoint(
        event.clientX,
        event.clientY
      )

      setMobileNodeTarget(nextTarget)
    },
    [editor, resolveDragTargetFromPoint]
  )

  const runCommand = (action: ToolbarAction, attrs?: ToolbarAttrs) => {
    if (!editor) {
      return
    }

    const chain = editor.chain().focus()

    switch (action) {
      case "toggleBold":
        chain.toggleBold().run()
        break
      case "toggleItalic":
        chain.toggleItalic().run()
        break
      case "toggleStrike":
        chain.toggleStrike().run()
        break
      case "toggleCode":
        chain.toggleCode().run()
        break
      case "toggleUnderline":
        chain.toggleUnderline().run()
        break
      case "toggleHeading":
        chain.toggleHeading({ level: attrs?.level ?? 1 }).run()
        break
      case "toggleBulletList":
        chain.toggleBulletList().run()
        break
      case "toggleOrderedList":
        chain.toggleOrderedList().run()
        break
      case "toggleTaskList":
        chain.toggleTaskList().run()
        break
      case "toggleBlockquote":
        chain.toggleBlockquote().run()
        break
      case "toggleCodeBlock":
        chain.toggleCodeBlock().run()
        break
      case "setDetails":
        chain.setDetails().run()
        break
      case "setHorizontalRule":
        chain.setHorizontalRule().run()
        break
      case "insertTable":
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        break
      case "setTextAlign":
        chain.setTextAlign(attrs?.align ?? "left").run()
        break
    }
  }

  return (
    <div className="flex min-h-[calc(100svh-3rem)] w-full flex-col text-foreground">
      <section
        className="min-h-0 flex-1"
        onPointerLeave={() => {
          pointerDragTargetRef.current = null
        }}
        onClickCapture={handleMobileNodeClick}
        onPointerMoveCapture={updateDragTargetFromPointer}
      >
        {editor ? (
          <DragHandle
            nested={dragHandleNestedOptions}
            className="drag-handle"
            computePositionConfig={dragHandleComputePositionConfig}
            editor={editor}
            getReferencedVirtualElement={getDragHandleVirtualElement}
            onNodeChange={handleDragNodeChange}
          >
            <DragBlockMenu
              editor={editor}
              isOpen={plusMenuOpen}
              onCreateDatabase={createEditorDatabase}
              onOpenChange={setPlusMenuOpen}
              target={dragHandleTarget}
            />
          </DragHandle>
        ) : null}
        <SelectionBubbleMenu editor={editor} runCommand={runCommand} />
        <TableControls editor={editor} />
        <WorkspaceMetadata
          icon={emoji}
          onIconChange={onEmojiChange}
          onTitleChange={onTitleChange}
          title={title}
        />
        <EditorContent editor={editor} />
        {mobileNodeTarget ? (
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

function normalizeEditorContent(content: unknown) {
  if (typeof content === "string") {
    return content.trim() ? content : emptyContent
  }

  if (content && typeof content === "object") {
    return content
  }

  return emptyContent
}
