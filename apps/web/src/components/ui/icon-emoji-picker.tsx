import * as React from "react"

import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker"
import { IconUploadPicker } from "@/components/ui/icon-upload-picker"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const LucideIconPicker = React.lazy(() =>
  import("@/components/ui/lucide-icon-picker").then((module) => ({
    default: module.LucideIconPicker,
  })),
)

type IconEmojiPickerProps = {
  className?: string
  onEmojiSelect: (emoji: string) => void
  onIconSelect: (svg: string) => void
}

export function IconEmojiPicker({
  className,
  onEmojiSelect,
  onIconSelect,
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
              <LucideIconPicker onIconSelect={onIconSelect} />
            </React.Suspense>
          ) : null}
        </TabsContent>
        <TabsContent className="mt-0" value="upload">
          <IconUploadPicker onIconSelect={onIconSelect} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
