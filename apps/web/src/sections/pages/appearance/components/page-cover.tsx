import { useState } from "react";
import { ImagePlus, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageSourcePicker } from "./image-source-picker";

export function PageCover({
  cover,
  editable,
  onChange,
  pageId,
  databaseId,
  workspaceId,
  subject = "page",
}: {
  cover: string;
  editable: boolean;
  onChange: (cover: string) => void;
  pageId?: string | null;
  databaseId?: string | null;
  workspaceId?: string | null;
  subject?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!cover) return null;

  return (
    <div
      className="group/cover relative mx-3 mt-3 h-[280px] overflow-hidden rounded-xl bg-surface-muted sm:mx-5 sm:mt-4"
      contentEditable={false}
    >
      <img alt="Cover" className="size-full object-cover" src={cover} />
      {editable ? (
        <ButtonGroup
          aria-label="Cover actions"
          className="absolute right-3 top-3 items-center opacity-0 transition-opacity group-focus-within/cover:opacity-100 group-hover/cover:opacity-100"
          variant="plain"
        >
          <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger asChild>
              <Button
                className="bg-effect-backdrop shadow-sm backdrop-blur"
                size="sm"
                type="button"
                variant="outline"
              >
                <ImagePlus />
                Change cover
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="max-h-[min(40rem,calc(100vh-6rem))] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto p-4"
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              side="bottom"
              sideOffset={8}
            >
              <ImageSourcePicker
                databaseId={databaseId}
                enableCoverGallery
                initialCover={cover}
                initialLinkUrl={cover.startsWith("data:") ? "" : cover}
                onGalleryChange={onChange}
                onSelect={(url) => {
                  onChange(url);
                  setOpen(false);
                }}
                pageId={pageId}
                workspaceId={workspaceId}
              />
            </PopoverContent>
          </Popover>
          <Button
            aria-label={`Remove ${subject} cover`}
            className="bg-effect-backdrop shadow-sm backdrop-blur focus-visible:opacity-100"
            onClick={() => onChange("")}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <X />
          </Button>
        </ButtonGroup>
      ) : null}
    </div>
  );
}
