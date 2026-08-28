import * as React from "react"
import { Bold, ChevronRight, PanelTop } from "@/components/icons"

import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker"
import { IconUploadPicker } from "@/components/ui/icon-upload-picker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PhosphorPickerWeight } from "@/components/ui/phosphor-icon-picker"
import { cn } from "@/lib/utils"
import type { PageIconPosition } from "@zilobase/features/pages"

const PhosphorIconPicker = React.lazy(() =>
  import("@/components/ui/phosphor-icon-picker").then((module) => ({
    default: module.PhosphorIconPicker,
  })),
)

type IconEmojiPickerProps = {
  allowUpload?: boolean
  className?: string
  iconPosition?: PageIconPosition
  onEmojiSelect: (emoji: string) => void
  onIconSelect: (svg: string) => void
  onIconPositionChange?: (position: PageIconPosition) => void
}

export function IconEmojiPicker({
  allowUpload = true,
  className,
  iconPosition,
  onEmojiSelect,
  onIconSelect,
  onIconPositionChange,
}: IconEmojiPickerProps) {
  const [activeTab, setActiveTab] = React.useState("emoji")
  const [iconWeight, setIconWeight] =
    React.useState<PhosphorPickerWeight>("bold")

  return (
    <div className={cn("flex w-72 flex-col", className)}>
      <Tabs onValueChange={setActiveTab} value={activeTab}>
        <TabsList className="mx-2 mt-2 w-[calc(100%-1rem)]">
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
          <TabsTrigger value="icon">Icon</TabsTrigger>
          {allowUpload ? <TabsTrigger value="upload">Upload</TabsTrigger> : null}
        </TabsList>
        <TabsContent className="mt-0" value="emoji">
          <EmojiPicker
            onEmojiSelect={({ emoji }) => {
              onEmojiSelect(emoji)
            }}
          >
            <EmojiPickerSearch
              autoFocus={activeTab === "emoji"}
              placeholder="Search emoji..."
            />
            <EmojiPickerContent />
            <EmojiPickerFooter />
          </EmojiPicker>
        </TabsContent>
        <TabsContent className="mt-0" value="icon">
          {activeTab === "icon" ? (
            <React.Suspense
              fallback={
                <div className="flex h-[342px] w-72 items-center justify-center text-sm text-muted-foreground">
                  Loading icons...
                </div>
              }
            >
              <PhosphorIconPicker
                onIconSelect={onIconSelect}
                weight={iconWeight}
              />
            </React.Suspense>
          ) : null}
        </TabsContent>
        {allowUpload ? (
          <TabsContent className="mt-0" value="upload">
            <IconUploadPicker onIconSelect={onIconSelect} />
          </TabsContent>
        ) : null}
      </Tabs>
      {activeTab === "icon" || (iconPosition && onIconPositionChange) ? (
        <div className="border-t p-2">
          {activeTab === "icon" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                  type="button"
                >
                  <Bold className="size-4" weight={iconWeight} />
                  <span>Icon weight</span>
                  <span className="ml-auto text-muted-foreground">
                    {iconWeight === "fill" ? "Filled" : "Bold"}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-40"
                side="right"
                sideOffset={6}
              >
                <DropdownMenuRadioGroup
                  onValueChange={(value) => {
                    if (value === "bold" || value === "fill") {
                      setIconWeight(value)
                    }
                  }}
                  value={iconWeight}
                >
                  <DropdownMenuRadioItem value="bold">
                    Bold
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="fill">
                    Filled
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {iconPosition && onIconPositionChange ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                  type="button"
                >
                  <PanelTop className="size-4" />
                  <span>Icon position</span>
                  <span className="ml-auto text-muted-foreground">
                    {iconPosition === "inline" ? "Inline" : "Top"}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-40"
                side="right"
                sideOffset={6}
              >
                <DropdownMenuRadioGroup
                  onValueChange={(value) => {
                    if (value === "inline" || value === "top") {
                      onIconPositionChange(value)
                    }
                  }}
                  value={iconPosition}
                >
                  <DropdownMenuRadioItem value="inline">
                    Inline
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="top">
                    Top
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
