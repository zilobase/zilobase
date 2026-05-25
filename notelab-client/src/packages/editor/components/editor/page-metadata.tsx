import { useState } from "react"
import {
  CalendarDays,
  ImagePlus,
  SmilePlus,
  UserRound,
  X,
} from "lucide-react"

import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"

type PageMetadataProps = {
  icon?: string
  onIconChange?: (icon: string) => void
  onTitleChange?: (title: string) => void
  title?: string
}

export function PageMetadata({
  icon: iconProp,
  onIconChange,
  onTitleChange,
  title: titleProp,
}: PageMetadataProps) {
  const [comment, setComment] = useState("")
  const [coverVisible, setCoverVisible] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const [localIcon, setLocalIcon] = useState("")
  const [localTitle, setLocalTitle] = useState("")
  const icon = iconProp ?? localIcon
  const title = titleProp ?? localTitle

  const updateIcon = (nextIcon: string) => {
    onIconChange?.(nextIcon)

    if (iconProp === undefined) {
      setLocalIcon(nextIcon)
    }
  }

  const updateTitle = (nextTitle: string) => {
    onTitleChange?.(nextTitle)

    if (titleProp === undefined) {
      setLocalTitle(nextTitle)
    }
  }

  const iconPicker = icon ? (
    <div className="group/icon relative shrink-0">
      <Popover open={iconOpen} onOpenChange={setIconOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label="Change page icon"
            className="flex size-11 items-center justify-center rounded-md text-3xl transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            type="button"
          >
            {icon}
          </button>
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
              updateIcon(emoji)
              setIconOpen(false)
            }}
          >
            <EmojiPickerSearch autoFocus placeholder="Search emoji..." />
            <EmojiPickerContent />
            <EmojiPickerFooter />
          </EmojiPicker>
        </PopoverContent>
      </Popover>
      <button
        aria-label="Remove page icon"
        className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none group-hover/icon:flex [&_svg]:size-3"
        onClick={() => {
          updateIcon("")
          setIconOpen(false)
        }}
        type="button"
      >
        <X />
      </button>
    </div>
  ) : (
    <Popover open={iconOpen} onOpenChange={setIconOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&_svg]:size-4"
          type="button"
        >
          <SmilePlus />
          Add icon
        </button>
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
            updateIcon(emoji)
            setIconOpen(false)
          }}
        >
          <EmojiPickerSearch autoFocus placeholder="Search emoji..." />
          <EmojiPickerContent />
          <EmojiPickerFooter />
        </EmojiPicker>
      </PopoverContent>
    </Popover>
  )

  return (
    <section contentEditable={false}>
      {coverVisible ? (
        <div className="relative h-28 bg-gradient-to-r from-stone-200 via-neutral-300 to-zinc-200 dark:from-stone-800 dark:via-neutral-700 dark:to-zinc-800">
          <button
            aria-label="Remove cover"
            className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&_svg]:size-4"
            onClick={() => setCoverVisible(false)}
            type="button"
          >
            <X />
          </button>
        </div>
      ) : null}

      <div className="px-20 py-8 sm:px-24">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {!icon ? iconPicker : null}
          {!coverVisible ? (
            <button
              className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&_svg]:size-4"
              onClick={() => setCoverVisible(true)}
              type="button"
            >
              <ImagePlus />
              Add cover
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {icon ? iconPicker : null}
          <Input
            aria-label="Page title"
            className="h-auto min-w-0 border-0 bg-transparent px-0 py-0 text-3xl font-semibold leading-tight tracking-normal text-foreground shadow-none placeholder:text-muted-foreground/40 focus-visible:ring-0 md:text-3xl dark:bg-transparent"
            onChange={(event) => updateTitle(event.target.value)}
            placeholder="New page"
            value={title}
          />
        </div>

        <div className="mt-6 grid gap-1 border-y py-2">
          <div className="grid min-h-8 grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
              <UserRound />
              Owner
            </span>
            <button
              className="min-w-0 rounded-md px-2 py-1 text-left text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              type="button"
            >
              Empty
            </button>
          </div>
          <div className="grid min-h-8 grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
              <CalendarDays />
              Date
            </span>
            <button
              className="min-w-0 rounded-md px-2 py-1 text-left text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              type="button"
            >
              Empty
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3">
          <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-medium text-muted-foreground">
            S
          </span>
          <Textarea
            aria-label="Page comment"
            className="min-h-8 border-0 bg-transparent px-0 py-1 text-sm shadow-none focus-visible:ring-0 md:text-sm"
            onChange={(event) => setComment(event.target.value)}
            placeholder="Add a comment..."
            value={comment}
          />
        </div>
      </div>
    </section>
  )
}
