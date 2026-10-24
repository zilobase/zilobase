import {
  ArrowDownUp,
  Check,
  Eye,
  EyeOff,
  Filter,
  IntersectSquareIcon,
  Link as LinkIcon,
  Lock,
  Palette,
  SlidersHorizontalIcon,
} from "@/components/icons";
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
import { PageIconDisplay } from "@/sections/pages/appearance/components/page-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { getDatabasePropertyType } from "../../../properties/lib/property-catalog";
import { getDatabaseViewIcon, getPropertyHiddenForView } from "@zilobase/features/databases";
import { DatabaseViewToolbarButton } from "../../shared/components/database-view-toolbar-button";
import { DatabaseFilterSubmenu } from "../../shared/components/database-filter-menu";
import { DatabaseSortSubmenu } from "../../shared/components/database-sort-menu";
import { NameColumnGlyph } from "../../../interactions/components/name-column-glyph";
import type { DatabaseViewSettingsMenuProps } from "../lib/view-settings-contracts";
import { ConditionalColorPanel } from "./conditional-color-settings";
import { DataSourceSettingsSection } from "./data-source-settings";
import { LayoutSettingsSection } from "./layout-settings";
import { getDatabaseViewTypePresentation } from "../lib/view-type-options";

export function DatabaseViewSettingsMenu({
  activeConditionalColors,
  allContentWrapped,
  activeDatabaseFilters,
  activeDatabaseSorts,
  activeDataSourceId,
  activeDataSourceName,
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
  dataSources,
  draftViewTitle,
  editable = true,
  filterFieldOptions,
  filterValueOptionsByField,
  groupProperties,
  groupPropertyId,
  isAddingDataSource,
  titlePropertyLabel,
  open: controlledOpen,
  workspaceId,
  onLinkDataSourceView,
  onUnlinkDataSource,
  onAddDataSourceView,
  onAddDataSource,
  onCopyDatabaseViewLink,
  onOpenChange,
  onOpenAutomations,
  onReplaceActiveViewSource,
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
  hostDatabaseId,
  viewConfig,
  visiblePropertyCount,
  showPropertyTitles,
  showPageIcon,
  showTitle,
  subItemsSettings,
}: DatabaseViewSettingsMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [propertySearch, setPropertySearch] = useState("");
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
  const propertyQuery = propertySearch.trim().toLowerCase();
  const matchingProperties = properties.filter((property) =>
    property.property.name.toLowerCase().includes(propertyQuery),
  );
  const titleMatches = titlePropertyLabel.toLowerCase().includes(propertyQuery);

  const handleOpenChange = (nextOpen: boolean) => setOpen(nextOpen);

  const settingsContent = (
    <>
      <div className="flex items-center px-2 py-1.5">
        <div className="text-sm font-semibold text-content-primary">View settings</div>
      </div>
      <div className="flex items-center gap-1.5 p-1.5">
        <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
          <div className="group/view-settings-icon relative shrink-0">
            <PopoverTrigger asChild>
              <button
                aria-label="Change view icon"
                className="inline-flex shrink-0 items-center justify-center rounded-sm border-0 bg-transparent p-0 leading-none focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none"
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
          </div>
          <PopoverContent
            align="start"
            className="w-auto gap-0 overflow-hidden p-0"
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            sideOffset={6}
          >
            <IconEmojiPicker
              onRemove={
                viewIcon
                  ? () => {
                      onSaveDatabaseViewIcon("");
                      setIconPickerOpen(false);
                    }
                  : undefined
              }
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
          className="min-w-0 flex-1 text-sm font-medium"
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
        <DropDrawerSubTrigger trailing={visiblePropertyCount}>
          <Eye />
          <span className="truncate">Property visibility</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent width="default">
          <div className="p-1">
            <Input
              aria-label="Search for a property"
              placeholder="Search for a property..."
              value={propertySearch}
              onChange={(event) => setPropertySearch(event.target.value)}
            />
          </div>
          {activeViewType === "calendar" && (
            <div className="px-2 py-1.5 text-xs text-content-secondary">Calendar properties</div>
          )}
          {titleMatches && (
            <DropDrawerItem disabled>
              <NameColumnGlyph />
              <span>{titlePropertyLabel}</span>
              <Eye className="ml-auto text-content-secondary" />
            </DropDrawerItem>
          )}
          {!titleMatches && matchingProperties.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-content-secondary">No properties found</div>
          )}
          {matchingProperties.map((property) => {
            const PropertyIcon = getDatabasePropertyType(property.property.type).icon;
            const visible = !getPropertyHiddenForView(
              property.id,
              property.property.config,
              viewConfig,
            );

            return (
              <DropDrawerItem
                aria-pressed={visible}
                disabled={!editable}
                key={property.id}
                onSelect={(event) => {
                  event.preventDefault();
                  onTogglePropertyVisibility(property.id);
                }}
              >
                <PropertyIcon />
                <span>{property.property.name}</span>
                {visible ? (
                  <Eye className="ml-auto text-content-secondary" />
                ) : (
                  <EyeOff className="ml-auto text-content-secondary" />
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
        trailing={activeDatabaseFilters.length > 0 ? activeDatabaseFilters.length : undefined}
      >
        <Filter />
        <span>Filter</span>
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
        trailing={activeDatabaseSorts.length > 0 ? activeDatabaseSorts.length : undefined}
      >
        <ArrowDownUp />
        <span>Sort</span>
      </DatabaseSortSubmenu>
      {activeViewType !== "calendar" ? (
        <DropDrawerSub displayMode="inline" title="Group">
          <DropDrawerSubTrigger trailing={activeGroupProperty?.property.name ?? "None"}>
            <IntersectSquareIcon />
            <span className="truncate">Group</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-72">
            <DropDrawerItem onSelect={() => onSetViewGroupProperty(null)}>
              <IntersectSquareIcon />
              <span>No grouping</span>
              {groupPropertyId === null ? <Check className="ml-auto text-content-primary" /> : null}
            </DropDrawerItem>
            {groupProperties.length > 0 ? (
              groupProperties.map((property) => {
                const PropertyIcon = getDatabasePropertyType(property.property.type).icon;
                const isSelected = property.property.id === groupPropertyId;

                return (
                  <DropDrawerItem
                    key={property.id}
                    onSelect={() => onSetViewGroupProperty(property.property.id)}
                  >
                    <PropertyIcon />
                    <span>{property.property.name}</span>
                    {isSelected ? <Check className="ml-auto text-content-primary" /> : null}
                  </DropDrawerItem>
                );
              })
            ) : (
              <DropDrawerItem disabled>No groupable properties yet</DropDrawerItem>
            )}
          </DropDrawerSubContent>
        </DropDrawerSub>
      ) : null}
      <DropDrawerSub displayMode="inline" title="Conditional color">
        <DropDrawerSubTrigger
          trailing={activeConditionalColors.length > 0 ? activeConditionalColors.length : undefined}
        >
          <Palette />
          <span className="truncate">Conditional color</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-80">
          <ConditionalColorPanel
            activeViewType={activeViewType}
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
        activeDataSourceId={activeDataSourceId}
        activeDataSourceName={activeDataSourceName}
        databaseId={databaseId}
        dataSources={dataSources}
        isAddingDataSource={isAddingDataSource}
        onAddDataSource={onAddDataSource}
        onLinkDataSourceView={onLinkDataSourceView}
        onUnlinkDataSource={onUnlinkDataSource}
        onAddDataSourceView={onAddDataSourceView}
        onReplaceActiveViewSource={onReplaceActiveViewSource}
        onUpdateDatabaseSubItemsSettings={onUpdateDatabaseSubItemsSettings}
        onCloseSettings={() => setOpen(false)}
        onOpenAutomations={onOpenAutomations}
        open={open}
        properties={properties}
        hostDatabaseId={hostDatabaseId}
        workspaceId={workspaceId}
        subItemsSettings={subItemsSettings}
      />
      <DropDrawerSub title="Lock database">
        <DropDrawerSubTrigger>
          <Lock />
          <span>Lock database</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-72">
          <DropDrawerItem disabled>Database lock settings</DropDrawerItem>
        </DropDrawerSubContent>
      </DropDrawerSub>
    </>
  );

  const trigger = (
    <DatabaseViewToolbarButton aria-label="Open view settings" aria-expanded={open}>
      <SlidersHorizontalIcon />
    </DatabaseViewToolbarButton>
  );

  return (
    <DropDrawer defaultSubDisplayMode="inline" open={open} onOpenChange={handleOpenChange}>
      <DropDrawerTrigger asChild>{trigger}</DropDrawerTrigger>
      <DropDrawerContent
        align="start"
        onCloseAutoFocus={(event) => event.preventDefault()}
        width="default"
      >
        {settingsContent}
      </DropDrawerContent>
    </DropDrawer>
  );
}
