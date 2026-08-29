import type { Editor } from "@tiptap/react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  Clipboard,
  Copy,
  GripVertical,
  Palette,
  Plus,
  Trash2,
  Type,
} from "@/shared/components/icons"

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerShortcut,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer"
import { Input } from "@/shared/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import {
  slashCommandItems,
  type SlashCommandItem,
} from "@/packages/editor/extensions/slash-command"
import { SlashCommandMenu } from "@/packages/editor/extensions/slash-command-menu"
import { getSelectedBlockRangesForTarget } from "../../extensions/block-selection"

import { blockContentForItem, insertBlockFromPlus } from "./block-insert"
import {
  armBlockDrag,
  endBlockDrag,
  startBlockDrag,
} from "./block-drag"
import { colorWithAlpha, getPaletteColor } from "@/shared/lib/color-tokens"
import { setDatabasePageDragPayload } from "@/packages/editor/extensions/database/interactions/database-page-drop"
import type { DragHandleTarget } from "./types"
import type {
  StructuralBlockDeleteAction,
  StructuralBlockDeleteRequest,
} from "../../types"
import { toast } from "sonner"
import { ColorPicker } from "./color-menu"

type PendingStructuralBlockDelete = StructuralBlockDeleteRequest & {
  action: StructuralBlockDeleteAction
  pos: number
}

function findStructuralBlock(
  editor: Editor,
  target: PendingStructuralBlockDelete,
) {
  const idAttribute = target.type === "database" ? "databaseId" : "meetingId"
  const nodeAtOriginalPosition = editor.state.doc.nodeAt(target.pos)

  if (nodeAtOriginalPosition?.attrs[idAttribute] === target.id) {
    return { node: nodeAtOriginalPosition, pos: target.pos }
  }

  let match: { node: typeof nodeAtOriginalPosition; pos: number } | null = null

  editor.state.doc.descendants((node, pos) => {
    if (node.attrs[idAttribute] !== target.id) {
      return match === null
    }

    match = { node, pos }
    return false
  })

  return match
}

const blockCommandItems = slashCommandItems.filter(
  (item) => item.title !== "Emoji"
)

const turnIntoItems = blockCommandItems.filter((item) =>
  [
    "Text",
    "Heading 1",
    "Heading 2",
    "Heading 3",
    "Bullet List",
    "Numbered List",
    "Task List",
    "Quote",
    "Code Block",
    "Toggle",
  ].includes(item.title)
)

const headingLevelByTitle: Record<string, 1 | 2 | 3> = {
  "Heading 1": 1,
  "Heading 2": 2,
  "Heading 3": 3,
}

export function DragBlockMenu({
  editor,
  isOpen,
  target,
  onOpenChange,
  onMenuStateChange,
  onCreateDatabase,
  onCreateMeeting,
  editorId,
  getStructuralBlockDeleteAction,
  onDeleteStructuralBlock,
}: {
  editor: Editor
  editorId: string
  isOpen: boolean
  target: DragHandleTarget | null
  onOpenChange: (open: boolean) => void
  onMenuStateChange?: (open: boolean) => void
  onCreateDatabase?: () => Promise<string | null>
  onCreateMeeting?: () => Promise<string | null>
  getStructuralBlockDeleteAction?: (
    request: StructuralBlockDeleteRequest,
  ) => StructuralBlockDeleteAction
  onDeleteStructuralBlock?: (
    request: StructuralBlockDeleteRequest,
  ) => Promise<void>
}) {
  const menuRootRef = useRef<HTMLDivElement | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [pendingDelete, setPendingDelete] =
    useState<PendingStructuralBlockDelete | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const gripPointerRef = useRef<{
    moved: boolean
    x: number
    y: number
  } | null>(null)
  const suppressGripMenuOpenRef = useRef(false)
  const gripPointerListenersRef = useRef<{
    onPointerCancel: (event: PointerEvent) => void
    onPointerMove: (event: PointerEvent) => void
    onPointerUp: (event: PointerEvent) => void
  } | null>(null)
  const filteredTurnIntoItems = useMemo(
    () =>
      turnIntoItems.filter((item) =>
        item.title.toLowerCase().includes(search.trim().toLowerCase())
      ),
    [search]
  )
  const isPageBlock = target?.node.type.name === "pageBlock"
  const targetColors = useMemo(() => {
    if (!target) {
      return { backgroundColor: null, textColor: null }
    }

    if (target.node.type.name === "pageBlock") {
      return {
        backgroundColor:
          typeof target.node.attrs.backgroundColor === "string"
            ? target.node.attrs.backgroundColor
            : null,
        textColor:
          typeof target.node.attrs.textColor === "string"
            ? target.node.attrs.textColor
            : null,
      }
    }

    const backgroundColors = new Set<string | null>()
    const textColors = new Set<string | null>()

    target.node.descendants((node) => {
      if (!node.isText) {
        return
      }

      const textStyle = node.marks.find(
        (mark) => mark.type.name === "textStyle",
      )
      backgroundColors.add(
        typeof textStyle?.attrs.backgroundColor === "string"
          ? textStyle.attrs.backgroundColor
          : null,
      )
      textColors.add(
        typeof textStyle?.attrs.color === "string" ? textStyle.attrs.color : null,
      )
    })

    return {
      backgroundColor:
        backgroundColors.size < 2
          ? ([...backgroundColors][0] ?? null)
          : undefined,
      textColor:
        textColors.size < 2 ? ([...textColors][0] ?? null) : undefined,
    }
  }, [target])

  useEffect(() => {
    onMenuStateChange?.(isOpen || actionsOpen || pendingDelete !== null)
  }, [actionsOpen, isOpen, onMenuStateChange, pendingDelete])

  useEffect(() => {
    return () => {
      onMenuStateChange?.(false)
    }
  }, [onMenuStateChange])

  useEffect(() => {
    return () => {
      const listeners = gripPointerListenersRef.current

      if (!listeners) {
        return
      }

      document.removeEventListener("pointermove", listeners.onPointerMove)
      document.removeEventListener("pointerup", listeners.onPointerUp)
      document.removeEventListener("pointercancel", listeners.onPointerCancel)
      gripPointerListenersRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const close = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        menuRootRef.current?.contains(event.target)
      ) {
        return
      }

      onOpenChange(false)
    }

    document.addEventListener("mousedown", close)

    return () => {
      document.removeEventListener("mousedown", close)
    }
  }, [isOpen, onOpenChange])

  const handleActionsOpenChange = (open: boolean) => {
    if (open) {
      if (!target || suppressGripMenuOpenRef.current) {
        return
      }

      onOpenChange(false)
    } else {
      setSearch("")
    }

    setActionsOpen(open)
  }

  const openGripActionsMenu = () => {
    if (!target || suppressGripMenuOpenRef.current) {
      return
    }

    onOpenChange(false)
    setActionsOpen(true)
  }

  const markGripDragInteraction = () => {
    suppressGripMenuOpenRef.current = true
    const pointer = gripPointerRef.current

    if (pointer) {
      pointer.moved = true
    }

    setActionsOpen(false)
  }

  const unbindGripPointerTracking = () => {
    const listeners = gripPointerListenersRef.current

    if (!listeners) {
      return
    }

    document.removeEventListener("pointermove", listeners.onPointerMove)
    document.removeEventListener("pointerup", listeners.onPointerUp)
    document.removeEventListener("pointercancel", listeners.onPointerCancel)
    gripPointerListenersRef.current = null
  }

  const bindGripPointerTracking = () => {
    unbindGripPointerTracking()

    const handlePointerMove = (event: PointerEvent) => {
      const pointer = gripPointerRef.current

      if (!pointer) {
        return
      }

      const deltaX = Math.abs(event.clientX - pointer.x)
      const deltaY = Math.abs(event.clientY - pointer.y)

      if (deltaX > 4 || deltaY > 4) {
        markGripDragInteraction()
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (event.button !== 0) {
        return
      }

      const pointer = gripPointerRef.current

      if (!pointer) {
        unbindGripPointerTracking()
        return
      }

      window.setTimeout(() => {
        if (!pointer.moved && !suppressGripMenuOpenRef.current) {
          openGripActionsMenu()
        }

        if (!pointer.moved) {
          endBlockDrag(editor.view)
        }

        gripPointerRef.current = null
      }, 0)

      unbindGripPointerTracking()
    }

    const handlePointerCancel = () => {
      gripPointerRef.current = null
      endBlockDrag(editor.view)
      unbindGripPointerTracking()
    }

    gripPointerListenersRef.current = {
      onPointerCancel: handlePointerCancel,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    }

    document.addEventListener("pointermove", handlePointerMove)
    document.addEventListener("pointerup", handlePointerUp)
    document.addEventListener("pointercancel", handlePointerUp)
  }

  const runTargetCommand = (command: () => void) => {
    if (!target) {
      return
    }

    command()
    handleActionsOpenChange(false)
  }

  const selectTarget = () => {
    if (!target) {
      return false
    }

    editor
      .chain()
      .focus()
      .setNodeSelection(target.pos)
      .run()

    return true
  }

  const turnTargetInto = (item: SlashCommandItem) => {
    runTargetCommand(() => {
      if (!target) {
        return
      }

      const content = blockContentForItem(item)

      if (!content) {
        return
      }
      const text =
        target.node.isTextblock && target.node.textContent.trim()
          ? target.node.textContent
          : ""

      if (item.title === "Text" || item.title.startsWith("Heading")) {
        const textContent = text ? [{ type: "text", text }] : undefined
        const node =
          item.title === "Text"
            ? { type: "paragraph", content: textContent }
            : {
                type: "heading",
                attrs: { level: headingLevelByTitle[item.title] ?? 3 },
                content: textContent,
              }

        editor
          .chain()
          .focus()
          .deleteRange({
            from: target.pos,
            to: target.pos + target.node.nodeSize,
          })
          .insertContentAt(target.pos, node)
          .run()
        return
      }

      editor
        .chain()
        .focus()
        .deleteRange({
          from: target.pos,
          to: target.pos + target.node.nodeSize,
        })
        .insertContentAt(target.pos, content)
        .run()
    })
  }

  const applyColor = (
    color: string | null,
    variant: "text" | "background"
  ) => {
    runTargetCommand(() => {
      if (!target) {
        return
      }

      if (target.node.type.name === "pageBlock") {
        editor
          .chain()
          .focus()
          .setNodeSelection(target.pos)
          .updateAttributes("pageBlock", {
            backgroundColor: variant === "background" ? color : null,
            textColor: variant === "text" ? color : null,
          })
          .run()
        return
      }

      if (target.node.isAtom) {
        return
      }

      const from = target.pos + 1
      const to = target.pos + target.node.nodeSize - 1
      const chain = editor.chain().focus().setTextSelection({ from, to })

      if (!color) {
        chain.unsetColor().unsetBackgroundColor().run()
        return
      }

      if (variant === "text") {
        chain
          .unsetBackgroundColor()
          .setColor(getPaletteColor(color)!)
          .run()
        return
      }

      chain.unsetColor().setBackgroundColor(colorWithAlpha(color, 0.18)!).run()
    })
  }

  const duplicateTarget = () => {
    runTargetCommand(() => {
      if (!target) {
        return
      }

      editor
        .chain()
        .focus()
        .insertContentAt(target.pos + target.node.nodeSize, target.node.toJSON())
        .run()
    })
  }

  const copyTarget = () => {
    runTargetCommand(() => {
      if (!target || !selectTarget()) {
        return
      }

      document.execCommand("copy")
    })
  }

  const deleteTarget = () => {
    if (target?.node.type.name === "databaseBlock") {
      const id = target.node.attrs.databaseId

      if (typeof id === "string" && id) {
        const request = { id, type: "database" as const }
        setPendingDelete({
          ...request,
          action:
            getStructuralBlockDeleteAction?.(request) ?? "move-to-trash",
          pos: target.pos,
        })
        handleActionsOpenChange(false)
        return
      }
    }

    if (target?.node.type.name === "meetingBlock") {
      const id = target.node.attrs.meetingId

      if (typeof id === "string" && id) {
        const request = { id, type: "meeting" as const }
        setPendingDelete({
          ...request,
          action:
            getStructuralBlockDeleteAction?.(request) ?? "move-to-trash",
          pos: target.pos,
        })
        handleActionsOpenChange(false)
        return
      }
    }

    runTargetCommand(() => {
      if (!target) {
        return
      }

      editor
        .chain()
        .focus()
        .deleteRange({
          from: target.pos,
          to: target.pos + target.node.nodeSize,
        })
        .run()
    })
  }

  const confirmStructuralBlockDelete = async () => {
    if (!pendingDelete || deletePending) {
      return
    }

    setDeletePending(true)

    try {
      if (!onDeleteStructuralBlock) {
        throw new Error("This block cannot be deleted from this editor.")
      }

      await onDeleteStructuralBlock({
        id: pendingDelete.id,
        type: pendingDelete.type,
      })

      const match = findStructuralBlock(editor, pendingDelete)

      if (match?.node) {
        editor
          .chain()
          .focus()
          .deleteRange({
            from: match.pos,
            to: match.pos + match.node.nodeSize,
          })
          .run()
      }

      setPendingDelete(null)
      toast.success(
        pendingDelete.action === "remove-link"
          ? "Removed from page."
          : "Moved to trash.",
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not delete ${pendingDelete.type}.`,
      )
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <>
      <div className="contents" ref={menuRootRef}>
      <button
        aria-label="Add block below"
        className="drag-handle-plus"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          handleActionsOpenChange(false)
          onOpenChange(!isOpen)
        }}
        onDragStart={(event) => event.preventDefault()}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        title="Add block"
        type="button"
      >
        <Plus />
      </button>
      <DropDrawer onOpenChange={handleActionsOpenChange} open={actionsOpen}>
        <div className="drag-handle-grip relative">
          <DropDrawerTrigger asChild>
            <span
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              tabIndex={-1}
            />
          </DropDrawerTrigger>
          <span
            aria-expanded={actionsOpen}
            aria-haspopup="menu"
            aria-label="Open block actions"
            className="absolute inset-0 flex cursor-grab items-center justify-center active:cursor-grabbing"
            draggable
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onDragEnd={() => {
              endBlockDrag(editor.view)
              markGripDragInteraction()
              window.setTimeout(() => {
                suppressGripMenuOpenRef.current = false
              }, 300)
            }}
            onDragStart={(event) => {
              if (!target) {
                event.preventDefault()
                return
              }

              const { doc, selection } = editor.state
              const draggingMultipleBlocks =
                getSelectedBlockRangesForTarget(
                  doc,
                  selection.from,
                  selection.to,
                  target.pos,
                ).length > 1

              event.stopPropagation()
              event.nativeEvent.stopImmediatePropagation()
              const didStartDrag = startBlockDrag({
                editorId,
                event: event.nativeEvent,
                target,
                view: editor.view,
              })

              if (!didStartDrag) {
                event.preventDefault()
                return
              }

              markGripDragInteraction()

              const pageId = target.node.attrs.pageId

              if (
                !draggingMultipleBlocks &&
                target.node.type.name === "pageBlock" &&
                typeof pageId === "string"
              ) {
                setDatabasePageDragPayload(event.dataTransfer, {
                  pageId,
                  title: target.node.textContent || "Untitled",
                })
              }
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") {
                return
              }

              event.preventDefault()
              openGripActionsMenu()
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return
              }

              event.stopPropagation()
              event.nativeEvent.stopImmediatePropagation()
              suppressGripMenuOpenRef.current = false
              gripPointerRef.current = {
                moved: false,
                x: event.clientX,
                y: event.clientY,
              }
              bindGripPointerTracking()

              if (target) {
                armBlockDrag(editorId, target)
              }
            }}
            role="button"
            tabIndex={0}
            title="Block actions"
          >
            <GripVertical />
          </span>
        </div>
        <DropDrawerContent
          align="start"
          className="w-72"
          onCloseAutoFocus={(event) => event.preventDefault()}
          side="right"
          sideOffset={8}
        >
          <div className="flex items-center gap-1.5 px-1.5 py-1">
            <Input
              aria-label="Search block actions"
              autoComplete="off"
              className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm font-medium shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Search actions..."
              value={search}
            />
          </div>
          <DropDrawerSeparator />
          <DropDrawerLabel>{isPageBlock ? "Page" : "Block"}</DropDrawerLabel>
          {!isPageBlock ? (
            <DropDrawerSub>
              <DropDrawerSubTrigger>
                <Type />
                <span>Turn into</span>
              </DropDrawerSubTrigger>
              <DropDrawerSubContent className="w-64">
                {filteredTurnIntoItems.length > 0 ? (
                  filteredTurnIntoItems.map((item) => {
                    const Icon = item.icon

                    return (
                      <DropDrawerItem
                        key={item.title}
                        onSelect={() => turnTargetInto(item)}
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </DropDrawerItem>
                    )
                  })
                ) : (
                  <DropDrawerItem disabled>No matching block types.</DropDrawerItem>
                )}
              </DropDrawerSubContent>
            </DropDrawerSub>
          ) : null}
          <DropDrawerSub>
            <DropDrawerSubTrigger>
              <Palette />
              <span>Color</span>
            </DropDrawerSubTrigger>
            <DropDrawerSubContent className="w-64 p-2">
              <ColorPicker
                backgroundColor={targetColors.backgroundColor}
                onBackgroundColorSelect={(color) =>
                  applyColor(color, "background")
                }
                onTextColorSelect={(color) => applyColor(color, "text")}
                textColor={targetColors.textColor}
              />
            </DropDrawerSubContent>
          </DropDrawerSub>
          <DropDrawerSeparator />
          <DropDrawerItem onSelect={copyTarget}>
            <Clipboard />
            <span>Copy</span>
            <DropDrawerShortcut>⌘C</DropDrawerShortcut>
          </DropDrawerItem>
          <DropDrawerItem onSelect={duplicateTarget}>
            <Copy />
            <span>Duplicate</span>
            <DropDrawerShortcut>⌘D</DropDrawerShortcut>
          </DropDrawerItem>
          <DropDrawerSeparator />
          <DropDrawerItem onSelect={deleteTarget} variant="destructive">
            <Trash2 />
            <span>Delete</span>
          </DropDrawerItem>
        </DropDrawerContent>
      </DropDrawer>
      {isOpen && target ? (
        <div
          className="plus-block-menu w-72 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-md"
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
        >
          <SlashCommandMenu
            items={blockCommandItems}
            selectedIndex={0}
            setSelectedIndex={() => undefined}
            selectItem={(index) => {
              const item = blockCommandItems[index]

              if (!item) {
                return
              }

              void insertBlockFromPlus(editor, target, item, {
                onCreateDatabase,
                onCreateMeeting,
              })
              onOpenChange(false)
            }}
          />
        </div>
      ) : null}
      </div>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !deletePending) setPendingDelete(null)
        }}
        open={pendingDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.action === "remove-link"
                ? "Remove from this page?"
                : "Move to trash?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.action === "remove-link"
                ? "This linked database view will be removed from this page. The source database will remain available."
                : pendingDelete?.type === "meeting"
                  ? "This meeting and its notes will be moved to trash."
                  : "This database and its row pages will be moved to trash."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePending}
              onClick={(event) => {
                event.preventDefault()
                void confirmStructuralBlockDelete()
              }}
              variant="destructive"
            >
              {pendingDelete?.action === "remove-link" ? "Remove" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
