import { getDatabaseViewTypePresentation } from "../view-settings/model/view-type-options";

import { X } from "@/shared/components/icons";

import { Input } from "@/shared/ui/input";

import { IconEmojiPicker } from "@/shared/ui/icon-emoji-picker";
import { PageIconDisplay } from "@/features/pages/index";

import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";

import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
  type DatabaseViewTab,
} from "../state/database-view-context";

export function DatabaseViewTabAppearance({
  view,
  selectActiveView,
  openPickerId,
  onPickerChange,
}: {
  view: DatabaseViewTab;
  selectActiveView: (id: string) => void;
  openPickerId: string | null;
  onPickerChange: (id: string | null) => void;
}) {
  const { saveDatabaseViewIcon, saveDatabaseViewTitle, setDraftViewTitle } =
    useDatabaseActionsContext();
  const { databaseId, editable } = useDatabaseDataContext();
  const { activeViewTabId, draftViewTitle } = useDatabaseUiContext();
  const isActiveView = view.id === activeViewTabId;
  const ViewIcon = view.fallbackIcon ?? getDatabaseViewTypePresentation(view.type).Icon;
  const disabled = !editable || !databaseId;
  return (
    <div className="flex items-center gap-1.5 p-1.5">
      <Popover
        onOpenChange={(open) => onPickerChange(open ? view.id : null)}
        open={openPickerId === view.id}
      >
        <div className="group/view-icon relative shrink-0">
          <PopoverTrigger asChild>
            <button
              aria-label="Change view icon"
              className="flex size-7 items-center justify-center rounded-md border bg-surface-canvas text-content-secondary transition-colors hover:bg-action-neutral-hover focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none"
              disabled={disabled}
              type="button"
            >
              {view.icon ? (
                <PageIconDisplay size="sm" value={view.icon} />
              ) : (
                <ViewIcon className="size-4" />
              )}
            </button>
          </PopoverTrigger>
          {view.icon ? (
            <button
              aria-label="Reset view icon"
              className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full border bg-surface-canvas text-content-secondary shadow-sm hover:bg-action-neutral-hover hover:text-action-on-neutral active:bg-action-neutral-pressed active:text-action-on-neutral group-focus-within/view-icon:flex group-hover/view-icon:flex [&_svg]:size-2.5"
              disabled={disabled}
              onClick={() => saveDatabaseViewIcon(view, "")}
              type="button"
            >
              <X />
            </button>
          ) : null}
        </div>
        <PopoverContent
          align="start"
          className="w-auto gap-0 overflow-hidden p-0"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          sideOffset={6}
        >
          <IconEmojiPicker
            onEmojiSelect={(icon) => {
              saveDatabaseViewIcon(view, icon);
              onPickerChange(null);
            }}
            onIconSelect={(icon) => {
              saveDatabaseViewIcon(view, icon);
              onPickerChange(null);
            }}
          />
        </PopoverContent>
      </Popover>
      <Input
        aria-label="View name"
        className="min-w-0 flex-1 text-sm font-medium"
        defaultValue={isActiveView ? draftViewTitle : view.name}
        disabled={disabled}
        key={`${view.id}:${view.name}`}
        onBlur={(event) => {
          const nextTitle = event.target.value.trim() || "Untitled view";
          const currentTitle = isActiveView ? draftViewTitle : view.name;

          if (nextTitle !== currentTitle) {
            selectActiveView(view.id);
            setDraftViewTitle(nextTitle);
            window.setTimeout(() => saveDatabaseViewTitle(nextTitle), 0);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
