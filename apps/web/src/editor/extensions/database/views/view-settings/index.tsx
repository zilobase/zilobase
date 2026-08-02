import {
  ArrowDownUp,
  Check,
  ChevronsRight,
  Eye,
  EyeOff,
  Filter,
  GripVertical,
  Link as LinkIcon,
  Lock,
  Palette,
  Settings2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
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

import { getDatabasePropertyType } from "../../core/database-property-types";
import { getPropertyHiddenForView } from "../database-view-config";
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
  presentation = "menu",
  portalTarget,
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
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  };
  const { Icon: ViewTypeIcon } = getDatabaseViewTypePresentation(activeViewType);
  const activeGroupProperty = groupProperties.find(
    (property) => property.property.id === groupPropertyId,
  );

  const handleOpenChange = (nextOpen: boolean) => setOpen(nextOpen);

  useEffect(() => {
    if (presentation !== "sidebar" || !open) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") handleOpenChange(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, presentation]);


  const settingsContent = (
    <>
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="text-sm font-semibold text-foreground">
            View settings
          </div>
          <Button
            aria-label="Close view settings"
            className="text-muted-foreground"
            onClick={() => setOpen(false)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5 px-1.5 py-1">
          <ViewTypeIcon className="size-4 shrink-0 text-muted-foreground" />
          <Input
            aria-label="View name"
            className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm font-medium shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            defaultValue={draftViewTitle}
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
    <Button
      aria-label="Open view settings"
      aria-expanded={open}
      className="text-muted-foreground"
      onClick={
        presentation === "sidebar" ? () => handleOpenChange(!open) : undefined
      }
      size="icon"
      type="button"
      variant="ghost"
    >
      <Settings2 />
    </Button>
  );

  if (presentation === "sidebar") {
    return (
      <>
        {trigger}
        {open && portalTarget
          ? createPortal(
              <DropDrawer inline>
                <DropDrawerContent className="h-full w-full">
                  {settingsContent}
                </DropDrawerContent>
              </DropDrawer>,
              portalTarget,
            )
          : null}
      </>
    );
  }

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


