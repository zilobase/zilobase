import type { Editor } from "@tiptap/react"
import { useMemo, useRef, useState } from "react"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  SlashCommandMenu,
  slashCommandItems,
  type SlashCommandItem,
} from "@/packages/editor/extensions/slash-command"

import { blockContentForItem, insertBlockFromPlus } from "./block-insert"
import { colorTokens, colorWithAlpha } from "./toolbar-data"
import type { DragHandleTarget } from "./types"

const blockCommandItems = slashCommandItems.filter(
  (item) => item.title !== "Emoji"
)

const turnIntoItems = blockCommandItems.filter((item) =>
  [
    "Text",
    "Heading 1",
    "Heading 2",
    "Bullet List",
    "Numbered List",
    "Task List",
    "Quote",
    "Code Block",
    "Toggle",
  ].includes(item.title)
)

export const dragHandleComputePositionConfig = {
  placement: "right-start",
  strategy: "absolute",
} as const

export function DragBlockMenu({
  editor,
  isOpen,
  target,
  onOpenChange,
}: {
  editor: Editor
  isOpen: boolean
  target: DragHandleTarget | null
  onOpenChange: (open: boolean) => void
}) {
  const [actionsOpen, setActionsOpen] = useState(false)
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
      const text =
        target.node.isTextblock && target.node.textContent.trim()
          ? target.node.textContent
          : ""

      if (item.title === "Text" || item.title.startsWith("Heading")) {
        const node =
          item.title === "Text"
            ? { type: "paragraph", content: text ? [{ type: "text", text }] : undefined }
            : {
                type: "heading",
                attrs: { level: item.title === "Heading 1" ? 1 : 2 },
                content: text ? [{ type: "text", text }] : undefined,
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
    <>
      <button
        aria-label="Add block below"
        className="drag-handle-plus"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
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
      <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Open block actions"
            className="drag-handle-grip"
            disabled={!target}
            onClick={(event) => {
              if (gripPointerRef.current?.moved) {
                event.preventDefault()
                gripPointerRef.current = null
                return
              }

              event.stopPropagation()
              onOpenChange(false)
              setActionsOpen(true)
              gripPointerRef.current = null
            }}
            onDragStart={(event) => event.preventDefault()}
            onPointerDownCapture={(event) => {
              if (event.button !== 0) {
                return
              }

              event.preventDefault()
              gripPointerRef.current = {
                moved: false,
                x: event.clientX,
                y: event.clientY,
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
              }
            }}
            onPointerUp={() => {
              window.setTimeout(() => {
                gripPointerRef.current = null
              }, 0)
            }}
            title="Block actions"
            type="button"
          >
            <GripVertical />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-72 p-2"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onMouseDown={(event) => {
            event.stopPropagation()
          }}
          side="right"
          sideOffset={8}
        >
          <Input
            autoComplete="off"
            className="mb-2 h-9"
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Search actions..."
            value={search}
          />
          <DropdownMenuLabel>{isPageBlock ? "Page" : "Block"}</DropdownMenuLabel>
          <DropdownMenuGroup>
            {!isPageBlock ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Type />
                  <span>Turn into</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-52">
                  {filteredTurnIntoItems.map((item) => {
                    const Icon = item.icon

                    return (
                      <DropdownMenuItem
                        key={item.title}
                        onSelect={() => turnTargetInto(item)}
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette />
                <span>Color</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuLabel>Text color</DropdownMenuLabel>
                {colorTokens.map((token) => (
                  <DropdownMenuItem
                    key={`text-${token.name}`}
                    onSelect={() => applyColor(token.value, "text")}
                  >
                    <span className={`size-4 rounded-sm border bg-card ${token.textClass}`}>
                      A
                    </span>
                    <span>{token.name} text</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Background color</DropdownMenuLabel>
                {colorTokens.map((token) => (
                  <DropdownMenuItem
                    key={`background-${token.name}`}
                    onSelect={() => applyColor(token.value, "background")}
                  >
                    <span
                      className={`size-4 rounded-sm border ${token.backgroundClass}`}
                    />
                    <span>{token.name} background</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={copyTarget}>
              <Clipboard />
              <span>Copy</span>
              <DropdownMenuShortcut>⌘C</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={duplicateTarget}>
              <Copy />
              <span>Duplicate</span>
              <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={deleteTarget} variant="destructive">
            <Trash2 />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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

              insertBlockFromPlus(editor, target, item)
              onOpenChange(false)
            }}
          />
        </div>
      ) : null}
    </>
  )
}
