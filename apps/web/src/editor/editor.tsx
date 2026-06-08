import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react"
import {
  EditorContent,
  useEditor,
  type Editor as TiptapEditor,
} from "@tiptap/react"
import CharacterCount from "@tiptap/extension-character-count"
import {
  Details,
  DetailsContent,
  DetailsSummary,
} from "@tiptap/extension-details"
import Placeholder from "@tiptap/extension-placeholder"
import Link from "@tiptap/extension-link"
import {
  TableOfContents,
  type TableOfContentDataItem,
} from "@tiptap/extension-table-of-contents"
import { Table } from "@tiptap/extension-table"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableRow } from "@tiptap/extension-table-row"
import TaskList from "@tiptap/extension-task-list"
import TextAlign from "@tiptap/extension-text-align"
import { BackgroundColor, Color, TextStyle } from "@tiptap/extension-text-style"
import Typography from "@tiptap/extension-typography"
import type { Content } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"
import StarterKit from "@tiptap/starter-kit"

import { cn } from "@/lib/utils"
import { ColumnControls } from "@/packages/editor/components/editor/column-controls"
import { DragBlockMenu } from "@/packages/editor/components/editor/drag-block-menu"
import {
  hasDraggedEditorBlock,
  deleteDraggedEditorBlockSource,
  dropDraggedEditorBlockAt,
  getColumnBlockDragDropTarget,
  getPlaneDragHandleRect,
  getDraggedEditorBlockPayload,
  preparePlaneBlockDrop,
  registerBlockDragSource,
  resolvePlaneDragTargetFromPoint,
  type BlockDragPayload,
} from "@/packages/editor/components/editor/block-drag"
import { MobileActionBar } from "@/packages/editor/components/editor/mobile-action-bar"
import { SelectionBubbleMenu } from "@/packages/editor/components/editor/selection-bubble-menu"
import { TableControls } from "@/packages/editor/components/editor/table-controls"
import { WorkspaceMetadata } from "@/packages/editor/components/editor/workspace-metadata"
import type {
  DragHandleTarget,
  ToolbarAction,
  ToolbarAttrs,
} from "@/packages/editor/components/editor/types"
import { useAddDatabaseRow, useCreateDatabase } from "@notelab/features/databases"
import {
  BookmarkBlock,
  fetchBookmarkMetadata,
  getFallbackBookmarkMetadata,
} from "@/packages/editor/extensions/bookmark-block"
import { CodeBlockShiki } from "@/packages/editor/extensions/code-block-shiki"
import { ColumnsExtension } from "@/packages/editor/extensions/columns"
import {
  DATABASE_PAGE_DRAG_MIME,
  DatabaseBlock,
  type DatabaseBlockEditorRuntime,
} from "@/packages/editor/extensions/database"
import {
  EmbedBlock,
  normalizeEmbedUrl,
  type EmbedProvider,
} from "@/packages/editor/extensions/embed-block"
import { EmojiExtension } from "@/packages/editor/extensions/emoji"
import { FileBlock } from "@/packages/editor/extensions/file-block"
import { ImageBlock } from "@/packages/editor/extensions/image-block"
import { LinkMention } from "@/packages/editor/extensions/link-mention"
import {
  PageBlock,
  type CreatedPage,
} from "@/packages/editor/extensions/page-block"
import { ShadcnTaskItem } from "@/packages/editor/extensions/shadcn-task-item"
import { SlashCommand } from "@/packages/editor/extensions/slash-command"
import { VideoBlock } from "@/packages/editor/extensions/video-block"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"

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

type PasteChoiceState = {
  anchor: { getBoundingClientRect: () => DOMRect }
  embedAttrs: Record<string, unknown>
  from: number
  provider: EmbedProvider
  to: number
  url: string
}

type EditorProps = {
  content?: unknown
  emoji?: string
  editable?: boolean
  fullWidth?: boolean
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

type BlockDropLine = {
  left: number
  right: number
  top: number
}

function findScrollLockElement(element: HTMLElement | null) {
  let current = element?.parentElement ?? null

  while (current) {
    const styles = window.getComputedStyle(current)
    const canScrollY =
      /(auto|scroll|overlay)/.test(styles.overflowY) &&
      current.scrollHeight > current.clientHeight

    if (canScrollY) {
      return current
    }

    current = current.parentElement
  }

  const scrollingElement = document.scrollingElement

  return scrollingElement instanceof HTMLElement
    ? scrollingElement
    : document.documentElement
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

type DatabasePageDropPayload = {
  blockPayload?: BlockDragPayload
  pageId: string
  title?: string
}

function getDraggedDatabasePagePayload(event: DragEvent) {
  const payload = event.dataTransfer?.getData(DATABASE_PAGE_DRAG_MIME)

  if (!payload) {
    return null
  }

  try {
    const parsed = JSON.parse(payload) as {
      pageId?: unknown
      title?: unknown
    }

    if (typeof parsed.pageId !== "string" || !parsed.pageId) {
      return null
    }

    return {
      pageId: parsed.pageId,
      title: typeof parsed.title === "string" ? parsed.title : undefined,
    }
  } catch {
    return null
  }
}

function getDraggedPageBlockPayload(
  event: DragEvent
): DatabasePageDropPayload | null {
  const blockPayload = getDraggedEditorBlockPayload(event.dataTransfer)

  if (blockPayload?.typeName !== "pageBlock") {
    return null
  }

  const node = blockPayload.node as { attrs?: { pageId?: unknown } }
  const pageId = node.attrs?.pageId

  if (typeof pageId !== "string" || !pageId) {
    return null
  }

  return {
    blockPayload,
    pageId,
    title: blockPayload.textContent || undefined,
  }
}

function getDatabasePageDropPayload(
  event: DragEvent
): DatabasePageDropPayload | null {
  return getDraggedPageBlockPayload(event) ?? getDraggedDatabasePagePayload(event)
}

function getDropDatabaseElement(event: DragEvent) {
  if (!(event.target instanceof HTMLElement)) {
    return null
  }

  return event.target.closest<HTMLElement>(".database-block[data-database-id]")
}

function getDatabaseDropPosition(databaseElement: HTMLElement, event: DragEvent) {
  const rowElements = Array.from(
    databaseElement.querySelectorAll<HTMLTableRowElement>(
      ".database-table tbody tr[data-database-row-id]"
    )
  )

  if (rowElements.length === 0) {
    return 0
  }

  const targetIndex = rowElements.findIndex((rowElement) => {
    const rect = rowElement.getBoundingClientRect()

    return event.clientY < rect.top + rect.height / 2
  })

  return targetIndex === -1 ? rowElements.length : targetIndex
}

function hasDraggedDatabasePage(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes(
    DATABASE_PAGE_DRAG_MIME
  )
}

function hasDraggedPageBlock(event: DragEvent) {
  return getDraggedPageBlockPayload(event) !== null
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 767px)").matches
}

export function Editor({
  content = starterContent,
  editable = true,
  emoji,
  fullWidth = true,
  onContentChange,
  onCreatePage,
  onEmojiChange,
  onOpenPage,
  onTitleChange,
  organizationId,
  title,
  workspaceId,
}: EditorProps = {}) {
  const editorId = useId()
  const editorSurfaceRef = useRef<HTMLElement | null>(null)
  const dragHandlePosRef = useRef<number | null>(null)
  const pointerDragTargetRef = useRef<DragHandleTarget | null>(null)
  const [dragHandleTarget, setDragHandleTarget] =
    useState<DragHandleTarget | null>(null)
  const [dragHandlePosition, setDragHandlePosition] =
    useState<{ left: number; top: number } | null>(null)
  const [mobileNodeTarget, setMobileNodeTarget] =
    useState<DragHandleTarget | null>(null)
  const [blockDropLine, setBlockDropLine] = useState<BlockDropLine | null>(null)
  const [plusMenuOpen, setPlusMenuOpen] = useState(false)
  const [dragHandleMenuOpen, setDragHandleMenuOpen] = useState(false)
  const [pasteChoice, setPasteChoice] = useState<PasteChoiceState | null>(null)
  const [tocItems, setTocItems] = useState<TableOfContentDataItem[]>([])
  const pageContentClassName = fullWidth ? "" : "mx-auto max-w-5xl"
  // Node views do not re-render just because extension options mutate.
  // Keep editability in a tiny external store so database cells follow editor mode changes.
  const editorRuntimeRef = useRef({
    editable,
    listeners: new Set<() => void>(),
  })
  const databaseEditorRuntime = useMemo<DatabaseBlockEditorRuntime>(
    () => ({
      getEditable: () => editorRuntimeRef.current.editable,
      subscribe: (listener: () => void) => {
        editorRuntimeRef.current.listeners.add(listener)

        return () => {
          editorRuntimeRef.current.listeners.delete(listener)
        }
      },
    }),
    []
  )
  const createDatabase = useCreateDatabase()
  const addDatabaseRow = useAddDatabaseRow(organizationId)
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
  const dropPageOnDatabase = useCallback(
    (event: DragEvent) => {
      const databaseElement = getDropDatabaseElement(event)
      const databaseId = databaseElement?.dataset.databaseId

      if (!databaseElement || !databaseId) {
        return false
      }

      const dropPayload = getDatabasePageDropPayload(event)

      if (!dropPayload) {
        return false
      }

      event.preventDefault()
      event.stopPropagation()

      if (addDatabaseRow.isPending) {
        return true
      }

      addDatabaseRow.mutate(
        {
          databaseId,
          pageId: dropPayload.pageId,
          position: getDatabaseDropPosition(databaseElement, event),
          title: dropPayload.title,
        },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error ? error.message : "Could not move page."
            )
          },
          onSuccess: () => {
            if (dropPayload.blockPayload) {
              deleteDraggedEditorBlockSource(dropPayload.blockPayload)
            }
          },
        }
      )

      return true
    },
    [addDatabaseRow]
  )
  const handleProviderLinkPaste = useCallback(
    (view: EditorView, event: ClipboardEvent) => {
      if (!editable) {
        return false
      }

      const pastedText = event.clipboardData?.getData("text/plain").trim()

      if (!pastedText || /\s/.test(pastedText) || !looksLikeUrl(pastedText)) {
        return false
      }

      const embedAttrs = normalizeEmbedUrl(pastedText)

      if (!embedAttrs) {
        return false
      }

      event.preventDefault()

      const { from, to } = view.state.selection
      const transaction = view.state.tr.insertText(pastedText, from, to)
      const insertedTo = from + pastedText.length

      view.dispatch(transaction)

      const coords = view.coordsAtPos(insertedTo)
      setPasteChoice({
        anchor: {
          getBoundingClientRect: () =>
            new DOMRect(coords.left, coords.bottom, 0, 0),
        },
        embedAttrs,
        from,
        provider:
          "provider" in embedAttrs
            ? (embedAttrs.provider as EmbedProvider)
            : null,
        to: insertedTo,
        url: normalizePastedUrl(pastedText) ?? pastedText,
      })

      return true
    },
    [editable]
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        // The app configures Link below; StarterKit's bundled Link would register a duplicate extension name.
        link: false,
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
        editable,
        nested: true,
      }),
      TextStyle,
      Link.configure({
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
        linkOnPaste: true,
        openOnClick: false,
      }),
      Color,
      BackgroundColor,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TableOfContents.configure({
        onUpdate: (items) => {
          setTocItems(items)
        },
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
      EmbedBlock,
      FileBlock,
      BookmarkBlock,
      LinkMention,
      DatabaseBlock.configure({
        currentPageId: workspaceId,
        editable,
        editorRuntime: databaseEditorRuntime,
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
      ColumnsExtension,
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
    editable,
    onUpdate: ({ editor }) => {
      if (!editable) {
        return
      }

      onContentChange?.(editor.getJSON())
    },
    editorProps: {
      attributes: {
        class: "tiptap-editor",
        "aria-label": "Document editor",
      },
      handleDrop: (view, event) =>
        dropPageOnDatabase(event) ||
        (() => {
          const target = hasDraggedEditorBlock(event)
            ? getColumnBlockDragDropTarget(view, event)
            : null

          setBlockDropLine(null)

          return target
            ? dropDraggedEditorBlockAt(view, event, target.pos)
            : false
        })() ||
        insertDraggedDatabasePage(view, event) ||
        preparePlaneBlockDrop(view, event),
      handlePaste: handleProviderLinkPaste,
      transformPastedHTML: normalizePastedEditorHTML,
      handleDOMEvents: {
        dragover: (_view, event) => {
          const hasDraggedBlock = hasDraggedEditorBlock(event)
          const isDatabaseDropTarget = Boolean(getDropDatabaseElement(event))
          const hasDraggedPage =
            hasDraggedDatabasePage(event) || hasDraggedPageBlock(event)
          const columnDropTarget = hasDraggedBlock
            ? getColumnBlockDragDropTarget(_view, event)
            : null

          setBlockDropLine(columnDropTarget?.line ?? null)

          if (!hasDraggedBlock && !hasDraggedPage) {
            return false
          }

          if (isDatabaseDropTarget && hasDraggedPage) {
            if (event.dataTransfer) {
              event.preventDefault()
              event.dataTransfer.dropEffect = "move"
            }

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
            event.dataTransfer.dropEffect = hasDraggedBlock ? "move" : "copy"
          }

          return false
        },
        dragend: () => {
          setBlockDropLine(null)
          return false
        },
        dragleave: (_view, event) => {
          if (
            event.relatedTarget instanceof Node &&
            _view.dom.contains(event.relatedTarget)
          ) {
            return false
          }

          setBlockDropLine(null)
          return false
        },
      },
    },
  })

  const replacePastedUrl = useCallback(
    (content: Content) => {
      if (!editor || !pasteChoice) {
        return
      }

      editor
        .chain()
        .focus()
        .deleteRange({ from: pasteChoice.from, to: pasteChoice.to })
        .insertContentAt(pasteChoice.from, content)
        .run()
      setPasteChoice(null)
    },
    [editor, pasteChoice]
  )

  const pasteAsEmbed = useCallback(() => {
    if (!pasteChoice) {
      return
    }

    replacePastedUrl({
      attrs: pasteChoice.embedAttrs,
      type: "embedBlock",
    })
  }, [pasteChoice, replacePastedUrl])

  const pasteAsBookmark = useCallback(async () => {
    if (!pasteChoice) {
      return
    }

    const fallbackMetadata = getFallbackBookmarkMetadata(pasteChoice.url)
    let metadata = fallbackMetadata

    try {
      metadata = {
        ...fallbackMetadata,
        ...(await fetchBookmarkMetadata(pasteChoice.url)),
      }
    } catch {
      metadata = fallbackMetadata
    }

    replacePastedUrl({
      attrs: {
        ...metadata,
        href: pasteChoice.url,
      },
      type: "bookmarkBlock",
    })
  }, [pasteChoice, replacePastedUrl])

  const pasteAsMention = useCallback(async () => {
    if (!pasteChoice) {
      return
    }

    const fallbackMetadata = getFallbackBookmarkMetadata(pasteChoice.url)
    let metadata = fallbackMetadata

    try {
      metadata = {
        ...fallbackMetadata,
        ...(await fetchBookmarkMetadata(pasteChoice.url)),
      }
    } catch {
      metadata = fallbackMetadata
    }

    replacePastedUrl([
      {
        attrs: {
          ...metadata,
          href: pasteChoice.url,
        },
        type: "linkMention",
      },
      {
        text: " ",
        type: "text",
      },
    ])
  }, [pasteChoice, replacePastedUrl])

  const pasteAsUrl = useCallback(() => {
    if (!editor || !pasteChoice) {
      return
    }

    editor
      .chain()
      .focus()
      .setTextSelection({ from: pasteChoice.from, to: pasteChoice.to })
      .setLink({ href: pasteChoice.url })
      .setTextSelection(pasteChoice.to)
      .run()
    setPasteChoice(null)
  }, [editor, pasteChoice])

  useEffect(() => {
    if (!editor) {
      return
    }

    for (const extension of editor.extensionManager.extensions) {
      if (extension.name === "databaseBlock") {
        extension.options.currentPageId = workspaceId
        extension.options.editable = editable
        extension.options.editorRuntime = databaseEditorRuntime
        extension.options.onOpenPage = onOpenPage
      }

      if (extension.name === "taskItem") {
        extension.options.editable = editable
      }

      if (extension.name === "pageBlock" || extension.name === "slashCommand") {
        extension.options.onOpenPage = onOpenPage
      }
    }

    editor.setEditable(editable)
    editorRuntimeRef.current.editable = editable
    editorRuntimeRef.current.listeners.forEach((listener) => listener())
  }, [databaseEditorRuntime, editable, editor, onOpenPage, workspaceId])

  useEffect(() => {
    if (!editor) {
      return
    }

    return registerBlockDragSource(editorId, editor)
  }, [editor, editorId])

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

  useEffect(() => {
    if (!dragHandleMenuOpen) {
      return
    }

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

  const resolveDragTargetFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!editor) {
        return null
      }

      return resolvePlaneDragTargetFromPoint({
        clientX,
        clientY,
        currentTarget: pointerDragTargetRef.current,
        view: editor.view,
      })
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
      if (dragHandleMenuOpen) {
        return
      }

      const nextTarget = resolveDragTargetFromPointer(event)

      pointerDragTargetRef.current = nextTarget

      if (!nextTarget || nextTarget.pos === dragHandlePosRef.current) {
        if (nextTarget && editor) {
          setDragHandlePosition(
            getPlaneDragHandleRect(editor.view, nextTarget)
          )
        }
        return
      }

      dragHandlePosRef.current = nextTarget.pos
      setDragHandleTarget(nextTarget)
      if (editor) {
        setDragHandlePosition(getPlaneDragHandleRect(editor.view, nextTarget))
      }
    },
    [dragHandleMenuOpen, editor, resolveDragTargetFromPointer]
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
      setDragHandlePosition(
        getPlaneDragHandleRect(editor.view, { node: source, pos: nextPos })
      )
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
        ref={editorSurfaceRef}
        onPointerLeave={() => {
          if (dragHandleMenuOpen) {
            return
          }

          pointerDragTargetRef.current = null
          dragHandlePosRef.current = null
          setDragHandleTarget(null)
          setDragHandlePosition(null)
        }}
        onClickCapture={handleMobileNodeClick}
        onPointerMoveCapture={updateDragTargetFromPointer}
      >
        {editable && editor && dragHandleTarget && dragHandlePosition ? (
          <div
            className="drag-handle"
            style={{
              left: dragHandlePosition.left,
              top: dragHandlePosition.top,
            }}
          >
            <DragBlockMenu
              editor={editor}
              editorId={editorId}
              isOpen={plusMenuOpen}
              onMenuStateChange={setDragHandleMenuOpen}
              onCreateDatabase={createEditorDatabase}
              onOpenChange={setPlusMenuOpen}
              target={dragHandleTarget}
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
            <SelectionBubbleMenu editor={editor} runCommand={runCommand} />
            <ColumnControls editor={editor} />
            <TableControls editor={editor} />
          </>
        ) : null}
        <EditorTableOfContents editor={editor} items={tocItems} />
        {pasteChoice
          ? (() => {
              const pasteChoiceRect =
                pasteChoice.anchor.getBoundingClientRect()

              return (
                <DropdownMenu
                  modal={false}
                  onOpenChange={(open) => {
                    if (!open) {
                      setPasteChoice(null)
                    }
                  }}
                  open
                >
                  <DropdownMenuTrigger asChild>
                    <span
                      aria-hidden="true"
                      className="fixed size-px opacity-0"
                      style={{
                        left: pasteChoiceRect.left,
                        top: pasteChoiceRect.bottom,
                      }}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-48"
                    collisionPadding={12}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                    side="bottom"
                    sideOffset={8}
                  >
                    <DropdownMenuLabel>Paste as</DropdownMenuLabel>
                    <DropdownMenuItem onClick={pasteAsMention}>
                      Mention
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={pasteAsBookmark}>
                      Bookmark
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={pasteAsEmbed}>
                      Embed
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={pasteAsUrl}>
                      URL
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            })()
          : null}
        <WorkspaceMetadata
          contentClassName={pageContentClassName}
          editable={editable}
          icon={emoji}
          onIconChange={onEmojiChange}
          onTitleChange={onTitleChange}
          title={title}
          workspaceId={workspaceId}
        />
        <div className={pageContentClassName}>
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

function EditorTableOfContents({
  editor,
  items,
}: {
  editor: TiptapEditor | null
  items: TableOfContentDataItem[]
}) {
  const visibleItems = items.filter((item) => item.textContent.trim())

  if (!editor || visibleItems.length === 0) {
    return null
  }

  const jumpToItem = (item: TableOfContentDataItem) => {
    const selectionPosition = Math.min(
      item.pos + 1,
      editor.state.doc.content.size
    )

    editor.commands.setTextSelection(selectionPosition)
    editor.view.dom.focus({ preventScroll: true })

    requestAnimationFrame(() => {
      item.dom.scrollIntoView({ block: "start", behavior: "smooth" })
    })
  }

  return (
    <div
      className="pointer-events-none sticky top-1/2 z-40 hidden h-0 -translate-y-1/2 md:block"
    >
      <div className="flex justify-end pr-6">
        <HoverCard openDelay={100}>
      <HoverCardTrigger asChild>
        <Button
          aria-label="Table of contents"
          className="pointer-events-auto h-auto min-h-9 w-9 flex-col gap-2 bg-transparent px-1.5 py-2"
          size="icon-lg"
          type="button"
          variant="ghost"
        >
          {visibleItems.slice(0, 7).map((item) => (
            <span
              aria-hidden="true"
              className={cn(
                "block h-0.5 rounded-full bg-muted-foreground/40",
                item.originalLevel === 1 && "w-8",
                item.originalLevel === 2 && "w-6",
                item.originalLevel === 3 && "w-4",
                item.originalLevel > 3 && "w-3",
                item.isActive && "bg-foreground"
              )}
              key={item.id}
            />
          ))}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-80 p-0" side="left">
        <Command>
          <CommandList>
            <CommandGroup>
              {visibleItems.map((item) => (
                <CommandItem
                  className={cn(
                    "truncate",
                    item.level === 2 && "pl-6",
                    item.level >= 3 && "pl-10",
                    item.isActive && "bg-muted text-foreground"
                  )}
                  key={item.id}
                  onSelect={() => jumpToItem(item)}
                  value={item.id}
                >
                  <span className="truncate">{item.textContent}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </HoverCardContent>
        </HoverCard>
      </div>
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

type EditorTableType = "columns" | "table" | "unknown"

const pastedBlockElementSelector = [
  "address",
  "article",
  "aside",
  "blockquote",
  "details",
  "div",
  "dl",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
].join(",")

function normalizePastedEditorHTML(html: string) {
  const parser = new DOMParser()
  const document = parser.parseFromString(html, "text/html")
  const restoredEmoji = restoreEmojiTextFromPastedDocument(document)
  const transformedTables = transformPastedEditorTables(document)

  return restoredEmoji || transformedTables ? document.body.innerHTML : html
}

function restoreEmojiTextFromPastedDocument(document: Document) {
  let replaced = false

  for (const emojiElement of Array.from(
    document.querySelectorAll('[data-type="emoji"]')
  )) {
    const image = emojiElement.querySelector("img")
    const emoji = image ? getEmojiFromImageSource(image) : null

    if (!emoji) {
      continue
    }

    emojiElement.replaceWith(document.createTextNode(emoji))
    replaced = true
  }

  return replaced
}

function detectEditorTableType(table: HTMLTableElement): EditorTableType {
  const rows = table.querySelectorAll("tbody > tr")
  const headers = table.querySelectorAll("th")
  const colwidthCells = table.querySelectorAll("[colwidth]")

  const hasMultipleRows = rows.length > 1
  const hasHeaders = headers.length > 0
  const hasColWidthAttrs = colwidthCells.length > 0

  if (hasHeaders || hasMultipleRows || hasColWidthAttrs) {
    return "table"
  }

  const firstRowCells = table.querySelectorAll("tbody > tr:first-child > td")

  if (rows.length === 1 && firstRowCells.length > 1) {
    return "columns"
  }

  return "unknown"
}

function transformPastedEditorTables(document: Document) {
  let transformed = false

  for (const table of Array.from(document.querySelectorAll("table"))) {
    if (!table.isConnected || table.parentElement?.closest("table")) {
      continue
    }

    if (detectEditorTableType(table) !== "columns") {
      continue
    }

    const columnBlock = createColumnBlockFromTable(document, table)

    table.replaceWith(columnBlock)
    transformed = true
  }

  return transformed
}

function createColumnBlockFromTable(
  document: Document,
  table: HTMLTableElement
) {
  const cells = Array.from(
    table.querySelectorAll<HTMLTableCellElement>("tbody > tr:first-child > td")
  )
  const widths = Array.from({ length: cells.length }, () => 100 / cells.length)
  const columnBlock = document.createElement("div")

  columnBlock.setAttribute("data-type", "columnBlock")
  columnBlock.setAttribute("data-column-count", String(cells.length))
  columnBlock.setAttribute("data-widths", JSON.stringify(widths))

  for (const cell of cells) {
    const column = document.createElement("div")

    column.setAttribute("data-type", "column")
    appendTableCellContentToColumn(document, cell, column)
    columnBlock.appendChild(column)
  }

  return columnBlock
}

function appendTableCellContentToColumn(
  document: Document,
  cell: HTMLTableCellElement,
  column: HTMLDivElement
) {
  if (!cell.textContent?.trim() && cell.children.length === 0) {
    column.appendChild(document.createElement("p"))
    return
  }

  if (cell.querySelector(pastedBlockElementSelector)) {
    while (cell.firstChild) {
      column.appendChild(cell.firstChild)
    }
    return
  }

  const paragraph = document.createElement("p")

  while (cell.firstChild) {
    paragraph.appendChild(cell.firstChild)
  }
  column.appendChild(paragraph)
}

function getEmojiFromImageSource(image: HTMLImageElement) {
  const source = image.getAttribute("src")

  if (!source) {
    return null
  }

  const match = source.match(/\/([0-9a-f-]+)\.(?:png|svg|webp)(?:[?#].*)?$/i)

  if (!match) {
    return null
  }

  try {
    return String.fromCodePoint(
      ...match[1]
        .split("-")
        .map((codepoint) => Number.parseInt(codepoint, 16))
    )
  } catch {
    return null
  }
}

function looksLikeUrl(value: string) {
  return /^(https?:\/\/|www\.|[^\s]+\.[^\s]{2,})/i.test(value.trim())
}

function normalizePastedUrl(value: string) {
  const trimmed = value.trim()

  try {
    return new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    ).toString()
  } catch {
    return null
  }
}
