import { useCallback, useEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
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
import StarterKit from "@tiptap/starter-kit"

import {
  DragBlockMenu,
  dragHandleComputePositionConfig,
} from "@/packages/editor/components/editor/drag-block-menu"
import { PageMetadata } from "@/packages/editor/components/editor/page-metadata"
import { SelectionBubbleMenu } from "@/packages/editor/components/editor/selection-bubble-menu"
import { TableControls } from "@/packages/editor/components/editor/table-controls"
import type {
  DragHandleTarget,
  ToolbarAction,
  ToolbarAttrs,
} from "@/packages/editor/components/editor/types"
import { BookmarkBlock } from "@/packages/editor/extensions/bookmark-block"
import { CodeBlockShiki } from "@/packages/editor/extensions/code-block-shiki"
import { EmojiExtension } from "@/packages/editor/extensions/emoji"
import { FileBlock } from "@/packages/editor/extensions/file-block"
import { ImageBlock } from "@/packages/editor/extensions/image-block"
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
  onEmojiChange?: (emoji: string) => void
  onTitleChange?: (title: string) => void
  title?: string
}

export function Editor({
  content = starterContent,
  emoji,
  onEmojiChange,
  onTitleChange,
  title,
}: EditorProps = {}) {
  const dragHandlePosRef = useRef<number | null>(null)
  const pointerDragTargetRef = useRef<DragHandleTarget | null>(null)
  const [dragHandleTarget, setDragHandleTarget] =
    useState<DragHandleTarget | null>(null)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)

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
      SlashCommand,
    ],
    content: normalizeEditorContent(content),
    editorProps: {
      attributes: {
        class: "tiptap-editor",
        "aria-label": "Document editor",
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

  const resolveDragTargetFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!editor) {
        return null
      }

      const view = editor.view
      const editorElement = view.dom
      const elements = view.root.elementsFromPoint(
        event.clientX,
        event.clientY
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

          if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
            return currentTarget
          }
        }

        return null
      }

      const coords = view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
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
              onOpenChange={setPlusMenuOpen}
              target={dragHandleTarget}
            />
          </DragHandle>
        ) : null}
        <SelectionBubbleMenu editor={editor} runCommand={runCommand} />
        <TableControls editor={editor} />
        <PageMetadata
          icon={emoji}
          onIconChange={onEmojiChange}
          onTitleChange={onTitleChange}
          title={title}
        />
        <EditorContent editor={editor} />
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
