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
  const [activeSubmenu, setActiveSubmenu] = useState<"turnInto" | "color" | null>(
    null
  )
  const [search, setSearch] = useState("")
  const gripPointerRef = useRef<{
    moved: boolean
    x: number
    y: number
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

      setActiveSubmenu(null)
      onOpenChange(false)
    }

    document.addEventListener("mousedown", close)

    return () => {
      document.removeEventListener("mousedown", close)
    }
  }, [isOpen, onOpenChange])

  useEffect(() => {
    if (!actionsOpen) {
      return
    }

    const close = () => setActionsOpen(false)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close()
      }
    }

    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [actionsOpen])

  const runTargetCommand = (command: () => void) => {
    if (!target) {
      return
    }

    command()
    setActionsOpen(false)
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
          setActionsOpen(false)
          setActiveSubmenu(null)
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
      <span
        aria-label="Open block actions"
        className="drag-handle-grip"
        draggable
        onClick={(event) => {
          if (!target || gripPointerRef.current?.moved) {
            gripPointerRef.current = null
            return
          }

          event.stopPropagation()
          onOpenChange(false)
          setActiveSubmenu(null)
          setActionsOpen(true)
          gripPointerRef.current = null
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return
          }

          event.stopPropagation()
          event.nativeEvent.stopImmediatePropagation()
          gripPointerRef.current = {
            moved: false,
            x: event.clientX,
            y: event.clientY,
          }

          if (target) {
            beginActiveBlockDrag(editorId, target)
          }
        }}
        onPointerMove={(event) => {
          const pointer = gripPointerRef.current

          if (!pointer) {
            return
          }

          const deltaX = Math.abs(event.clientX - pointer.x)
          const deltaY = Math.abs(event.clientY - pointer.y)

          if (deltaX > 4 || deltaY > 4) {
            pointer.moved = true
            setActionsOpen(false)
          }
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

          const pageId = target.node.attrs.pageId

          if (target.node.type.name === "pageBlock" && typeof pageId === "string") {
            event.dataTransfer.setData(
              DATABASE_PAGE_DRAG_MIME,
              JSON.stringify({
                pageId,
                title: target.node.textContent || "Untitled",
              })
            )
          }
        }}
        onDragEnd={() => endPlaneBlockDrag(editor.view)}
        onPointerUp={() => {
          window.setTimeout(() => {
            if (!gripPointerRef.current?.moved) {
              endPlaneBlockDrag(editor.view)
            }

            gripPointerRef.current = null
          }, 0)
        }}
        role="button"
        tabIndex={0}
        title="Block actions"
      >
        <GripVertical />
      </span>
      {actionsOpen ? (
        <div
          className="absolute left-full top-0 z-50 ml-2 w-72 rounded-lg bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <Input
            autoComplete="off"
            className="mb-2 h-9"
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Search actions..."
            value={search}
          />
          <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
            {isPageBlock ? "Page" : "Block"}
          </div>
          <div className="grid gap-0.5">
            {!isPageBlock ? (
              <div className="relative" onMouseEnter={() => setActiveSubmenu("turnInto")}>
                <button
                  className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
                  type="button"
                >
                  <Type />
                  <span>Turn into</span>
                  <span className="ml-auto text-muted-foreground">›</span>
                </button>
                {activeSubmenu === "turnInto" ? (
                  <div className="absolute left-full top-0 z-50 ml-2 w-52 rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
                  {filteredTurnIntoItems.map((item) => {
                    const Icon = item.icon

                    return (
                      <button
                        className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
                        key={item.title}
                        onClick={() => turnTargetInto(item)}
                        type="button"
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </button>
                    )
                  })}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="relative" onMouseEnter={() => setActiveSubmenu("color")}>
              <button
                className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
                type="button"
              >
                <Palette />
                <span>Color</span>
                <span className="ml-auto text-muted-foreground">›</span>
              </button>
              {activeSubmenu === "color" ? (
                <div className="absolute left-full top-0 z-50 ml-2 w-56 rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
                <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
                  Text color
                </div>
                {colorTokens.map((token) => (
                  <button
                    className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
                    key={`text-${token.name}`}
                    onClick={() => applyColor(token.value, "text")}
                    type="button"
                  >
                    <span className={`size-4 rounded-sm border bg-card ${token.textClass}`}>
                      A
                    </span>
                    <span>{token.name} text</span>
                  </button>
                ))}
                <div className="-mx-1 my-1 h-px bg-border" />
                <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
                  Background color
                </div>
                {colorTokens.map((token) => (
                  <button
                    className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
                    key={`background-${token.name}`}
                    onClick={() => applyColor(token.value, "background")}
                    type="button"
                  >
                    <span
                      className={`size-4 rounded-sm border ${token.backgroundClass}`}
                    />
                    <span>{token.name} background</span>
                  </button>
                ))}
              </div>
              ) : null}
            </div>
          </div>
          <div className="-mx-1 my-1 h-px bg-border" />
          <div className="grid gap-0.5">
            <button
              className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
              onClick={copyTarget}
              type="button"
            >
              <Clipboard />
              <span>Copy</span>
              <span className="ml-auto text-xs tracking-widest text-muted-foreground">
                ⌘C
              </span>
            </button>
            <button
              className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
              onClick={duplicateTarget}
              type="button"
            >
              <Copy />
              <span>Duplicate</span>
              <span className="ml-auto text-xs tracking-widest text-muted-foreground">
                ⌘D
              </span>
            </button>
          </div>
          <div className="-mx-1 my-1 h-px bg-border" />
          <button
            className="flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-sm text-destructive outline-none hover:bg-destructive/10 focus-visible:bg-destructive/10"
            onClick={deleteTarget}
            type="button"
          >
            <Trash2 />
            <span>Delete</span>
          </button>
        </div>
      ) : null}
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
