import {
  Cable,
  ChevronLeft,
  CircleHelp,
  Database,
  FileText,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
} from "@/components/icons";
import { useEffect, useState } from "react";

import {
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
} from "@/components/ui/dropdrawer";
import { Input } from "@/components/ui/input";
import { useDatabase } from "@zilobase/features/databases";
import { usePageNavigation, type PageDatabase } from "@zilobase/features/pages";
import { DEFAULT_DATABASE_ITEM_ICON } from "@/lib/item-icons";
import { getDatabaseIconNode, PageIconDisplay } from "@/lib/page-icon";

import { getDatabasePropertyType } from "../../core/database-property-types";
import { hasDatabasePropertyEditSettings } from "../../properties/property-settings";
import { DatabasePropertyEditSubmenu } from "../../properties/database-property-menu";
import {
  DatabaseSearchableMenuItems,
  type DatabaseSearchableMenuOption,
} from "../database-searchable-menu-items";
import { getDatabaseViewIcon } from "../database-view-config";
import {
  DataSourceAddGlyph,
  DataSourceMenuItem,
  DataSourceSectionLabel,
  LinkedDataSourceMenuItem,
} from "./data-source-items";
import { partitionManagedDataSources } from "./data-source-model";
import type { DatabaseViewSettingsMenuProps } from "./types";
import { ViewTypeOptionGrid } from "./view-type-option-grid";
import {
  getDatabaseViewTypePresentation,
  type DatabaseViewType,
} from "./view-type-options";
import { ViewSettingsRow } from "./view-settings-row";
import { SubItemsSettingsSection } from "./sub-items-settings";

type LinkableDatabaseOption = DatabaseSearchableMenuOption & {
  database: PageDatabase;
  pageName: string;
};

type DataSourceSettingsSectionProps = Pick<
  DatabaseViewSettingsMenuProps,
  | "activeDataSourceId"
  | "activeDataSourceName"
  | "databaseId"
  | "dataSources"
  | "isAddingDataSource"
  | "onAddDataSource"
  | "onAddDataSourceView"
  | "onLinkDataSourceView"
  | "onReplaceActiveViewSource"
  | "onUnlinkDataSource"
  | "onUpdateDatabaseSubItemsSettings"
  | "properties"
  | "hostDatabaseId"
  | "workspaceId"
  | "subItemsSettings"
> & {
  onCloseSettings: () => void;
  open: boolean;
};

function LinkExistingDataSourcePicker({
  databaseOptions,
  isLoadingPages,
  onCloseSettings,
  onLinkDataSourceView,
}: {
  databaseOptions: LinkableDatabaseOption[];
  isLoadingPages: boolean;
  onCloseSettings: () => void;
  onLinkDataSourceView: DatabaseViewSettingsMenuProps["onLinkDataSourceView"];
}) {
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(
    null,
  );
  const [creatingView, setCreatingView] = useState(false);
  const [viewName, setViewName] = useState("");
  const { data: databasePayload, isLoading } =
    useDatabase(selectedDatabaseId);
  const selectedDatabase = selectedDatabaseId
    ? databaseOptions.find((option) => option.value === selectedDatabaseId)
    : null;
  const selectedDataSourceId =
    databasePayload?.activeDataSource?.id ??
    selectedDatabase?.database.views[0]?.dataSourceId;
  const views =
    databasePayload?.views.filter(
      (view) =>
        !selectedDataSourceId || view.dataSourceId === selectedDataSourceId,
    ) ?? [];

  const resetSelection = () => {
    setSelectedDatabaseId(null);
    setCreatingView(false);
    setViewName("");
  };

  const linkView = ({
    config,
    id,
    name,
    type,
  }: {
    config?: unknown;
    id: string;
    name: string;
    type: string;
  }) => {
    if (!selectedDatabaseId || !selectedDataSourceId) return;

    onLinkDataSourceView({
      dataSourceId: selectedDataSourceId,
      dataSourceName:
        databasePayload?.activeDataSource?.name ||
        selectedDatabase?.database.name ||
        "Untitled data source",
      parentDatabaseId: selectedDatabaseId,
      viewConfig: config,
      viewIcon: getDatabaseViewIcon(config),
      viewId: id,
      viewName: name,
      viewType: type,
    });
    onCloseSettings();
  };

  if (selectedDatabaseId && creatingView) {
    return (
      <div className="flex min-h-0 flex-col gap-2 p-2">
        <DropDrawerItem
          onSelect={(event) => {
            event.preventDefault();
            setCreatingView(false);
            setViewName("");
          }}
        >
          <ChevronLeft />
          <span>Choose another view</span>
        </DropDrawerItem>
        <Input
          aria-label="Linked view name"
          autoFocus
          onChange={(event) => setViewName(event.currentTarget.value)}
          placeholder="View name"
          value={viewName}
        />
        <ViewTypeOptionGrid
          className="p-0"
          onSelect={(type: DatabaseViewType) => {
            const { label } = getDatabaseViewTypePresentation(type);
            linkView({
              id: `new-${type}`,
              name: viewName.trim() || label,
              type,
            });
          }}
        />
      </div>
    );
  }

  if (selectedDatabaseId) {
    return (
      <div className="flex min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b p-1">
          <DropDrawerItem
            onSelect={(event) => {
              event.preventDefault();
              resetSelection();
            }}
          >
            <ChevronLeft />
            <span>Choose another data source</span>
          </DropDrawerItem>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
          {isLoading ? (
            <DropDrawerItem disabled>Loading views...</DropDrawerItem>
          ) : databasePayload ? (
            <>
              <DropDrawerItem
                onSelect={(event) => {
                  event.preventDefault();
                  setCreatingView(true);
                }}
              >
                <Plus />
                <span>Create a new view</span>
              </DropDrawerItem>
              <DataSourceSectionLabel>
                Views on {databasePayload.activeDataSource?.name || "data source"}
              </DataSourceSectionLabel>
              {views.length > 0 ? (
                views.map((view) => {
                  const { Icon } = getDatabaseViewTypePresentation(view.type);

                  return (
                    <DropDrawerItem
                      key={view.id}
                      onSelect={() =>
                        linkView({
                          config: view.config,
                          id: view.id,
                          name: view.name,
                          type: view.type,
                        })
                      }
                    >
                      <Icon />
                      <span className="truncate">{view.name}</span>
                    </DropDrawerItem>
                  );
                })
              ) : (
                <DropDrawerItem disabled>No existing views</DropDrawerItem>
              )}
            </>
          ) : (
            <DropDrawerItem disabled>Data source unavailable.</DropDrawerItem>
          )}
        </div>
      </div>
    );
  }

  return isLoadingPages ? (
    <DropDrawerItem disabled>Loading data sources...</DropDrawerItem>
  ) : (
    <DatabaseSearchableMenuItems
      emptyMessage="No data sources available."
      inputAriaLabel="Search data sources"
      inputIcon={<Search className="size-4" />}
      inputPlaceholder="Search data sources..."
      open
      options={databaseOptions}
      pinSearch
      renderOption={(option) => {
        const databaseOption = option as LinkableDatabaseOption;

        return (
          <DropDrawerItem
            key={databaseOption.value}
            onSelect={(event) => {
              event.preventDefault();
              setSelectedDatabaseId(databaseOption.value);
            }}
          >
            {databaseOption.icon}
            <div className="min-w-0 flex-1">
              <div className="truncate">{databaseOption.label}</div>
              <div className="truncate text-xs text-muted-foreground">
                {databaseOption.pageName}
              </div>
            </div>
          </DropDrawerItem>
        );
      }}
    />
  );
}

export function DataSourceSettingsSection({
  activeDataSourceId,
  activeDataSourceName,
  databaseId,
  dataSources,
  isAddingDataSource,
  onAddDataSource,
  onAddDataSourceView,
  onLinkDataSourceView,
  onReplaceActiveViewSource,
  onUnlinkDataSource,
  onUpdateDatabaseSubItemsSettings,
  onCloseSettings,
  open,
  properties,
  hostDatabaseId,
  workspaceId,
  subItemsSettings,
}: DataSourceSettingsSectionProps) {
  const [manageDataSourcesOpen, setManageDataSourcesOpen] = useState(false);
  const [linkExistingOpen, setLinkExistingOpen] = useState(false);
  const [linkExistingSession, setLinkExistingSession] = useState(0);
  const { data: navigation, isLoading: isLoadingPages } = usePageNavigation(
    workspaceId,
    {
      enabled: open,
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
      database,
      icon: getDatabaseIconNode(database) ?? (
        <PageIconDisplay size="sm" value={DEFAULT_DATABASE_ITEM_ICON} />
      ),
      label: database.name,
      searchText: `${database.name} ${pageName}`.trim(),
      value: database.id,
      pageName,
    };
  });
  const resolvedHostDatabaseId = hostDatabaseId ?? databaseId;
  const dataSourceOptions = databaseOptions;
  const linkableDatabaseOptions = databaseOptions.filter(
    (database) => database.value !== resolvedHostDatabaseId,
  );
  const currentSourceName =
    activeDataSourceName ||
    dataSources.find((source) => source.id === activeDataSourceId)?.name ||
    "No data source";
  const { linked: linkedDataSources, owned: ownedDataSources } =
    partitionManagedDataSources(dataSources, resolvedHostDatabaseId);

  useEffect(() => {
    if (open) return;

    setManageDataSourcesOpen(false);
    setLinkExistingOpen(false);
    setLinkExistingSession((session) => session + 1);
  }, [open]);

  const renderDataSourcePicker = (options: LinkableDatabaseOption[]) =>
    isLoadingPages ? (
      <DropDrawerItem disabled>Loading databases...</DropDrawerItem>
    ) : (
      <DatabaseSearchableMenuItems
        emptyMessage="No databases available."
        inputAriaLabel="Search databases"
        inputIcon={<Search className="size-4" />}
        inputPlaceholder="Search databases..."
        open={open}
        options={options}
        pinSearch
        renderOption={(option) => {
          const databaseOption = option as LinkableDatabaseOption;
          const sourceView = databaseOption.database.views[0];

          return (
            <DropDrawerItem
              disabled={!sourceView}
              key={databaseOption.value}
              onSelect={() => {
                if (!sourceView) return;

                const sourceSelection = {
                  dataSourceId: sourceView.dataSourceId,
                  dataSourceName:
                    databaseOption.database.name || "Untitled database",
                  parentDatabaseId: databaseOption.database.id,
                  viewId: sourceView.id,
                  viewName: sourceView.name,
                  viewType: sourceView.type,
                };

                onReplaceActiveViewSource(sourceSelection);
                onCloseSettings();
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
    );

  return (
    <>
      <DropDrawerLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
        Data source settings
      </DropDrawerLabel>
      <DropDrawerSub
        displayMode="inline"
        id="database-view-source"
        title="Source"
      >
        <DropDrawerSubTrigger>
          <ViewSettingsRow
            icon={<Cable />}
            label="Source"
            right={
              <span className="block max-w-28 truncate">
                {currentSourceName}
              </span>
            }
          />
        </DropDrawerSubTrigger>
        <DropDrawerSubContent
          className="w-72 p-0"
          style={{ overflow: "hidden" }}
        >
          {renderDataSourcePicker(dataSourceOptions)}
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
                  sourceDatabaseId={hostDatabaseId}
                  sourceDatabaseName={currentSourceName}
                  sourcePropertyId={property.property.id}
                  type={property.property.type}
                  workspaceId={workspaceId}
                  displayMode="inline"
                  title={property.property.name}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </DatabasePropertyEditSubmenu>
              );
            }}
          />
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerSub title="Automations">
        <DropDrawerSubTrigger>
          <Sparkles />
          <span>Automations</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-72">
          <DropDrawerItem disabled>Automation settings</DropDrawerItem>
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerSub title="AI Autofill">
        <DropDrawerSubTrigger>
          <Sparkles />
          <span>AI Autofill</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-72">
          <DropDrawerItem disabled>AI Autofill settings</DropDrawerItem>
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerSub title="View archived pages">
        <DropDrawerSubTrigger>
          <FileText />
          <span>View archived pages</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-72">
          <DropDrawerItem disabled>Archived pages</DropDrawerItem>
        </DropDrawerSubContent>
      </DropDrawerSub>
      <DropDrawerSub
        displayMode="nested"
        id="database-more-settings"
        title="More settings"
      >
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
        title="Manage data sources"
        onOpenChange={(nextOpen) => {
          setManageDataSourcesOpen(nextOpen);
          if (!nextOpen) {
            setLinkExistingOpen(false);
            setLinkExistingSession((session) => session + 1);
          }
        }}
        open={manageDataSourcesOpen}
      >
        <DropDrawerSubTrigger>
          <Database />
          <span>Manage data sources</span>
        </DropDrawerSubTrigger>
        <DropDrawerSubContent className="w-72 max-h-[min(32rem,calc(100vh-5rem))]">
          <DataSourceSectionLabel>Sources</DataSourceSectionLabel>
          {ownedDataSources.length > 0 ? (
            ownedDataSources.map((source) => (
              <DataSourceMenuItem
                icon={
                  getDatabaseIconNode(source) ?? (
                    <PageIconDisplay
                      size="sm"
                      value={DEFAULT_DATABASE_ITEM_ICON}
                    />
                  )
                }
                item={source}
                key={source.id}
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
          {linkedDataSources.map((source) => (
            <LinkedDataSourceMenuItem
              icon={
                getDatabaseIconNode(source) ?? (
                  <PageIconDisplay
                    size="sm"
                    value={DEFAULT_DATABASE_ITEM_ICON}
                  />
                )
              }
              item={source}
              key={source.id}
              onUnlink={onUnlinkDataSource}
            />
          ))}
          <DropDrawerSub
            onOpenChange={(nextOpen) => {
              setLinkExistingOpen(nextOpen);
              if (!nextOpen) {
                setLinkExistingSession((session) => session + 1);
              }
            }}
            open={linkExistingOpen}
            title="Link existing data source"
          >
            <DropDrawerSubTrigger>
              <DataSourceAddGlyph />
              <span>Link existing data source</span>
            </DropDrawerSubTrigger>
            <DropDrawerSubContent
              className="w-72 p-0"
              style={{ overflow: "hidden" }}
            >
              <LinkExistingDataSourcePicker
                databaseOptions={linkableDatabaseOptions}
                isLoadingPages={isLoadingPages}
                key={linkExistingSession}
                onCloseSettings={onCloseSettings}
                onLinkDataSourceView={onLinkDataSourceView}
              />
            </DropDrawerSubContent>
          </DropDrawerSub>
          <DropDrawerSeparator />
          <DropDrawerItem disabled>
            <CircleHelp />
            <span>Learn about data sources</span>
          </DropDrawerItem>
        </DropDrawerSubContent>
      </DropDrawerSub>
    </>
  );
}
