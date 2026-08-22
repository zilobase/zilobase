import type { Editor as TiptapEditor } from "@tiptap/react"
import type { TableOfContentDataItem } from "@tiptap/extension-table-of-contents"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"

type EditorTableOfContentsProps = {
  editor: TiptapEditor | null
  items: TableOfContentDataItem[]
}

export function EditorTableOfContents({
  editor,
  items,
}: EditorTableOfContentsProps) {
  const visibleItems = items.filter((item) => item.textContent.trim())
  if (!editor || visibleItems.length === 0) return null

  const jumpToItem = (item: TableOfContentDataItem) => {
    const selectionPosition = Math.min(
      item.pos + 1,
      editor.state.doc.content.size
    )
    item.dom.scrollIntoView({ block: "center", behavior: "smooth" })
    editor.commands.setTextSelection(selectionPosition)
    editor.view.dom.focus({ preventScroll: true })
  }

  return (
    <div className="pointer-events-none sticky top-1/2 z-40 hidden h-0 -translate-y-1/2 md:block">
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
                    "block h-0.5 rounded-full bg-muted-indicator",
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
          <HoverCardContent
            align="end"
            className="w-72 overflow-hidden p-1.5"
            side="left"
          >
            <nav
              aria-label="Page headings"
              className="max-h-[min(28rem,70vh)] overflow-y-auto"
            >
              {visibleItems.map((item) => (
                <button
                  className={cn(
                    "flex h-9 w-full items-center rounded-md px-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                    item.level === 2 && "pl-5",
                    item.level >= 3 && "pl-8",
                    item.isActive && "bg-active text-active-foreground"
                  )}
                  key={item.id}
                  onClick={() => jumpToItem(item)}
                  title={item.textContent}
                  type="button"
                >
                  <span className="truncate">{item.textContent}</span>
                </button>
              ))}
            </nav>
          </HoverCardContent>
        </HoverCard>
      </div>
    </div>
  )
}
