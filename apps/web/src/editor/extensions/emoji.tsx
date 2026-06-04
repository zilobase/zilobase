import * as React from "react"
import { Extension } from "@tiptap/core"
import type { Editor } from "@tiptap/react"
import { SmilePlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    emoji: {
      insertEmoji: (emoji: string) => ReturnType
    }
  }
}

export const EmojiExtension = Extension.create({
  name: "emoji",

  addCommands() {
    return {
      insertEmoji:
        (emoji) =>
        ({ commands }) =>
          commands.insertContent(emoji),
    }
  },
})

export function EmojiPickerButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Insert emoji"
          aria-expanded={open}
          disabled={!editor}
          size="icon"
          title="Emoji"
          type="button"
          variant="ghost"
        >
          <SmilePlus />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto gap-0 overflow-hidden p-0"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        sideOffset={6}
      >
        <EmojiPicker
          onEmojiSelect={({ emoji }) => {
            editor?.chain().focus().insertEmoji(emoji).run()
            setOpen(false)
          }}
        >
          <EmojiPickerSearch autoFocus placeholder="Search emoji..." />
          <EmojiPickerContent />
          <EmojiPickerFooter />
        </EmojiPicker>
      </PopoverContent>
    </Popover>
  )
}
