import * as React from "react"
import { EmojiPicker as FrimousseEmojiPicker } from "frimousse"
import type {
  Emoji,
  EmojiPickerListCategoryHeaderProps,
  EmojiPickerListEmojiProps,
  EmojiPickerListRowProps,
} from "frimousse"

import { cn } from "@/lib/utils"

function EmojiPicker({
  className,
  columns = 9,
  ...props
}: React.ComponentProps<typeof FrimousseEmojiPicker.Root>) {
  return (
    <FrimousseEmojiPicker.Root
      className={cn(
        "isolate flex h-[342px] w-72 flex-col bg-popover text-popover-foreground",
        className
      )}
      columns={columns}
      {...props}
    />
  )
}

function EmojiPickerSearch({
  className,
  ...props
}: React.ComponentProps<typeof FrimousseEmojiPicker.Search>) {
  return (
    <FrimousseEmojiPicker.Search
      className={cn(
        "mx-2 mt-2 h-8 rounded-md border border-input bg-input/20 px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

function EmojiPickerContent({
  className,
  ...props
}: React.ComponentProps<typeof FrimousseEmojiPicker.Viewport>) {
  return (
    <FrimousseEmojiPicker.Viewport
      className={cn("relative flex-1 outline-none", className)}
      {...props}
    >
      <FrimousseEmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
        Loading...
      </FrimousseEmojiPicker.Loading>
      <FrimousseEmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
        No emoji found.
      </FrimousseEmojiPicker.Empty>
      <FrimousseEmojiPicker.List
        className="select-none pb-2"
        components={{
          CategoryHeader: EmojiPickerCategoryHeader,
          Emoji: EmojiPickerEmoji,
          Row: EmojiPickerRow,
        }}
      />
    </FrimousseEmojiPicker.Viewport>
  )
}

function EmojiPickerFooter({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-10 items-center gap-2 border-t px-2 text-xs text-muted-foreground",
        className
      )}
    >
      <FrimousseEmojiPicker.ActiveEmoji>
        {({ emoji }) =>
          emoji ? (
            <>
              <span className="text-lg leading-none">{emoji.emoji}</span>
              <span className="min-w-0 truncate">{emoji.label}</span>
            </>
          ) : (
            <span>Select an emoji</span>
          )
        }
      </FrimousseEmojiPicker.ActiveEmoji>
      <FrimousseEmojiPicker.SkinToneSelector className="ml-auto flex size-7 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none" />
    </div>
  )
}

function EmojiPickerCategoryHeader({
  category,
  className,
  ...props
}: EmojiPickerListCategoryHeaderProps) {
  return (
    <div
      className={cn(
        "bg-popover/95 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur",
        className
      )}
      {...props}
    >
      {category.label}
    </div>
  )
}

function EmojiPickerEmoji({
  emoji,
  className,
  ...props
}: EmojiPickerListEmojiProps) {
  return (
    <button
      className={cn(
        "flex aspect-square size-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-muted data-[active]:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
        className
      )}
      type="button"
      {...props}
    >
      {emoji.emoji}
    </button>
  )
}

function EmojiPickerRow({
  className,
  ...props
}: EmojiPickerListRowProps) {
  return <div className={cn("grid grid-cols-9 px-2", className)} {...props} />
}

export {
  EmojiPicker,
  EmojiPickerSearch,
  EmojiPickerContent,
  EmojiPickerFooter,
}
export type { Emoji }
