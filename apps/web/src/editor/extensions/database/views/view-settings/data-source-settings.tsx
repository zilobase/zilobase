import {
  Check,
  ChevronLeft,
  CircleHelp,
  Database,
  FileText,
  MoreHorizontal,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/components/ui/dropdrawer";
import { useDatabase } from "@zilobase/features/databases";
import { usePageNavigation } from "@zilobase/features/pages";
import { getDatabaseIconNode } from "@/lib/page-icon";

import { getDatabasePropertyType } from "../../core/database-property-types";
import { hasDatabasePropertyEditSettings } from "../../properties/property-settings";
import { DatabasePropertyEditSubmenu } from "../../properties/database-property-menu";
import {
  getDatabaseLinkedViewKey,
  getDatabaseViewIcon,
} from "../database-view-config";
import {
  DatabaseSearchableMenuItems,
  type DatabaseSearchableMenuOption,
} from "../database-searchable-menu-items";
import {
  DataSourceAddGlyph,
  DataSourceMenuItem,
  DataSourceSectionLabel,
  LinkedDataSourceMenuItem,
} from "./data-source-items";
import type { DatabaseViewSettingsMenuProps } from "./types";
import type { DatabaseSourceMenuItem as DatabaseSourceMenuItemType } from "./types";
import { getDatabaseViewTypePresentation } from "./view-type-options";
import { ViewSettingsRow } from "./view-settings-row";
import { SubItemsSettingsSection } from "./sub-items-settings";
import { MoveDataSourceDialog } from "./move-data-source-dialog";

type LinkableDatabaseOption = DatabaseSearchableMenuOption & {
  pageName: string;
};

type LinkableDatabaseViewOption = DatabaseSearchableMenuOption & {
  viewIcon?: string;
  viewType: string;
};

type DataSourceSettingsSectionProps = Pick<
  DatabaseViewSettingsMenuProps,
  | "activeSourceDatabaseId"
  | "activeSourceDatabaseName"
  | "databaseId"
  | "databaseName"
  | "dataSources"
  | "isAddingDataSource"
  | "linkedViews"
  | "onAddDataSource"
  | "onAddDataSourceView"
  | "onAddLinkedDatabaseView"
  | "onUpdateDatabaseSubItemsSettings"
  | "properties"
  | "sourceDatabaseId"
  | "workspaceId"
  | "subItemsSettings"
> & {
  onCloseSettings: () => void;
  open: boolean;
};

export function DataSourceSettingsSection({
  activeSourceDatabaseId,
  activeSourceDatabaseName,
  databaseId,
  databaseName,
  dataSources,
  isAddingDataSource,
  linkedViews = [],
  onAddDataSource,
  onAddDataSourceView,
  onAddLinkedDatabaseView,
  onUpdateDatabaseSubItemsSettings,
  onCloseSettings,
  open,
  properties,
  sourceDatabaseId,
  workspaceId,
  subItemsSettings,
}: DataSourceSettingsSectionProps) {
  const [manageDataSourcesOpen, setManageDataSourcesOpen] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [showLinkExistingPicker, setShowLinkExistingPicker] = useState(false);
  const [movingSource, setMovingSource] =
    useState<DatabaseSourceMenuItemType | null>(null);
  const [selectedLinkDatabaseId, setSelectedLinkDatabaseId] = useState<
    string | null
  >(null);
  const {
    data: selectedLinkDatabasePayload,
    isLoading: isLoadingSelectedLinkDatabase,
  } = useDatabase(selectedLinkDatabaseId);
  const { data: navigation, isLoading: isLoadingPages } = usePageNavigation(
    workspaceId,
    {
      enabled:
        open ||
        manageDataSourcesOpen ||
        sourcePickerOpen ||
        showLinkExistingPicker,
    },
  );
  const pagesById = new Map(
    (navigation?.pages ?? []).map((page) => [page.id, page]),
  );
  const databaseOptions = (
    navigation?.databases ?? []
  ).map<LinkableDatabaseOption>((database) => {
    const pageName = database.pageId
      ? pagesById.get(database.pageId)?.name || "Untitled"
      : "Standalone";

    return {
      icon: getDatabaseIconNode(database) ?? <Database />,
      label: database.name,
      searchText: `${database.name} ${pageName}`.trim(),
      value: database.id,
      pageName,
    };
  });
  const sourceDatabaseOptions = databaseOptions.filter(
    (database) => database.value !== activeSourceDatabaseId,
  );
  const linkableDatabaseOptions = databaseOptions.filter(
    (database) => database.value !== sourceDatabaseId,
  );
  const selectedDatabaseOption = selectedLinkDatabaseId
    ? (navigation?.databases ?? []).find(
        (database) => database.id === selectedLinkDatabaseId,
      )
    : null;
  const linkedViewKeys = new Set(
    linkedViews.map((linkedView) => getDatabaseLinkedViewKey(linkedView)),
  );
  const linkableDatabaseViewOptions =
    selectedLinkDatabasePayload?.views.map<LinkableDatabaseViewOption>(
      (view) => {
        const { Icon: ViewIcon } = getDatabaseViewTypePresentation(view.type);

        return {
          icon: <ViewIcon />,
          label: view.name,
          searchText:
            `${view.name} ${selectedLinkDatabasePayload.database.name}`.trim(),
          value: view.id,
          viewIcon: getDatabaseViewIcon(view.config),
          viewType: view.type,
        };
      },
    ) ?? [];
  const currentSourceDatabase = (navigation?.databases ?? []).find(
    (database) => database.id === activeSourceDatabaseId,
  );
  const currentSourceName =
    activeSourceDatabaseName ||
    dataSources.find((source) => source.id === activeSourceDatabaseId)?.name ||
    databaseName ||
    "No database";
  const currentSourceIcon = currentSourceDatabase
    ? getDatabaseIconNode(currentSourceDatabase)
    : null;

  useEffect(() => {
    if (open) return;

    setManageDataSourcesOpen(false);
    setSourcePickerOpen(false);
    setShowLinkExistingPicker(false);
    setSelectedLinkDatabaseId(null);
  }, [open]);

  const renderDataSourcePicker = (
    pickerOpen: boolean,
    onBack: () => void,
    options: LinkableDatabaseOption[],
  ) => (
    <div className="flex h-96 flex-col overflow-hidden">
      <div className="shrink-0 bg-popover">
        <DropDrawerItem
          onSelect={(event) => {
            event.preventDefault();
            if (selectedLinkDatabaseId) {
              setSelectedLinkDatabaseId(null);
            } else {
              onBack();
            }
          }}
        >
          <ChevronLeft />
          <span>Back</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {selectedLinkDatabaseId ? (
          isLoadingSelectedLinkDatabase ? (
            <DropDrawerItem disabled>Loading views...</DropDrawerItem>
          ) : selectedLinkDatabasePayload ? (
            <DatabaseSearchableMenuItems
              emptyMessage="No views available."
              inputAriaLabel="Search database views"
              inputIcon={<Search className="size-4" />}
              inputPlaceholder="Search views..."
              open={pickerOpen && Boolean(selectedLinkDatabaseId)}
              options={linkableDatabaseViewOptions}
              renderOption={(option) => {
                const viewOption = option as LinkableDatabaseViewOption;
                const linkedView = {
                  databaseId: selectedLinkDatabasePayload.database.id,
                  databaseName:
                    selectedLinkDatabasePayload.database.name ||
                    selectedDatabaseOption?.name ||
                    "Untitled database",
                  sourceKind: selectedLinkDatabasePayload.database.pageId
                    ? ("linked" as const)
                    : ("source" as const),
                  viewId: viewOption.value,
                  viewIcon: viewOption.viewIcon,
                  viewName: viewOption.label,
                  viewType: viewOption.viewType,
                };
                const alreadyLinked = linkedViewKeys.has(
                  getDatabaseLinkedViewKey(linkedView),
                );

                return (
                  <DropDrawerItem
                    key={viewOption.value}
                    onSelect={(event) => {
                      event.preventDefault();
                      onAddLinkedDatabaseView(linkedView);
                      onCloseSettings();
                    }}
                  >
                    {viewOption.icon}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{viewOption.label}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {selectedLinkDatabasePayload.database.name ||
                          selectedDatabaseOption?.name ||
                          "Untitled database"}
                      </div>
                    </div>
                    {alreadyLinked ? (
                      <Check className="ml-auto text-foreground" />
                    ) : null}
                  </DropDrawerItem>
                );
              }}
            />
          ) : (
            <DropDrawerItem disabled>Database unavailable.</DropDrawerItem>
          )
        ) : isLoadingPages ? (
          <DropDrawerItem disabled>Loading databases...</DropDrawerItem>
        ) : (
          <DatabaseSearchableMenuItems
            emptyMessage="No databases available."
            inputAriaLabel="Search databases"
            inputIcon={<Search className="size-4" />}
            inputPlaceholder="Search databases..."
            open={pickerOpen && !selectedLinkDatabaseId}
            options={options}
            renderOption={(option) => {
              const databaseOption = option as LinkableDatabaseOption;

              return (
                <DropDrawerItem
                  key={databaseOption.value}
                  onSelect={(event) => {
                    event.preventDefault();
                    setSelectedLinkDatabaseId(databaseOption.value);
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    {databaseOption.icon}
                    <div className="min-w-0">
                      <div className="truncate">{databaseOption.label}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {databaseOption.pageName}
                      </div>
                    </div>
                  </div>
                </DropDrawerItem>
              );
            }}
          />
        )}
      </div>
    </div>
  );

  return (
    <>
      <DropDrawerLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
        Data source settings
      </DropDrawerLabel>
      <DropDrawerSub
        id="database-view-source"
        onOpenChange={(nextOpen) => {
          setSourcePickerOpen(nextOpen);
          setSelectedLinkDatabaseId(null);
        }}
        open={sourcePickerOpen}
        title="Source"
      >
        <DropDrawerSubTrigger>
          <ViewSettingsRow
            icon={currentSourceIcon ?? <Database />}
            label="Source"
            right={
              <span className="block max-w-28 truncate">
                {currentSourceName}
              </span>
            }
          />
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-80 overflow-hidden">
          {renderDataSourcePicker(
            sourcePickerOpen,
            () => setSourcePickerOpen(false),
            sourceDatabaseOptions,
          )}
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerSub id="database-edit-properties" title="Edit properties">
        <DropDrawerSubTrigger>
          <Settings2 />
          <span>Edit properties</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-72">
          <DatabaseSearchableMenuItems
            emptyMessage="No properties yet."
            inputAriaLabel="Edit properties"
            inputIcon={<Settings2 className="size-4" />}
            inputPlaceholder="Edit property..."
            open={open}
            options={properties
              .filter((property) =>
                hasDatabasePropertyEditSettings(property.property.type),
              )
              .map((property) => {
                const PropertyIcon = getDatabasePropertyType(
                  property.property.type,
                ).icon;

                return {
                  icon: <PropertyIcon />,
                  label: property.property.name,
                  value: property.id,
                };
              })}
            renderOption={(option) => {
              const property = properties.find(
                (candidate) => candidate.id === option.value,
              );

              if (!property || !databaseId) {
                return (
                  <DropDrawerItem disabled>
                    {option.icon}
                    <span>{option.label}</span>
                  </DropDrawerItem>
                );
              }

              return (
                <DatabasePropertyEditSubmenu
                  config={property.property.config}
                  databaseId={databaseId}
                  databasePropertyId={property.id}
                  sourceDatabaseId={sourceDatabaseId}
                  sourceDatabaseName={databaseName}
                  sourcePropertyId={property.property.id}
                  type={property.property.type}
                  workspaceId={workspaceId}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </DatabasePropertyEditSubmenu>
              );
            }}
          />
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerSub>
        <DropDrawerSubTrigger>
          <Sparkles />
          <span>Automations</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent>
          <DropDrawerItem disabled>Automation settings</DropDrawerItem>
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerSub>
        <DropDrawerSubTrigger>
          <Sparkles />
          <span>AI Autofill</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent>
          <DropDrawerItem disabled>AI Autofill settings</DropDrawerItem>
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerSub>
        <DropDrawerSubTrigger>
          <FileText />
          <span>View archived pages</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent>
          <DropDrawerItem disabled>Archived pages</DropDrawerItem>
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerSub id="database-more-settings" title="More settings">
        <DropDrawerSubTrigger>
          <MoreHorizontal />
          <span>More settings</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent>
          <SubItemsSettingsSection
            onSettingsChange={onUpdateDatabaseSubItemsSettings}
            settings={subItemsSettings}
          />
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerSeparator />
      <DropDrawerSub
        onOpenChange={(nextOpen) => {
          setManageDataSourcesOpen(nextOpen);

          if (!nextOpen) {
            setShowLinkExistingPicker(false);
            setSelectedLinkDatabaseId(null);
          }
        }}
        open={manageDataSourcesOpen}
      >
        <DropDrawerSubTrigger>
          <Database />
          <span>Manage data sources</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-80 overflow-hidden">
          {showLinkExistingPicker ? (
            <div className="flex h-96 flex-col overflow-hidden">
              <div className="shrink-0 bg-popover">
                <DropDrawerItem
                  onSelect={(event) => {
                    event.preventDefault();
                    if (selectedLinkDatabaseId) {
                      setSelectedLinkDatabaseId(null);
                    } else {
                      setShowLinkExistingPicker(false);
                    }
                  }}
                >
                  <ChevronLeft />
                  <span>Back</span>
                </DropDrawerItem>
                <DropDrawerSeparator />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {selectedLinkDatabaseId ? (
                  isLoadingSelectedLinkDatabase ? (
                    <DropDrawerItem disabled>Loading views...</DropDrawerItem>
                  ) : selectedLinkDatabasePayload ? (
                    <DatabaseSearchableMenuItems
                      emptyMessage="No views available."
                      inputAriaLabel="Search database views"
                      inputIcon={<Search className="size-4" />}
                      inputPlaceholder="Search views..."
                      open={
                        manageDataSourcesOpen &&
                        showLinkExistingPicker &&
                        Boolean(selectedLinkDatabaseId)
                      }
                      options={linkableDatabaseViewOptions}
                      renderOption={(option) => {
                        const viewOption = option as LinkableDatabaseViewOption;
                        const linkedView = {
                          databaseId: selectedLinkDatabasePayload.database.id,
                          databaseName:
                            selectedLinkDatabasePayload.database.name ||
                            selectedDatabaseOption?.name ||
                            "Untitled database",
                          sourceKind: selectedLinkDatabasePayload.database
                            .pageId
                            ? ("linked" as const)
                            : ("source" as const),
                          viewId: viewOption.value,
                          viewIcon: viewOption.viewIcon,
                          viewName: viewOption.label,
                          viewType: viewOption.viewType,
                        };
                        const alreadyLinked = linkedViewKeys.has(
                          getDatabaseLinkedViewKey(linkedView),
                        );

                        return (
                          <DropDrawerItem
                            key={viewOption.value}
                            onSelect={(event) => {
                              event.preventDefault();
                              onAddLinkedDatabaseView(linkedView);
                              onCloseSettings();
                            }}
                          >
                            {viewOption.icon}
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{viewOption.label}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {selectedLinkDatabasePayload.database.name ||
                                  selectedDatabaseOption?.name ||
                                  "Untitled database"}
                              </div>
                            </div>
                            {alreadyLinked ? (
                              <Check className="ml-auto text-foreground" />
                            ) : null}
                          </DropDrawerItem>
                        );
                      }}
                    />
                  ) : (
                    <DropDrawerItem disabled>
                      Database unavailable.
                    </DropDrawerItem>
                  )
                ) : isLoadingPages ? (
                  <DropDrawerItem disabled>Loading databases...</DropDrawerItem>
                ) : (
                  <DatabaseSearchableMenuItems
                    emptyMessage="No databases available."
                    inputAriaLabel="Search databases"
                    inputIcon={<Search className="size-4" />}
                    inputPlaceholder="Search databases..."
                    open={
                      manageDataSourcesOpen &&
                      showLinkExistingPicker &&
                      !selectedLinkDatabaseId
                    }
                    options={linkableDatabaseOptions}
                    renderOption={(option) => {
                      const databaseOption = option as LinkableDatabaseOption;

                      return (
                        <DropDrawerItem
                          key={databaseOption.value}
                          onSelect={(event) => {
                            event.preventDefault();
                            setSelectedLinkDatabaseId(databaseOption.value);
                          }}
                        >
                          <div className="flex min-w-0 flex-1 items-start gap-2">
                            {databaseOption.icon}
                            <div className="min-w-0">
                              <div className="truncate">
                                {databaseOption.label}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {databaseOption.pageName}
                              </div>
                            </div>
                          </div>
                        </DropDrawerItem>
                      );
                    }}
                  />
                )}
              </div>
            </div>
          ) : (
            <>
              <DataSourceSectionLabel>Source</DataSourceSectionLabel>
              {dataSources.length > 0 ? (
                dataSources.map((source) => (
                  <DataSourceMenuItem
                    icon={getDatabaseIconNode(
                      (navigation?.databases ?? []).find(
                        (database) => database.id === source.id,
                      ) ?? {},
                    )}
                    item={source}
                    key={source.id}
                    onMove={(selectedSource) => {
                      setMovingSource(selectedSource);
                    }}
                    onAddView={onAddDataSourceView}
                  />
                ))
              ) : (
                <DropDrawerItem disabled>
                  <Database />
                  <span>No data sources</span>
                </DropDrawerItem>
              )}
              <DropDrawerItem
                disabled={!onAddDataSource || isAddingDataSource}
                onSelect={() => {
                  if (!onAddDataSource) return;
                  onCloseSettings();
                  onAddDataSource();
                }}
              >
                <DataSourceAddGlyph />
                <span>
                  {isAddingDataSource
                    ? "Adding data source..."
                    : "Add data source"}
                </span>
              </DropDrawerItem>
              <DropDrawerSeparator />
              <DataSourceSectionLabel>Linked</DataSourceSectionLabel>
              {linkedViews.length > 0
                ? linkedViews.map((view) => (
                    <LinkedDataSourceMenuItem
                      key={getDatabaseLinkedViewKey(view)}
                      view={view}
                    />
                  ))
                : null}
              <DropDrawerItem
                onSelect={(event) => {
                  event.preventDefault();
                  setShowLinkExistingPicker(true);
                }}
              >
                <DataSourceAddGlyph />
                <span>Link existing data source</span>
              </DropDrawerItem>
              <DropDrawerSeparator />
              <DropDrawerItem disabled>
                <CircleHelp />
                <span>Learn about data sources</span>
              </DropDrawerItem>
            </>
          )}
        </DropDrawerSubContent>
      </DropDrawerSub>
      <MoveDataSourceDialog
        hostDatabaseId={databaseId}
        onMoved={onCloseSettings}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setMovingSource(null);
        }}
        open={Boolean(movingSource)}
        source={movingSource}
        workspaceId={workspaceId}
      />
    </>
  );
}
