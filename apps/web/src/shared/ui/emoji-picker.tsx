import * as React from "react"
import { EmojiPicker as FrimousseEmojiPicker } from "frimousse"
import type {
  Emoji,
  EmojiPickerListCategoryHeaderProps,
  EmojiPickerListEmojiProps,
  EmojiPickerListRowProps,
} from "frimousse"

import { cn } from "@/shared/lib/utils"

function EmojiPicker({
  className,
  columns = 9,
  ...props
}: React.ComponentProps<typeof FrimousseEmojiPicker.Root>) {
  return (
    <FrimousseEmojiPicker.Root
      className={cn(
        "isolate flex h-[342px] w-72 flex-col bg-surface-overlay text-content-primary",
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
        "mx-2 mt-2 h-8 rounded-md border border-control-border bg-control-background px-2.5 text-sm outline-none placeholder:text-content-secondary focus-visible:border-action-focus-ring focus-visible:ring-2 focus-visible:ring-action-focus-ring dark:bg-control-background",
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
      <FrimousseEmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-content-secondary">
        Loading...
      </FrimousseEmojiPicker.Loading>
      <FrimousseEmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-content-secondary">
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
        "flex h-10 items-center gap-2 border-t px-2 text-xs text-content-secondary",
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
      <FrimousseEmojiPicker.SkinToneSelector className="ml-auto flex size-7 items-center justify-center rounded-md hover:bg-action-neutral-hover hover:text-action-on-neutral focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none active:bg-action-neutral-pressed" />
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
        "bg-surface-overlay px-3 py-1.5 text-xs font-medium text-content-secondary backdrop-blur",
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
        "flex aspect-square size-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-action-neutral-hover data-[active]:bg-action-neutral-hover focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none active:bg-action-neutral-pressed",
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
