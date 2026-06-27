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
} from "lucide-react"

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
} from "@/components/ui/dropdrawer"
import { Input } from "@/components/ui/input"
import {
  slashCommandItems,
  type SlashCommandItem,
} from "@/packages/editor/extensions/slash-command"
import { SlashCommandMenu } from "@/packages/editor/extensions/slash-command-menu"

import { blockContentForItem, insertBlockFromPlus } from "./block-insert"
import {
  beginActiveBlockDrag,
  endPlaneBlockDrag,
  startPlaneBlockDrag,
} from "./block-drag"
import { colorTokens, colorWithAlpha } from "./toolbar-data"
import type { DragHandleTarget } from "./types"
import { DATABASE_PAGE_DRAG_MIME } from "@/packages/editor/extensions/database"

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
  editorId,
}: {
  editor: Editor
  editorId: string
  isOpen: boolean
  target: DragHandleTarget | null
  onOpenChange: (open: boolean) => void
  onMenuStateChange?: (open: boolean) => void
  onCreateDatabase?: () => Promise<string | null>
}) {
  const menuRootRef = useRef<HTMLDivElement | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [search, setSearch] = useState("")
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

  useEffect(() => {
    onMenuStateChange?.(isOpen || actionsOpen)
  }, [actionsOpen, isOpen, onMenuStateChange])

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
        } else if (!pointer.moved) {
          endPlaneBlockDrag(editor.view)
        }

        gripPointerRef.current = null
      }, 0)

      unbindGripPointerTracking()
    }

    gripPointerListenersRef.current = {
      onPointerCancel: handlePointerUp,
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
        chain.unsetBackgroundColor().setColor(color).run()
        return
      }

      chain.unsetColor().setBackgroundColor(colorWithAlpha(color, 0.18)).run()
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

  return (
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
              endPlaneBlockDrag(editor.view)
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

              event.stopPropagation()
              event.nativeEvent.stopImmediatePropagation()
              const didStartDrag = startPlaneBlockDrag({
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
                target.node.type.name === "pageBlock" &&
                typeof pageId === "string"
              ) {
                event.dataTransfer.setData(
                  DATABASE_PAGE_DRAG_MIME,
                  JSON.stringify({
                    pageId,
                    title: target.node.textContent || "Untitled",
                  })
                )
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
                beginActiveBlockDrag(editorId, target)
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
              <DropDrawerSubContent>
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
            <DropDrawerSubContent>
              <DropDrawerLabel>Text color</DropDrawerLabel>
              {colorTokens.map((token) => (
                <DropDrawerItem
                  key={`text-${token.name}`}
                  onSelect={() => applyColor(token.value, "text")}
                >
                  <span
                    className={`size-4 rounded-sm border bg-card ${token.textClass}`}
                  >
                    A
                  </span>
                  <span>{token.name} text</span>
                </DropDrawerItem>
              ))}
              <DropDrawerSeparator />
              <DropDrawerLabel>Background color</DropDrawerLabel>
              {colorTokens.map((token) => (
                <DropDrawerItem
                  key={`background-${token.name}`}
                  onSelect={() => applyColor(token.value, "background")}
                >
                  <span
                    className={`size-4 rounded-sm border ${token.backgroundClass}`}
                  />
                  <span>{token.name} background</span>
                </DropDrawerItem>
              ))}
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
          className="plus-block-menu slash-menu-shell"
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

              void insertBlockFromPlus(editor, target, item, { onCreateDatabase })
              onOpenChange(false)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
