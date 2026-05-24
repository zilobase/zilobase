import { Extension, type Editor, type Range } from "@tiptap/core"
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from "@tiptap/suggestion"
import {
  Bookmark,
  CheckSquare,
  Code2,
  File,
  Heading1,
  Heading2,
  Image,
  ListCollapse,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  SmilePlus,
  Table2,
  Video,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useRef } from "react"
import { createRoot, type Root } from "react-dom/client"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker"

export type SlashCommandItem = {
  title: string
  description: string
  icon: LucideIcon
  command: (props: {
    editor: Editor
    range: Range
  }) => void
}

function openSlashEmojiPicker({
  editor,
  range,
}: {
  editor: Editor
  range: Range
}) {
  const coords = editor.view.coordsAtPos(range.from)
  const container = document.createElement("div")
  const root = createRoot(container)

  const cleanup = () => {
    document.removeEventListener("mousedown", handleOutsideMouseDown)
    document.removeEventListener("keydown", handleKeyDown)
    root.unmount()
    container.remove()
  }

  const handleOutsideMouseDown = (event: MouseEvent) => {
    if (!container.contains(event.target as Node)) {
      cleanup()
    }
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      cleanup()
      editor.chain().focus().run()
    }
  }

  Object.assign(container.style, {
    left: `${coords.left}px`,
    position: "fixed",
    top: `${coords.bottom + 8}px`,
    zIndex: "60",
  })

  document.body.appendChild(container)
  document.addEventListener("mousedown", handleOutsideMouseDown)
  document.addEventListener("keydown", handleKeyDown)

  root.render(
    <div
      className="overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <EmojiPicker
        onEmojiSelect={({ emoji }) => {
          editor.chain().focus().deleteRange(range).insertEmoji(emoji).run()
          cleanup()
        }}
      >
        <EmojiPickerSearch autoFocus placeholder="Search emoji..." />
        <EmojiPickerContent />
        <EmojiPickerFooter />
      </EmojiPicker>
    </div>
  )
}

export const slashCommandItems: SlashCommandItem[] = [
  {
    title: "Text",
    description: "Plain paragraph",
    icon: Pilcrow,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("paragraph").run()
    },
  },
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: Heading1,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run()
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: Heading2,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run()
    },
  },
  {
    title: "Bullet List",
    description: "Simple unordered list",
    icon: List,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    icon: ListOrdered,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: "Task List",
    description: "Checkbox to-dos",
    icon: CheckSquare,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    title: "Quote",
    description: "Call out a passage",
    icon: Quote,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: "Code Block",
    description: "Multiline code snippet",
    icon: Code2,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: "Image",
    description: "Upload or link media",
    icon: Image,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "imageBlock" })
        .run()
    },
  },
  {
    title: "Video",
    description: "Embed or upload a video",
    icon: Video,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "videoBlock" })
        .run()
    },
  },
  {
    title: "File",
    description: "Upload or link a file",
    icon: File,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "fileBlock" })
        .run()
    },
  },
  {
    title: "Bookmark",
    description: "Save a visual web link",
    icon: Bookmark,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "bookmarkBlock" })
        .run()
    },
  },
  {
    title: "Emoji",
    description: "Insert inline emoji",
    icon: SmilePlus,
    command: ({ editor, range }) => {
      openSlashEmojiPicker({ editor, range })
    },
  },
  {
    title: "Toggle",
    description: "Collapsible content",
    icon: ListCollapse,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setDetails().run()
    },
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    icon: Minus,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
  {
    title: "Table",
    description: "3 by 3 table",
    icon: Table2,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run()
    },
  },
]

export function SlashCommandMenu({
  items,
  selectedIndex,
  setSelectedIndex,
  selectItem,
}: {
  items: SlashCommandItem[]
  selectedIndex: number
  setSelectedIndex: (index: number) => void
  selectItem: (index: number) => void
}) {
  const selectedItemRef = useRef<HTMLDivElement | null>(null)
  const selectedItem = items[selectedIndex]

  useEffect(() => {
    selectedItemRef.current?.scrollIntoView({
      block: "nearest",
    })
  }, [selectedIndex])

  return (
    <Command
      value={selectedItem?.title ?? ""}
      onValueChange={(value) => {
        const nextIndex = items.findIndex((item) => item.title === value)

        if (nextIndex >= 0) {
          setSelectedIndex(nextIndex)
        }
      }}
    >
      <CommandList>
        <CommandEmpty>No blocks found</CommandEmpty>
        <CommandGroup>
          {items.map((item, index) => {
            const Icon = item.icon

            return (
              <CommandItem
                aria-selected={index === selectedIndex}
                data-selected={index === selectedIndex ? true : undefined}
                key={item.title}
                onMouseDown={(event) => {
                  event.preventDefault()
                  selectItem(index)
                }}
                onSelect={() => selectItem(index)}
                ref={index === selectedIndex ? selectedItemRef : undefined}
                value={item.title}
              >
                <span className="slash-menu-icon">
                  <Icon />
                </span>
                <span className="min-w-0">
                  <span className="slash-menu-title">{item.title}</span>
                  <span className="slash-menu-description">
                    {item.description}
                  </span>
                </span>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

function updateMenuPosition(
  element: HTMLElement,
  props: SuggestionProps<SlashCommandItem, SlashCommandItem>
) {
  const rect = props.clientRect?.()

  if (!rect) {
    return
  }

  Object.assign(element.style, {
    left: `${rect.left}px`,
    top: `${rect.bottom + 8}px`,
  })
}

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem, SlashCommandItem>({
        editor: this.editor,
        char: "/",
        startOfLine: true,
        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },
        items: ({ query }) => {
          return slashCommandItems
            .filter((item) => {
              const search = `${item.title} ${item.description}`.toLowerCase()

              return search.includes(query.toLowerCase())
            })
            .slice(0, 8)
        },
        render: () => {
          let element: HTMLDivElement
          let root: Root
          let props: SuggestionProps<SlashCommandItem, SlashCommandItem>
          let selectedIndex = 0
          let keydownHandler: ((event: KeyboardEvent) => void) | null = null

          const selectItem = (index: number) => {
            const item = props.items[index]

            if (item) {
              props.command(item)
            }
          }

          const renderMenu = () => {
            root.render(
              <SlashCommandMenu
                items={props.items}
                setSelectedIndex={(index) => {
                  selectedIndex = index
                  renderMenu()
                }}
                selectedIndex={selectedIndex}
                selectItem={selectItem}
              />
            )
            updateMenuPosition(element, props)
          }

          const moveSelection = (direction: 1 | -1) => {
            if (props.items.length === 0) {
              return
            }

            selectedIndex =
              (selectedIndex + props.items.length + direction) %
              props.items.length
            renderMenu()
          }

          const handleMenuKeyDown = (event: KeyboardEvent) => {
            if (event.key === "ArrowUp") {
              event.preventDefault()
              event.stopPropagation()
              moveSelection(-1)
              return true
            }

            if (event.key === "ArrowDown") {
              event.preventDefault()
              event.stopPropagation()
              moveSelection(1)
              return true
            }

            if (event.key === "Home") {
              event.preventDefault()
              event.stopPropagation()
              selectedIndex = 0
              renderMenu()
              return true
            }

            if (event.key === "End") {
              event.preventDefault()
              event.stopPropagation()
              selectedIndex = Math.max(props.items.length - 1, 0)
              renderMenu()
              return true
            }

            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault()
              event.stopPropagation()
              selectItem(selectedIndex)
              return true
            }

            return false
          }

          return {
            onStart: (nextProps) => {
              props = nextProps
              selectedIndex = 0
              element = document.createElement("div")
              element.className = "slash-menu-shell"
              document.body.appendChild(element)
              root = createRoot(element)
              keydownHandler = (event) => {
                handleMenuKeyDown(event)
              }
              window.addEventListener("keydown", keydownHandler, true)
              renderMenu()
            },
            onUpdate: (nextProps) => {
              props = nextProps
              selectedIndex = Math.min(selectedIndex, props.items.length - 1)
              selectedIndex = Math.max(selectedIndex, 0)
              renderMenu()
            },
            onKeyDown: ({ event }: SuggestionKeyDownProps) => {
              if (event.key === "Escape") {
                return false
              }

              return handleMenuKeyDown(event)
            },
            onExit: () => {
              if (keydownHandler) {
                window.removeEventListener("keydown", keydownHandler, true)
              }
              root.unmount()
              element.remove()
            },
          }
        },
      }),
    ]
  },
})
