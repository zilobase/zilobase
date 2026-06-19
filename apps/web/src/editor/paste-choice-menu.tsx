import type { Editor as TiptapEditor } from "@tiptap/react"
import type { Content } from "@tiptap/core"
import { useCallback } from "react"
import {
  fetchBookmarkMetadata,
  getFallbackBookmarkMetadata,
} from "@/packages/editor/extensions/bookmark-block"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { PasteChoiceState } from "./types"

type PasteChoiceMenuProps = {
  editor: TiptapEditor | null
  pasteChoice: PasteChoiceState
  onClose: () => void
}

export function PasteChoiceMenu({
  editor,
  pasteChoice,
  onClose,
}: PasteChoiceMenuProps) {
  const replacePastedUrl = useCallback(
    (content: Content) => {
      if (!editor) return
      editor
        .chain()
        .focus()
        .deleteRange({ from: pasteChoice.from, to: pasteChoice.to })
        .insertContentAt(pasteChoice.from, content)
        .run()
      onClose()
    },
    [editor, onClose, pasteChoice.from, pasteChoice.to]
  )

  const pasteAsBookmarkOrMention = useCallback(
    async (type: "bookmarkBlock" | "linkMention") => {
      const fallback = getFallbackBookmarkMetadata(pasteChoice.url)
      let metadata = fallback
      try {
        metadata = { ...fallback, ...(await fetchBookmarkMetadata(pasteChoice.url)) }
      } catch {
        // Keep fallback metadata when bookmark fetch fails.
      }
      const block = {
        attrs: { ...metadata, href: pasteChoice.url },
        type,
      }
      replacePastedUrl(
        type === "linkMention" ? [block, { text: " ", type: "text" }] : block
      )
    },
    [pasteChoice.url, replacePastedUrl]
  )

  const pasteAsUrl = useCallback(() => {
    if (!editor) return
    editor
      .chain()
      .focus()
      .setTextSelection({ from: pasteChoice.from, to: pasteChoice.to })
      .setLink({ href: pasteChoice.url })
      .setTextSelection(pasteChoice.to)
      .run()
    onClose()
  }, [editor, onClose, pasteChoice.from, pasteChoice.to, pasteChoice.url])

  const pasteChoiceRect = pasteChoice.anchor.getBoundingClientRect()

  return (
    <DropdownMenu modal={false} onOpenChange={(open) => !open && onClose()} open>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="fixed size-px opacity-0"
          style={{ left: pasteChoiceRect.left, top: pasteChoiceRect.bottom }}
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
        <DropdownMenuItem onClick={() => pasteAsBookmarkOrMention("linkMention")}>
          Mention
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => pasteAsBookmarkOrMention("bookmarkBlock")}>
          Bookmark
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            replacePastedUrl({ attrs: pasteChoice.embedAttrs, type: "embedBlock" })
          }
        >
          Embed
        </DropdownMenuItem>
        <DropdownMenuItem onClick={pasteAsUrl}>URL</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}