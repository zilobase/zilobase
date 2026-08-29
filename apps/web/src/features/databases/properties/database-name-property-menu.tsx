import {
  ArrowDownUp,
  ArrowLeftToLine,
  ArrowRightToLine,
  Check,
  ChevronDown,
  FileText,
  Filter,
  GripVertical,
  Sparkles,
  TextWrap,
  X,
} from "@/shared/components/icons";
import { useState, type ButtonHTMLAttributes } from "react";

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerShortcut,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer";
import { Input } from "@/shared/ui/input";
import { IconEmojiPicker } from "@/shared/ui/icon-emoji-picker";
import { PageIconDisplay } from "@/features/pages/index";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover";
import { Switch } from "@/shared/ui/switch";
import { useUpdateDatabase } from "@zilobase/features/databases";

import {
  getDatabaseSorts,
  getMergedDatabaseConfig,
  getMergedNameColumnConfig,
  getNameColumnIcon,
  getNameColumnLabel,
  getNameColumnShowPageIcon,
  getNameColumnWrapContent,
  upsertDatabaseSort,
  type DatabaseNameColumnConfig,
  type DatabaseSortDirection,
} from "../views/model/database-view-config";
import { NameColumnGlyph } from "../interactions/name-column-glyph";

export function DatabaseNamePropertyMenu({
  config,
  databaseId,
  isGrouped = false,
  onOpenChange,
  onInsertProperty,
  onSort,
  onToggleGroup,
  onUpdateConfig,
  open,
  schemaActionsEnabled = true,
  sortDirection,
  triggerDragProps,
  wrapContent: controlledWrapContent,
}: {
  config?: unknown;
  databaseId: string;
  isGrouped?: boolean;
  onOpenChange?: (open: boolean) => void;
  onInsertProperty: (side: "left" | "right") => void;
  onSort?: (direction: DatabaseSortDirection) => void;
  onToggleGroup?: () => void;
  onUpdateConfig?: (config: DatabaseNameColumnConfig) => void;
  open?: boolean;
  schemaActionsEnabled?: boolean;
  sortDirection?: DatabaseSortDirection;
  triggerDragProps?: Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onClick" | "onPointerDownCapture" | "title"
  >;
  wrapContent?: boolean;
}) {
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const updateDatabase = useUpdateDatabase();
  const label = getNameColumnLabel(config);
  const customIcon = getNameColumnIcon(config);
  const currentSorts = getDatabaseSorts(config);
  const currentSortDirection =
    sortDirection ??
    currentSorts.find((sort) => sort.column === "name")?.direction;
  const showPageIcon = getNameColumnShowPageIcon(config);
  const wrapContent =
    controlledWrapContent ?? getNameColumnWrapContent(config);
  const updateNameColumnConfig = (nextConfig: DatabaseNameColumnConfig) => {
    if (onUpdateConfig) {
      onUpdateConfig(nextConfig);
      return;
    }

    updateDatabase.mutate({
      config: getMergedNameColumnConfig(config, nextConfig),
      databaseId,
    });
  };
  const updateSort = (direction: DatabaseSortDirection) => {
    if (onSort) {
      onSort(direction);
      return;
    }

    updateDatabase.mutate({
      config: getMergedDatabaseConfig(config, {
        sorts: upsertDatabaseSort(currentSorts, {
          column: "name",
          direction,
        }),
      }),
      databaseId,
    });
  };
  const renderNameColumnIcon = () =>
    customIcon ? (
      <PageIconDisplay size="sm" value={customIcon} />
    ) : (
      <NameColumnGlyph />
    );

  return (
    <DropDrawer open={open} onOpenChange={onOpenChange}>
      <DropDrawerTrigger asChild>
        <button
          aria-label="Name column options"
          className="database-name-menu-trigger group flex h-8 w-full min-w-0 items-stretch gap-2 px-3 py-1 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0"
          type="button"
          {...triggerDragProps}
        >
          <span className="self-center text-muted-foreground">
            {renderNameColumnIcon()}
          </span>
          <span className="flex min-w-0 items-center truncate">{label}</span>
          <ChevronDown className="ml-auto self-center opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </DropDrawerTrigger>
      <DropDrawerContent
        className="w-72"
        onCloseAutoFocus={(event) => event.preventDefault()}
        sideOffset={0}
      >
        <div className="flex items-center gap-1.5 p-1.5">
          <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
            <div className="group/name-column-icon relative shrink-0">
              <PopoverTrigger asChild>
                <button
                  aria-label="Change name column icon"
                  className="flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  type="button"
                >
                  {renderNameColumnIcon()}
                </button>
              </PopoverTrigger>
              {customIcon ? (
                <button
                  aria-label="Reset name column icon"
                  className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground active:bg-active active:text-active-foreground group-focus-within/name-column-icon:flex group-hover/name-column-icon:flex [&_svg]:size-2.5"
                  onClick={() => updateNameColumnConfig({ icon: "" })}
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
                  updateNameColumnConfig({ icon });
                  setIconPickerOpen(false);
                }}
                onIconSelect={(icon) => {
                  updateNameColumnConfig({ icon });
                  setIconPickerOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
          <Input
            aria-label="Name column label"
            className="h-8 min-w-0 flex-1 text-sm font-medium"
            defaultValue={label}
            onBlur={(event) => {
              const nextLabel = event.target.value.trim() || "Name";

              if (nextLabel !== label) {
                updateNameColumnConfig({
                  label: nextLabel === "Name" ? undefined : nextLabel,
                });
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        </div>
        <DropDrawerSeparator />
        <DropDrawerItem
          aria-pressed={showPageIcon}
          onSelect={(event) => {
            event.preventDefault();
            updateNameColumnConfig({ showPageIcon: !showPageIcon });
          }}
        >
          <FileText />
          <span>Show page icon</span>
          <Switch
            checked={showPageIcon}
            className="ml-auto pointer-events-none"
            size="sm"
            tabIndex={-1}
          />
        </DropDrawerItem>
        <DropDrawerItem disabled>
          <Sparkles />
          <span>AI Autofill</span>
          <DropDrawerShortcut>Soon</DropDrawerShortcut>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <DropDrawerItem disabled>
          <Filter />
          <span>Filter</span>
        </DropDrawerItem>
        <DropDrawerItem
          onSelect={(event) => {
            event.preventDefault();
            onToggleGroup?.();
          }}
        >
          <GripVertical />
          <span>{isGrouped ? "Ungroup" : "Group"}</span>
        </DropDrawerItem>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <ArrowDownUp />
            <span>Sort</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem
              onSelect={(event) => {
                event.preventDefault();
                updateSort("ascending");
              }}
            >
              <span>Ascending</span>
              {currentSortDirection === "ascending" ? (
                <Check className="ml-auto" />
              ) : null}
            </DropDrawerItem>
            <DropDrawerItem
              onSelect={(event) => {
                event.preventDefault();
                updateSort("descending");
              }}
            >
              <span>Descending</span>
              {currentSortDirection === "descending" ? (
                <Check className="ml-auto" />
              ) : null}
            </DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerItem
          aria-pressed={wrapContent}
          onSelect={(event) => {
            event.preventDefault();
            updateNameColumnConfig({ wrapContent: !wrapContent });
          }}
        >
          <TextWrap />
          <span>{wrapContent ? "Unwrap content" : "Wrap content"}</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        {schemaActionsEnabled ? (
          <>
            <DropDrawerItem onSelect={() => onInsertProperty("left")}>
              <ArrowLeftToLine />
              <span>Insert left</span>
            </DropDrawerItem>
            <DropDrawerItem onSelect={() => onInsertProperty("right")}>
              <ArrowRightToLine />
              <span>Insert right</span>
            </DropDrawerItem>
          </>
        ) : null}
      </DropDrawerContent>
    </DropDrawer>
  );
}
