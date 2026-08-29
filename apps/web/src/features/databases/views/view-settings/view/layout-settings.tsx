import {
  CalendarRange,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Settings2,
} from "@/shared/components/icons";

import {
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/shared/ui/dropdrawer";
import { Switch } from "@/shared/ui/switch";
import { cn } from "@/shared/lib/utils";

import { getDatabasePropertyType } from "../../../core/database-property-types";
import { NameColumnGlyph } from "../../../interactions/name-column-glyph";
import { getPropertyHiddenForView } from "../../model/database-view-config";
import { DatabaseChartSettingsSection } from "./chart-settings";
import type { DatabaseViewSettingsMenuProps } from "../model/types";
import { ViewTypeOptionGrid } from "./view-type-option-grid";
import { getDatabaseViewTypePresentation } from "../model/view-type-options";
import { ViewSettingsRow } from "./view-settings-row";

type LayoutSettingsSectionProps = Pick<
  DatabaseViewSettingsMenuProps,
  | "activeViewType"
  | "allContentWrapped"
  | "chartSettings"
  | "dateProperties"
  | "datePropertyId"
  | "groupProperties"
  | "groupPropertyId"
  | "layoutSettings"
  | "onSetAllContentWrapped"
  | "onSetViewDateProperty"
  | "onSetViewGroupProperty"
  | "onSetViewType"
  | "onShowPageIconChange"
  | "onShowTitleChange"
  | "onTogglePropertyTitles"
  | "onTogglePropertyVisibility"
  | "onUpdateDatabaseChartSettings"
  | "onUpdateDatabaseLayoutSettings"
  | "properties"
  | "showPageIcon"
  | "showPropertyTitles"
  | "showTitle"
  | "titlePropertyLabel"
  | "viewConfig"
>;

export function LayoutSettingsSection({
  activeViewType,
  allContentWrapped,
  chartSettings,
  dateProperties = [],
  datePropertyId = null,
  groupProperties,
  groupPropertyId,
  layoutSettings,
  onSetAllContentWrapped,
  onSetViewDateProperty,
  onSetViewGroupProperty,
  onSetViewType,
  onShowPageIconChange,
  onShowTitleChange,
  onTogglePropertyTitles,
  onTogglePropertyVisibility,
  onUpdateDatabaseChartSettings,
  onUpdateDatabaseLayoutSettings,
  properties,
  showPageIcon,
  showPropertyTitles,
  showTitle,
  titlePropertyLabel,
  viewConfig,
}: LayoutSettingsSectionProps) {
  const isKanbanView = activeViewType === "kanban";
  const isTimelineView = activeViewType === "timeline";
  const isChartView = activeViewType === "chart";
  const isGalleryView = activeViewType === "gallery";
  const isListView = activeViewType === "list";
  const isTableView = !activeViewType || activeViewType === "table";
  const { Icon: ViewTypeIcon, label: viewTypeLabel } =
    getDatabaseViewTypePresentation(activeViewType);
  const activeDateProperty = dateProperties.find(
    (property) => property.property.id === datePropertyId,
  );
  const activeGroupProperty = groupProperties.find(
    (property) => property.property.id === groupPropertyId,
  );
  const visibleCardProperties = properties.filter(
    (property) =>
      !getPropertyHiddenForView(
        property.id,
        property.property.config,
        viewConfig,
      ),
  );

  return (
    <DropDrawerSub displayMode="inline" title="Layout">
      <DropDrawerSubTrigger>
        <ViewSettingsRow
          icon={<ViewTypeIcon />}
          label="Layout"
          right={viewTypeLabel}
        />
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-72 max-w-[calc(100vw-1rem)] p-1">
        <ViewTypeOptionGrid
          onSelect={onSetViewType}
          selectedType={activeViewType}
        />

        <DropDrawerSeparator />
        <DropDrawerItem
          aria-pressed={showTitle}
          disabled={!onShowTitleChange}
          onSelect={(event) => {
            event.preventDefault();
            onShowTitleChange?.(!showTitle);
          }}
        >
          <span>Show data source titles</span>
          <Switch
            checked={showTitle}
            className="pointer-events-none ml-auto"
            size="sm"
            tabIndex={-1}
          />
        </DropDrawerItem>
        {!isChartView ? (
          <DropDrawerItem
            aria-pressed={showPageIcon}
            onSelect={(event) => {
              event.preventDefault();
              onShowPageIconChange(!showPageIcon);
            }}
          >
            <span>Show page icon</span>
            <Switch
              checked={showPageIcon}
              className="pointer-events-none ml-auto"
              size="sm"
              tabIndex={-1}
            />
          </DropDrawerItem>
        ) : null}
        {isTableView ? (
          <DropDrawerItem
            aria-pressed={allContentWrapped}
            onSelect={(event) => {
              event.preventDefault();
              onSetAllContentWrapped(!allContentWrapped);
            }}
          >
            <span>
              {allContentWrapped ? "Unwrap all content" : "Wrap all content"}
            </span>
          </DropDrawerItem>
        ) : !isChartView && !isTimelineView ? (
          <DropDrawerItem
            aria-pressed={layoutSettings.wrapAllContent}
            onSelect={(event) => {
              event.preventDefault();
              onUpdateDatabaseLayoutSettings({
                wrapAllContent: !layoutSettings.wrapAllContent,
              });
            }}
          >
            <span>Wrap all content</span>
            <Switch
              checked={layoutSettings.wrapAllContent}
              className="pointer-events-none ml-auto"
              size="sm"
              tabIndex={-1}
            />
          </DropDrawerItem>
        ) : null}
        {!isKanbanView &&
        !isTimelineView &&
        !isChartView &&
        !isGalleryView &&
        !isListView ? (
          <DropDrawerItem
            aria-pressed={layoutSettings.showVerticalLines}
            onSelect={(event) => {
              event.preventDefault();
              onUpdateDatabaseLayoutSettings({
                showVerticalLines: !layoutSettings.showVerticalLines,
              });
            }}
          >
            <span>Show vertical lines</span>
            <Switch
              checked={layoutSettings.showVerticalLines}
              className="pointer-events-none ml-auto"
              size="sm"
              tabIndex={-1}
            />
          </DropDrawerItem>
        ) : null}
        {isKanbanView || isGalleryView ? (
          <DropDrawerSub title="Group by">
            <DropDrawerSubTrigger>
              <ViewSettingsRow
                icon={<GripVertical />}
                label="Group by"
                right={activeGroupProperty?.property.name ?? "None"}
              />
            </DropDrawerSubTrigger>
            <DropDrawerSubContent className="w-72">
              <DropDrawerItem onSelect={() => onSetViewGroupProperty(null)}>
                <GripVertical />
                <span>No grouping</span>
                {groupPropertyId === null ? (
                  <Check className="ml-auto text-content-primary" />
                ) : null}
              </DropDrawerItem>
              {groupProperties.map((property) => {
                const PropertyIcon = getDatabasePropertyType(
                  property.property.type,
                ).icon;

                return (
                  <DropDrawerItem
                    key={property.id}
                    onSelect={() =>
                      onSetViewGroupProperty(property.property.id)
                    }
                  >
                    <PropertyIcon />
                    <span>{property.property.name}</span>
                    {property.property.id === groupPropertyId ? (
                      <Check className="ml-auto text-content-primary" />
                    ) : null}
                  </DropDrawerItem>
                );
              })}
            </DropDrawerSubContent>
          </DropDrawerSub>
        ) : null}
        {isKanbanView ? (
          <DropDrawerItem
            aria-pressed={showPropertyTitles}
            onSelect={(event) => {
              event.preventDefault();
              onTogglePropertyTitles();
            }}
          >
            <span>Show property titles</span>
            <Switch
              checked={showPropertyTitles}
              className="pointer-events-none ml-auto"
              size="sm"
              tabIndex={-1}
            />
          </DropDrawerItem>
        ) : null}
        {isTimelineView ? (
          <DropDrawerSub title="Show timeline by">
            <DropDrawerSubTrigger>
              <ViewSettingsRow
                icon={<CalendarRange />}
                label="Show timeline by"
                right={activeDateProperty?.property.name ?? "None"}
              />
            </DropDrawerSubTrigger>
            <DropDrawerSubContent className="w-72">
              {dateProperties.length > 0 ? (
                dateProperties.map((property) => {
                  const PropertyIcon = getDatabasePropertyType(
                    property.property.type,
                  ).icon;

                  return (
                    <DropDrawerItem
                      key={property.id}
                      onSelect={() =>
                        onSetViewDateProperty(property.property.id)
                      }
                    >
                      <PropertyIcon />
                      <span>{property.property.name}</span>
                      {property.property.id === datePropertyId ? (
                        <Check className="ml-auto text-content-primary" />
                      ) : null}
                    </DropDrawerItem>
                  );
                })
              ) : (
                <DropDrawerItem disabled>No date properties yet</DropDrawerItem>
              )}
            </DropDrawerSubContent>
          </DropDrawerSub>
        ) : null}
        {isGalleryView ? (
          <>
            <DropDrawerSub title="Card preview">
              <DropDrawerSubTrigger>
                <ViewSettingsRow
                  icon={<ImageIcon />}
                  label="Card preview"
                  right={
                    layoutSettings.cardPreview === "page-cover"
                      ? "Page cover"
                      : "None"
                  }
                />
              </DropDrawerSubTrigger>
              <DropDrawerSubContent className="w-72">
                <DropDrawerItem
                  onSelect={() =>
                    onUpdateDatabaseLayoutSettings({
                      cardPreview: "page-cover",
                    })
                  }
                >
                  <ImageIcon />
                  <span>Page cover</span>
                  {layoutSettings.cardPreview === "page-cover" ? (
                    <Check className="ml-auto text-content-primary" />
                  ) : null}
                </DropDrawerItem>
                <DropDrawerItem
                  onSelect={() =>
                    onUpdateDatabaseLayoutSettings({
                      cardPreview: "none",
                    })
                  }
                >
                  <EyeOff />
                  <span>None</span>
                  {layoutSettings.cardPreview === "none" ? (
                    <Check className="ml-auto text-content-primary" />
                  ) : null}
                </DropDrawerItem>
              </DropDrawerSubContent>
            </DropDrawerSub>
            <div className="flex min-h-8 items-center gap-2 px-2 py-1 text-sm">
              <span>Card size</span>
              <div className="ml-auto flex rounded-md bg-surface-muted p-0.5">
                {(["small", "medium", "large"] as const).map((size) => (
                  <button
                    className={cn(
                      "rounded px-2 py-1 text-xs capitalize text-content-secondary",
                      layoutSettings.cardSize === size &&
                        "bg-surface-canvas text-content-primary shadow-sm",
                    )}
                    key={size}
                    onClick={() =>
                      onUpdateDatabaseLayoutSettings({ cardSize: size })
                    }
                    type="button"
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-1 rounded-md bg-surface-subtle p-2">
              <div className="mb-2 px-1 text-xs font-medium text-content-secondary">
                Card layout
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["compact", "list"] as const).map((cardLayout) => (
                  <button
                    className={cn(
                      "rounded-md border p-1.5 text-xs font-medium capitalize text-content-secondary",
                      layoutSettings.cardLayout === cardLayout &&
                        "border-action-selected-border text-action-selected-text ring-1 ring-action-selected-border",
                    )}
                    key={cardLayout}
                    onClick={() =>
                      onUpdateDatabaseLayoutSettings({ cardLayout })
                    }
                    type="button"
                  >
                    <span className="mb-1.5 block h-12 rounded bg-surface-canvas p-2">
                      <span className="mb-2 block size-3 rounded-full bg-current opacity-60" />
                      {cardLayout === "compact" ? (
                        <span className="flex flex-wrap gap-1">
                          <span className="block h-1.5 w-8 rounded bg-current opacity-30" />
                          <span className="block h-1.5 w-5 rounded bg-current opacity-30" />
                          <span className="block h-1.5 w-7 rounded bg-current opacity-30" />
                        </span>
                      ) : (
                        <span className="flex flex-col gap-1">
                          <span className="block h-1.5 w-3/4 rounded bg-current opacity-30" />
                          <span className="block h-1.5 w-1/2 rounded bg-current opacity-30" />
                          <span className="block h-1.5 w-2/3 rounded bg-current opacity-30" />
                        </span>
                      )}
                    </span>
                    {cardLayout}
                  </button>
                ))}
              </div>
            </div>
            {layoutSettings.cardLayout === "compact" ? (
              <DropDrawerSub title="Compact card settings">
                <DropDrawerSubTrigger>
                  <Settings2 />
                  <span>Compact card settings</span>
                </DropDrawerSubTrigger>
                <DropDrawerSubContent className="w-72">
                  <div className="px-2 pb-2 pt-1">
                    <div className="rounded-md bg-surface-subtle p-3">
                      <div className="rounded-md border bg-surface-canvas p-3">
                        <div className="mb-3 h-2.5 w-24 rounded bg-indicator-muted" />
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="size-3 rounded-full bg-indicator-muted" />
                          <span className="h-2 w-14 rounded bg-indicator-muted" />
                          <span className="h-2 w-9 rounded bg-indicator-muted" />
                          <span className="h-3 w-3 rounded-sm bg-indicator-muted" />
                          <span className="h-2 w-12 rounded bg-indicator-muted" />
                        </div>
                      </div>
                    </div>
                    <p className="px-1 pt-2 text-xs leading-5 text-content-secondary">
                      Enabled properties appear on their own line instead of
                      wrapping with other properties.
                    </p>
                  </div>
                  <DropDrawerLabel>Full line display</DropDrawerLabel>
                  <DropDrawerItem
                    aria-pressed="true"
                    onSelect={(event) => event.preventDefault()}
                  >
                    <NameColumnGlyph />
                    <span>{titlePropertyLabel}</span>
                    <Switch
                      checked
                      className="pointer-events-none ml-auto"
                      disabled
                      size="sm"
                      tabIndex={-1}
                    />
                  </DropDrawerItem>
                  {visibleCardProperties.length > 0 ? (
                    visibleCardProperties.map((property) => {
                      const PropertyIcon = getDatabasePropertyType(
                        property.property.type,
                      ).icon;
                      const fullLine =
                        layoutSettings.fullLinePropertyIds.includes(
                          property.id,
                        );

                      return (
                        <DropDrawerItem
                          aria-pressed={fullLine}
                          key={property.id}
                          onSelect={(event) => {
                            event.preventDefault();
                            onUpdateDatabaseLayoutSettings({
                              fullLinePropertyIds: fullLine
                                ? layoutSettings.fullLinePropertyIds.filter(
                                    (propertyId) => propertyId !== property.id,
                                  )
                                : [
                                    ...layoutSettings.fullLinePropertyIds,
                                    property.id,
                                  ],
                            });
                          }}
                        >
                          <PropertyIcon />
                          <span>{property.property.name}</span>
                          <Switch
                            checked={fullLine}
                            className="pointer-events-none ml-auto"
                            size="sm"
                            tabIndex={-1}
                          />
                        </DropDrawerItem>
                      );
                    })
                  ) : (
                    <DropDrawerItem disabled>
                      No visible properties
                    </DropDrawerItem>
                  )}
                  <DropDrawerSeparator />
                  <DropDrawerSub title="Show properties">
                    <DropDrawerSubTrigger>
                      <Eye />
                      <span>Show properties</span>
                    </DropDrawerSubTrigger>
                    <DropDrawerSubContent className="w-72">
                      <DropDrawerItem disabled>
                        <NameColumnGlyph />
                        <span>{titlePropertyLabel}</span>
                        <Eye className="ml-auto text-content-secondary" />
                      </DropDrawerItem>
                      {properties.map((property) => {
                        const PropertyIcon = getDatabasePropertyType(
                          property.property.type,
                        ).icon;
                        const visible = visibleCardProperties.some(
                          (candidate) => candidate.id === property.id,
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
                              <Eye className="ml-auto text-content-secondary" />
                            ) : (
                              <EyeOff className="ml-auto text-content-secondary" />
                            )}
                          </DropDrawerItem>
                        );
                      })}
                    </DropDrawerSubContent>
                  </DropDrawerSub>
                </DropDrawerSubContent>
              </DropDrawerSub>
            ) : null}
          </>
        ) : null}
        {isChartView ? (
          <DatabaseChartSettingsSection
            onChange={onUpdateDatabaseChartSettings}
            properties={properties}
            settings={chartSettings}
            titlePropertyLabel={titlePropertyLabel}
          />
        ) : null}
      </DropDrawerSubContent>
    </DropDrawerSub>
  );
}
