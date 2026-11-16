import * as React from "react";
import { ChevronRight, PanelTop, Trash2 } from "@/components/icons";

import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker";
import { IconUploadPicker } from "@/components/ui/icon-upload-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/app-tabs";
import { cn } from "@/lib/utils";

type IconPosition = "inline" | "top";

const LucideIconPicker = React.lazy(() =>
  import("@/components/ui/lucide-icon-picker").then((module) => ({
    default: module.LucideIconPicker,
  })),
);

type IconEmojiPickerProps = {
  allowUpload?: boolean;
  className?: string;
  iconPosition?: IconPosition;
  onEmojiSelect: (emoji: string) => void;
  onIconSelect: (svg: string) => void;
  onRemove?: () => void;
  onIconPositionChange?: (position: IconPosition) => void;
};

export function IconEmojiPicker({
  allowUpload = true,
  className,
  iconPosition,
  onEmojiSelect,
  onIconSelect,
  onIconPositionChange,
  onRemove,
}: IconEmojiPickerProps) {
  const [activeTab, setActiveTab] = React.useState("emoji");

  return (
    <div className={cn("flex w-72 flex-col", className)}>
      <Tabs gap="none" onValueChange={setActiveTab} value={activeTab}>
        <TabsList className="mx-2 mt-2 w-[calc(100%-1rem)]" overflow="hidden">
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
          <TabsTrigger value="icon">Icon</TabsTrigger>
          {allowUpload ? <TabsTrigger value="upload">Upload</TabsTrigger> : null}
        </TabsList>
        <TabsContent className="mt-0" value="emoji">
          <EmojiPicker
            onEmojiSelect={({ emoji }) => {
              onEmojiSelect(emoji);
            }}
          >
            <EmojiPickerSearch autoFocus={activeTab === "emoji"} placeholder="Search emoji..." />
            <EmojiPickerContent />
            <EmojiPickerFooter />
          </EmojiPicker>
        </TabsContent>
        <TabsContent className="mt-0" value="icon">
          {activeTab === "icon" ? (
            <React.Suspense
              fallback={
                <div className="flex h-[342px] w-72 items-center justify-center text-sm text-content-secondary">
                  Loading icons...
                </div>
              }
            >
              <LucideIconPicker onIconSelect={onIconSelect} />
            </React.Suspense>
          ) : null}
        </TabsContent>
        {allowUpload ? (
          <TabsContent className="mt-0" value="upload">
            <IconUploadPicker onIconSelect={onIconSelect} />
          </TabsContent>
        ) : null}
      </Tabs>
      {(iconPosition && onIconPositionChange) || onRemove ? (
        <div className="border-t p-2">
          {iconPosition && onIconPositionChange ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-action-neutral-hover focus-visible:bg-action-neutral-hover"
                  type="button"
                >
                  <PanelTop className="size-4" />
                  <span>Icon position</span>
                  <span className="ml-auto text-content-secondary">
                    {iconPosition === "inline" ? "Inline" : "Top"}
                  </span>
                  <ChevronRight className="size-4 text-content-secondary" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40" side="right" sideOffset={6}>
                <DropdownMenuRadioGroup
                  onValueChange={(value) => {
                    if (value === "inline" || value === "top") {
                      onIconPositionChange(value);
                    }
                  }}
                  value={iconPosition}
                >
                  <DropdownMenuRadioItem value="inline">Inline</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {onRemove ? (
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-action-danger-text outline-none transition-colors hover:bg-feedback-error-subtle focus-visible:bg-feedback-error-subtle"
              onClick={onRemove}
              type="button"
            >
              <Trash2 className="size-4" />
              <span>Remove icon</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
