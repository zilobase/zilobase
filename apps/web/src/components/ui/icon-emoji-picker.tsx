import * as React from "react"
import { ChevronRight, PanelTop } from "lucide-react"

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
import { cn } from "@/lib/utils"
import type { PageIconPosition } from "@zilobase/features/pages"

const ReiconIconPicker = React.lazy(() =>
  import("@/components/ui/reicon-icon-picker").then((module) => ({
    default: module.ReiconIconPicker,
  })),
)

type IconEmojiPickerProps = {
  className?: string
  iconPosition?: PageIconPosition
  onEmojiSelect: (emoji: string) => void
  onIconSelect: (svg: string) => void
  onIconPositionChange?: (position: PageIconPosition) => void
}

export function IconEmojiPicker({
  className,
  iconPosition,
  onEmojiSelect,
  onIconSelect,
  onIconPositionChange,
}: IconEmojiPickerProps) {
  const [activeTab, setActiveTab] = React.useState("emoji")

  return (
    <div className={cn("flex w-72 flex-col", className)}>
      <Tabs onValueChange={setActiveTab} value={activeTab}>
        <TabsList className="mx-2 mt-2 w-[calc(100%-1rem)]">
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
          <TabsTrigger value="icon">Icon</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
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
              <ReiconIconPicker onIconSelect={onIconSelect} />
            </React.Suspense>
          ) : null}
        </TabsContent>
        <TabsContent className="mt-0" value="upload">
          <IconUploadPicker onIconSelect={onIconSelect} />
        </TabsContent>
      </Tabs>
      {iconPosition && onIconPositionChange ? (
        <div className="border-t p-2">
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
                <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  )
}
