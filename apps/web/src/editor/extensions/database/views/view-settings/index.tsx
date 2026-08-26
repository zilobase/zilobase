import {
  ArrowDownUp,
  Check,
  Eye,
  EyeOff,
  Filter,
  GripVertical,
  Link as LinkIcon,
  Lock,
  Palette,
  Settings2,
  X,
} from "lucide-react";
import { useState } from "react";

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer";
import { Input } from "@/components/ui/input";
import { IconEmojiPicker } from "@/components/ui/icon-emoji-picker";
import { PageIconDisplay } from "@/lib/page-icon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { getDatabasePropertyType } from "../../core/database-property-types";
import {
  getDatabaseViewIcon,
  getPropertyHiddenForView,
} from "../database-view-config";
import { DatabaseViewToolbarButton } from "../database-view-toolbar-button";
import { DatabaseFilterSubmenu } from "../database-filter-menu";
import { DatabaseSortSubmenu } from "../database-sort-menu";
import { NameColumnGlyph } from "../../interactions/name-column-glyph";
import type { DatabaseViewSettingsMenuProps } from "./types";
import { ConditionalColorPanel } from "./conditional-color-settings";
import { DataSourceSettingsSection } from "./data-source-settings";
import { LayoutSettingsSection } from "./layout-settings";
import { getDatabaseViewTypePresentation } from "./view-type-options";
import { ViewSettingsRow } from "./view-settings-row";

export function DatabaseViewSettingsMenu({
  activeConditionalColors,
  allContentWrapped,
  activeDatabaseFilters,
  activeDatabaseSorts,
  activeViewType,
  dateProperties = [],
  datePropertyId = null,
  addableFilterFieldOptions,
  addableSortFieldOptions,
  canAddDatabaseFilter,
  canAddDatabaseSort,
  chartSettings,
  layoutSettings,
  databaseId,
  databaseName,
  dataSources,
  draftViewTitle,
  editable = true,
  filterFieldOptions,
  filterValueOptionsByField,
  groupProperties,
  groupPropertyId,
  linkedViews = [],
  titlePropertyLabel,
  open: controlledOpen,
  workspaceId,
  onAddLinkedDatabaseView,
  onCopyDatabaseViewLink,
  onOpenChange,
  onClearDatabaseFilter,
  onClearDatabaseSort,
  onCreateDatabaseFilter,
  onCreateDatabaseSort,
  onDraftViewTitleChange,
  onRemoveDatabaseFilter,
  onRemoveDatabaseSort,
  onReorderDatabaseFilters,
  onSaveDatabaseConditionalColors,
  onSaveDatabaseViewIcon,
  onSaveDatabaseViewTitle,
  onSetAllContentWrapped,
  onSetViewDateProperty,
  onSetViewGroupProperty,
  onSetViewType,
  onShowPageIconChange,
  onShowTitleChange,
  onTogglePropertyTitles,
  onTogglePropertyVisibility,
  onUpdateDatabaseFilter,
  onUpdateDatabaseChartSettings,
  onUpdateDatabaseLayoutSettings,
  onUpdateDatabaseSort,
  onUpdateDatabaseSubItemsSettings,
  properties,
  sortFieldOptions,
  sourceDatabaseId,
  viewConfig,
  visiblePropertyCount,
  showPropertyTitles,
  showPageIcon,
  showTitle,
  subItemsSettings,
}: DatabaseViewSettingsMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  };
  const { Icon: ViewTypeIcon } = getDatabaseViewTypePresentation(activeViewType);
  const viewIcon = getDatabaseViewIcon(viewConfig);
  const activeGroupProperty = groupProperties.find(
    (property) => property.property.id === groupPropertyId,
  );

  const handleOpenChange = (nextOpen: boolean) => setOpen(nextOpen);

  const settingsContent = (
    <>
        <div className="flex items-center px-2 py-1.5">
          <div className="text-sm font-semibold text-foreground">
            View settings
          </div>
        </div>
        <div className="flex items-center gap-1.5 p-1.5">
          <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
            <div className="group/view-settings-icon relative shrink-0">
              <PopoverTrigger asChild>
                <button
                  aria-label="Change view icon"
                  className="flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  disabled={!editable}
                  type="button"
                >
                  {viewIcon ? (
                    <PageIconDisplay size="sm" value={viewIcon} />
                  ) : (
                    <ViewTypeIcon className="size-4" />
                  )}
                </button>
              </PopoverTrigger>
              {viewIcon ? (
                <button
                  aria-label="Reset view icon"
                  className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:bg-accent hover:text-accent-foreground active:bg-active active:text-active-foreground group-focus-within/view-settings-icon:flex group-hover/view-settings-icon:flex [&_svg]:size-2.5"
                  disabled={!editable}
                  onClick={() => onSaveDatabaseViewIcon("")}
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
                  onSaveDatabaseViewIcon(icon);
                  setIconPickerOpen(false);
                }}
                onIconSelect={(icon) => {
                  onSaveDatabaseViewIcon(icon);
                  setIconPickerOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
          <Input
            aria-label="View name"
            className="h-8 min-w-0 flex-1 text-sm font-medium"
            defaultValue={draftViewTitle}
            disabled={!editable}
            key={draftViewTitle}
            onBlur={(event) => {
              const nextTitle = event.target.value.trim();

              if (nextTitle !== draftViewTitle) {
                onDraftViewTitleChange(nextTitle);
                onSaveDatabaseViewTitle(nextTitle);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            placeholder="Untitled view"
          />
        </div>
        <DropDrawerSeparator />
        <LayoutSettingsSection
          activeViewType={activeViewType}
          allContentWrapped={allContentWrapped}
          chartSettings={chartSettings}
          dateProperties={dateProperties}
          datePropertyId={datePropertyId}
          groupProperties={groupProperties}
          groupPropertyId={groupPropertyId}
          layoutSettings={layoutSettings}
          onSetAllContentWrapped={onSetAllContentWrapped}
          onSetViewDateProperty={onSetViewDateProperty}
          onSetViewGroupProperty={onSetViewGroupProperty}
          onSetViewType={onSetViewType}
          onShowPageIconChange={onShowPageIconChange}
          onShowTitleChange={onShowTitleChange}
          onTogglePropertyTitles={onTogglePropertyTitles}
          onTogglePropertyVisibility={onTogglePropertyVisibility}
          onUpdateDatabaseChartSettings={onUpdateDatabaseChartSettings}
          onUpdateDatabaseLayoutSettings={onUpdateDatabaseLayoutSettings}
          properties={properties}
          showPageIcon={showPageIcon}
          showPropertyTitles={showPropertyTitles}
          showTitle={showTitle}
          titlePropertyLabel={titlePropertyLabel}
          viewConfig={viewConfig}
        />
        <DropDrawerSub displayMode="inline" title="Property visibility">
          <DropDrawerSubTrigger>
            <ViewSettingsRow
              icon={<Eye />}
              label="Property visibility"
              right={visiblePropertyCount}
            />
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-72">
            <DropDrawerItem disabled>
              <NameColumnGlyph />
              <span>{titlePropertyLabel}</span>
              <Eye className="ml-auto text-muted-foreground" />
            </DropDrawerItem>
            {properties.map((property) => {
              const PropertyIcon = getDatabasePropertyType(
                property.property.type,
              ).icon;
              const visible = !getPropertyHiddenForView(
                property.id,
                property.property.config,
                viewConfig,
              );

              return (
                <DropDrawerItem
                  aria-pressed={visible}
                  key={property.id}
                  onSelect={(event) => {
                    event.preventDefault();
                    onTogglePropertyVisibility(property.id);
                  }}
                >
                  <PropertyIcon />
                  <span>{property.property.name}</span>
                  {visible ? (
                    <Eye className="ml-auto text-muted-foreground" />
                  ) : (
                    <EyeOff className="ml-auto text-muted-foreground" />
                  )}
                </DropDrawerItem>
              );
            })}
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DatabaseFilterSubmenu
          activeDatabaseFilters={activeDatabaseFilters}
          addableFilterFieldOptions={addableFilterFieldOptions}
          canAddDatabaseFilter={canAddDatabaseFilter}
          filterFieldOptions={filterFieldOptions}
          filterValueOptionsByField={filterValueOptionsByField}
          onClearDatabaseFilter={onClearDatabaseFilter}
          onCreateDatabaseFilter={onCreateDatabaseFilter}
          onRemoveDatabaseFilter={onRemoveDatabaseFilter}
          onReorderDatabaseFilters={onReorderDatabaseFilters}
          onUpdateDatabaseFilter={onUpdateDatabaseFilter}
          displayMode="inline"
          title="Filter"
        >
          <ViewSettingsRow
            icon={<Filter />}
            label="Filter"
            right={
              activeDatabaseFilters.length > 0
                ? activeDatabaseFilters.length
                : undefined
            }
          />
        </DatabaseFilterSubmenu>
        <DatabaseSortSubmenu
          activeDatabaseSorts={activeDatabaseSorts}
          addableSortFieldOptions={addableSortFieldOptions}
          canAddDatabaseSort={canAddDatabaseSort}
          onClearDatabaseSort={onClearDatabaseSort}
          onCreateDatabaseSort={onCreateDatabaseSort}
          onRemoveDatabaseSort={onRemoveDatabaseSort}
          onUpdateDatabaseSort={onUpdateDatabaseSort}
          sortFieldOptions={sortFieldOptions}
          displayMode="inline"
          title="Sort"
        >
          <ViewSettingsRow
            icon={<ArrowDownUp />}
            label="Sort"
            right={
              activeDatabaseSorts.length > 0
                ? activeDatabaseSorts.length
                : undefined
            }
          />
        </DatabaseSortSubmenu>
        <DropDrawerSub displayMode="inline" title="Group">
          <DropDrawerSubTrigger>
            <ViewSettingsRow
              icon={<GripVertical />}
              label="Group"
              right={activeGroupProperty?.property.name ?? "None"}
            />
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-72">
            <DropDrawerItem onSelect={() => onSetViewGroupProperty(null)}>
              <GripVertical />
              <span>No grouping</span>
              {groupPropertyId === null ? (
                <Check className="ml-auto text-foreground" />
              ) : null}
            </DropDrawerItem>
            {groupProperties.length > 0 ? (
              groupProperties.map((property) => {
                const PropertyIcon = getDatabasePropertyType(
                  property.property.type,
                ).icon;
                const isSelected = property.property.id === groupPropertyId;

                return (
                  <DropDrawerItem
                    key={property.id}
                    onSelect={() =>
                      onSetViewGroupProperty(property.property.id)
                    }
                  >
                    <PropertyIcon />
                    <span>{property.property.name}</span>
                    {isSelected ? (
                      <Check className="ml-auto text-foreground" />
                    ) : null}
                  </DropDrawerItem>
                );
              })
            ) : (
              <DropDrawerItem disabled>
                No groupable properties yet
              </DropDrawerItem>
            )}
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSub displayMode="inline" title="Conditional color">
          <DropDrawerSubTrigger>
            <ViewSettingsRow
              icon={<Palette />}
              label="Conditional color"
              right={
                activeConditionalColors.length > 0
                  ? activeConditionalColors.length
                  : undefined
              }
            />
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-80">
            <ConditionalColorPanel
              filterFieldOptions={filterFieldOptions}
              filterValueOptionsByField={filterValueOptionsByField}
              properties={properties}
              settings={activeConditionalColors}
              onSettingsChange={onSaveDatabaseConditionalColors}
            />
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerItem onSelect={onCopyDatabaseViewLink}>
          <LinkIcon />
          <span>Copy link to view</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <DataSourceSettingsSection
          databaseId={databaseId}
          databaseName={databaseName}
          dataSources={dataSources}
          linkedViews={linkedViews}
          onAddLinkedDatabaseView={onAddLinkedDatabaseView}
          onUpdateDatabaseSubItemsSettings={onUpdateDatabaseSubItemsSettings}
          onCloseSettings={() => setOpen(false)}
          open={open}
          properties={properties}
          sourceDatabaseId={sourceDatabaseId}
          workspaceId={workspaceId}
          subItemsSettings={subItemsSettings}
        />
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <Lock />
            <span>Lock database</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>Database lock settings</DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
    </>
  );

  const trigger = (
    <DatabaseViewToolbarButton
      aria-label="Open view settings"
      aria-expanded={open}
    >
      <Settings2 />
    </DatabaseViewToolbarButton>
  );

  return (
    <DropDrawer open={open} onOpenChange={handleOpenChange}>
      <DropDrawerTrigger asChild>{trigger}</DropDrawerTrigger>
      <DropDrawerContent
        align="start"
        className="w-72"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {settingsContent}
      </DropDrawerContent>
    </DropDrawer>
  );
}
