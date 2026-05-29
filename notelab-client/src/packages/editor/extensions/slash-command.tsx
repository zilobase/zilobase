import { Extension, type Editor, type Range } from "@tiptap/core"
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from "@tiptap/suggestion"
import {
  Bookmark,
  CheckSquare,
  Code2,
  CodeXml,
  Database,
  File,
  Heading1,
  Heading2,
  Image,
  LinkIcon,
  ListCollapse,
  List,
  ListOrdered,
  Minus,
  NotebookTabs,
  Pilcrow,
  Quote,
  SmilePlus,
  Table2,
  Video,
} from "lucide-react"
import {
  useEffect,
  useRef,
  type ComponentType,
  type SVGProps,
} from "react"
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
import { createDatabaseBlockContent } from "@/packages/editor/extensions/database"
import {
  ExcalidrawIcon,
  FigmaIcon,
  MiroIcon,
  YouTubeIcon,
} from "@/packages/editor/extensions/embed-block"
import type { CreatedPage } from "@/packages/editor/extensions/page-block"

export type SlashCommandOptions = {
  onCreateDatabase?: () => Promise<string | null>
  onCreatePage?: () => Promise<CreatedPage>
  onOpenPage?: (pageId: string) => void
}

export type SlashCommandItem = {
  title: string
  description: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  command: (props: {
    editor: Editor
    range: Range
  }) => void | Promise<void>
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

export function createSlashCommandItems(
  options: SlashCommandOptions = {}
): SlashCommandItem[] {
  return [
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
    title: "Embed",
    description: "Embed a URL or iframe",
    icon: CodeXml,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "embedBlock" })
        .run()
    },
  },
  {
    title: "YouTube",
    description: "Embed a YouTube video",
    icon: YouTubeIcon,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "embedBlock",
          attrs: { provider: "youtube" },
        })
        .run()
    },
  },
  {
    title: "Figma",
    description: "Embed a Figma file or prototype",
    icon: FigmaIcon,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "embedBlock", attrs: { provider: "figma" } })
        .run()
    },
  },
  {
    title: "Excalidraw",
    description: "Embed an Excalidraw drawing",
    icon: ExcalidrawIcon,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "embedBlock",
          attrs: { provider: "excalidraw" },
        })
        .run()
    },
  },
  {
    title: "Miro",
    description: "Embed a Miro board",
    icon: MiroIcon,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "embedBlock",
          attrs: { provider: "miro" },
        })
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
    title: "Page",
    description: "Nested workspace page",
    icon: NotebookTabs,
    command: async ({ editor, range }) => {
      if (!options.onCreatePage) {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: "pageBlock" })
          .run()
        return
      }

      const page = await options.onCreatePage()

      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "pageBlock", attrs: { pageId: page.id } })
        .run()
      options.onOpenPage?.(page.id)
    },
  },
  {
    title: "Link to page",
    description: "Link an existing workspace page",
    icon: LinkIcon,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: "pageBlock", attrs: { openPicker: true } })
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
  {
    title: "Database",
    description: "Table where every row is a page",
    icon: Database,
    command: async ({ editor, range }) => {
      const databaseId = await options.onCreateDatabase?.()

      if (!databaseId) {
        return
      }

      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContentAt(range.from, createDatabaseBlockContent(databaseId))
        .setTextSelection(range.from + 2)
        .run()
    },
  },
]
}

export const slashCommandItems = createSlashCommandItems()

const SLASH_MENU_HEIGHT = 288
const SLASH_MENU_WIDTH = 288
const SLASH_MENU_OFFSET = 6
const SLASH_MENU_COLLISION_PADDING = 16

function getSlashCommandMenuPosition(anchorRect: DOMRect | null) {
  if (!anchorRect || typeof window === "undefined") {
    return {
      left: SLASH_MENU_COLLISION_PADDING,
      top: SLASH_MENU_COLLISION_PADDING,
    }
  }

  const spaceBelow =
    window.innerHeight - anchorRect.bottom - SLASH_MENU_COLLISION_PADDING
  const spaceAbove = anchorRect.top - SLASH_MENU_COLLISION_PADDING
  const shouldOpenAbove =
    spaceBelow < SLASH_MENU_HEIGHT + SLASH_MENU_OFFSET &&
    spaceAbove > spaceBelow
  const maxLeft = Math.max(
    SLASH_MENU_COLLISION_PADDING,
    window.innerWidth - SLASH_MENU_WIDTH - SLASH_MENU_COLLISION_PADDING
  )
  const left = Math.min(
    Math.max(anchorRect.left, SLASH_MENU_COLLISION_PADDING),
    maxLeft
  )
  const preferredTop = shouldOpenAbove
    ? anchorRect.top - SLASH_MENU_HEIGHT - SLASH_MENU_OFFSET
    : anchorRect.bottom + SLASH_MENU_OFFSET
  const maxTop = Math.max(
    SLASH_MENU_COLLISION_PADDING,
    window.innerHeight - SLASH_MENU_HEIGHT - SLASH_MENU_COLLISION_PADDING
  )
  const top = Math.min(
    Math.max(preferredTop, SLASH_MENU_COLLISION_PADDING),
    maxTop
  )

  return {
    left,
    top,
  }
}

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

function SlashCommandPopover({
  anchorRect,
  items,
  selectedIndex,
  selectItem,
  setSelectedIndex,
}: {
  anchorRect: DOMRect | null
  items: SlashCommandItem[]
  selectedIndex: number
  selectItem: (index: number) => void
  setSelectedIndex: (index: number) => void
}) {
  const position = getSlashCommandMenuPosition(anchorRect)

  return (
    <div
      className="slash-menu-shell w-72 gap-0 p-0"
      onMouseDown={(event) => event.preventDefault()}
      style={position}
    >
      <SlashCommandMenu
        items={items}
        setSelectedIndex={setSelectedIndex}
        selectedIndex={selectedIndex}
        selectItem={selectItem}
      />
    </div>
  )
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      onCreateDatabase: undefined,
      onCreatePage: undefined,
      onOpenPage: undefined,
    }
  },

  addProseMirrorPlugins() {
    const items = createSlashCommandItems(this.options)

    return [
      Suggestion<SlashCommandItem, SlashCommandItem>({
        editor: this.editor,
        char: "/",
        startOfLine: true,
        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },
        items: ({ query }) => {
          return items
            .filter((item) => {
              const search = `${item.title} ${item.description}`.toLowerCase()

              return search.includes(query.toLowerCase())
            })
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
            const rect = props.clientRect?.() ?? null

            root.render(
              <SlashCommandPopover
                anchorRect={rect}
                items={props.items}
                setSelectedIndex={(index) => {
                  selectedIndex = index
                  renderMenu()
                }}
                selectedIndex={selectedIndex}
                selectItem={selectItem}
              />
            )
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
              element.className = "slash-menu-root"
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
