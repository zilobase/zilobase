import {
  ArrowDownUp,
  ArrowUpRightIcon,
  ChevronLeft,
  CircleHelp,
  Check,
  Database,
  Eye,
  EyeOff,
  FileText,
  Filter,
  GripVertical,
  CalendarRange,
  Kanban,
  Link as LinkIcon,
  Lock,
  MoreHorizontal,
  Palette,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { Reorder } from "framer-motion";
import { useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDatabase } from "@notelab/features/databases";
import { usePageNavigation } from "@notelab/features/pages";
import { cyclingColorTokens, getColorToken } from "@/lib/color-tokens";

import { getDatabasePropertyType } from "../core/database-property-types";
import {
  getDatabaseLinkedViewKey,
  getPropertyHiddenForView,
  getDatabaseFilterOperatorsForType,
  type DatabaseConditionalColorConfig,
  type DatabaseLinkedViewConfig,
} from "./database-view-config";
import { DatabasePropertyEditSubmenu } from "../properties/database-property-menu";
import { hasDatabasePropertyEditSettings } from "../properties/database-property-edit-submenu";
import {
  DatabaseSearchableMenuItems,
  type DatabaseSearchableMenuOption,
} from "./database-searchable-menu-items";
import {
  DatabaseFilterSubmenu,
  type DatabaseActiveFilter,
  type DatabaseFilterUpdatePatch,
} from "./database-filter-menu";
import { DatabaseConditionEditor } from "./database-condition-editor";
import {
  DatabaseSortSubmenu,
  type DatabaseActiveSort,
  type DatabaseSortUpdatePatch,
} from "./database-sort-menu";
import { NameColumnGlyph } from "../interactions/name-column-glyph";
import type { DatabaseActiveConditionalColor } from "./database-view-context";

type DatabaseViewProperty = {
  id: string;
  property: {
    config?: unknown;
    id: string;
    name: string;
    type: string;
  };
};

type DatabaseSourceMenuItem = {
  id: string;
  name: string;
  viewCount: number;
};

type LinkableDatabaseOption = DatabaseSearchableMenuOption & {
  pageName: string;
};

type LinkableDatabaseViewOption = DatabaseSearchableMenuOption & {
  viewType: string;
};

const DEFAULT_CONDITIONAL_COLOR = "green";

const conditionalColorApplyTargetOptions: {
  label: string;
  value: DatabaseConditionalColorConfig["applyTo"];
}[] = [
  { label: "Entire row", value: "entire-row" },
  { label: "This property", value: "this-property" },
];

function ViewSettingsRow({
  icon,
  label,
  right,
}: {
  icon: ReactNode;
  label: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {icon}
      <span className="truncate">{label}</span>
      {right ? (
        <span className="ml-auto shrink-0 text-muted-foreground">{right}</span>
      ) : null}
    </div>
  );
}

function DataSourceSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

function DataSourceAddGlyph() {
  return (
    <span className="inline-flex size-4 items-center justify-center text-base leading-none text-muted-foreground">
      +
    </span>
  );
}

function DataSourceMenuItem({ item }: { item: DatabaseSourceMenuItem }) {
  const viewLabel = `${item.viewCount} view${item.viewCount === 1 ? "" : "s"}`;

  return (
    <DropDrawerItem disabled>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Database className="text-muted-foreground" />
        <span className="truncate">{item.name}</span>
        <span className="ml-auto shrink-0 text-muted-foreground">
          {viewLabel}
        </span>
        <MoreHorizontal className="text-muted-foreground" />
      </div>
    </DropDrawerItem>
  );
}

function LinkedDataSourceMenuItem({
  view,
}: {
  view: DatabaseLinkedViewConfig;
}) {
  const ViewIcon = view.viewType === "kanban" ? Kanban : Table2;

  return (
    <DropDrawerItem disabled>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <ViewIcon className="text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate">{view.viewName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {view.databaseName}
          </div>
        </div>
        <ArrowUpRightIcon
          aria-label="Linked from another database"
          className="size-3 text-muted-foreground"
        />
      </div>
    </DropDrawerItem>
  );
}

function createConditionalColorId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function getPlainConditionalColorSettings(
  settings: DatabaseActiveConditionalColor[],
): DatabaseConditionalColorConfig[] {
  return settings.map(({ applyTo, color, filter, id, style }) => ({
    applyTo,
    color,
    filter: {
      id: filter.id,
      operator: filter.operator,
      propertyId: filter.propertyId,
      values: filter.values,
    },
    id,
    style,
  }));
}

function getFilterPropertyType(
  propertyId: string,
  properties: DatabaseViewProperty[],
) {
  if (propertyId === "name") {
    return "text";
  }

  return (
    properties.find((property) => property.id === propertyId)?.property.type ??
    "text"
  );
}

function getConditionalColorLabel(value: string) {
  return getColorToken(value).name;
}

function ConditionalColorPreview() {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="grid grid-cols-3 border-b text-[11px] text-muted-foreground">
        <div className="px-2 py-1.5">Aa Name</div>
        <div className="border-l px-2 py-1.5">Office</div>
        <div className="border-l px-2 py-1.5 text-right"># Units</div>
      </div>
      {[
        ["Keesha", "Miami", "160", "bg-emerald-100 dark:bg-emerald-700/55"],
        ["Rahul", "Orlando", "120", ""],
        ["Jackson", "Tampa", "140", "bg-emerald-100 dark:bg-emerald-700/55"],
        ["Marcus", "Tampa", "100", "bg-amber-100 dark:bg-amber-700/50"],
        ["John", "Miami", "100", "bg-rose-100 dark:bg-rose-700/55"],
      ].map(([name, office, units, colorClass]) => (
        <div
          className={cn("grid grid-cols-3 text-xs text-foreground", colorClass)}
          key={name}
        >
          <div className="px-2 py-1.5">{name}</div>
          <div className="border-l border-border/40 px-2 py-1.5">{office}</div>
          <div className="border-l border-border/40 px-2 py-1.5 text-right">
            {units}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConditionalColorPropertyPicker({
  filterFieldOptions,
  onSelect,
}: {
  filterFieldOptions: DatabaseSearchableMenuOption[];
  onSelect: (propertyId: string) => void;
}) {
  const [propertySearch, setPropertySearch] = useState("");
  const filteredOptions = useMemo(() => {
    const query = propertySearch.trim().toLowerCase();

    if (!query) {
      return filterFieldOptions;
    }

    return filterFieldOptions.filter((option) =>
      option.label.toLowerCase().includes(query),
    );
  }, [filterFieldOptions, propertySearch]);

  return (
    <div className="rounded-md border p-2">
      <div className="mb-1 flex h-8 items-center gap-2 px-2 text-xs">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          aria-label="Search for a property"
          autoFocus
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70"
          onChange={(event) => setPropertySearch(event.target.value)}
          placeholder="Search for a property..."
          value={propertySearch}
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => (
            <button
              className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
              key={option.value}
              onClick={() => onSelect(option.value)}
              type="button"
            >
              {option.icon}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </button>
          ))
        ) : (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No properties found
          </div>
        )}
      </div>
    </div>
  );
}

function ConditionalColorRuleItem({
  filterFieldOptions,
  filterValueOptionsByField,
  isDragging,
  properties,
  setting,
  onDragEnd,
  onDragStart,
  onRemove,
  onUpdateFilter,
  onUpdateSetting,
}: {
  filterFieldOptions: DatabaseSearchableMenuOption[];
  filterValueOptionsByField: Record<string, DatabaseSearchableMenuOption[]>;
  isDragging: boolean;
  properties: DatabaseViewProperty[];
  setting: DatabaseActiveConditionalColor;
  onDragEnd: () => void;
  onDragStart: () => void;
  onRemove: () => void;
  onUpdateFilter: (patch: DatabaseFilterUpdatePatch) => void;
  onUpdateSetting: (patch: Partial<DatabaseConditionalColorConfig>) => void;
}) {
  const filter = setting.filter;
  const color = getColorToken(setting.color);
  const applyTarget =
    conditionalColorApplyTargetOptions.find(
      (option) => option.value === setting.applyTo,
    ) ?? conditionalColorApplyTargetOptions[0];

  return (
    <DatabaseConditionEditor
      condition={filter}
      drag={{
        ariaLabel: "Drag conditional color setting",
        isDragging,
        onDragEnd,
        onDragStart,
        value: setting.id,
      }}
      fieldOptions={filterFieldOptions}
      footer={
        <>
          <div className="grid grid-cols-2 gap-2 pl-6">
            <Select
              onValueChange={(value) => onUpdateSetting({ color: value })}
              value={setting.color}
            >
              <SelectTrigger className="h-8 text-xs">
                <span
                  className={cn(
                    "size-3 rounded-sm border",
                    color.backgroundClass,
                  )}
                />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {cyclingColorTokens.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value ?? "default"}
                  >
                    <span
                      className={cn(
                        "mr-2 inline-flex size-3 rounded-sm border align-middle",
                        option.backgroundClass,
                      )}
                    />
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) =>
                onUpdateSetting({
                  applyTo: value as DatabaseConditionalColorConfig["applyTo"],
                })
              }
              value={setting.applyTo}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {conditionalColorApplyTargetOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-1.5 pl-6 text-[11px] text-muted-foreground">
            {getConditionalColorLabel(setting.color)} - {applyTarget.label}
          </div>
        </>
      }
      layout="stacked"
      removeIcon={<Trash2 className="size-3.5" />}
      removeLabel="Delete conditional color setting"
      valueOptions={filterValueOptionsByField[filter.propertyId] ?? []}
      onFieldChange={(field) => {
        const propertyType = getFilterPropertyType(field, properties);

        onUpdateFilter({
          operator:
            getDatabaseFilterOperatorsForType(propertyType)[0]?.value ?? "is",
          propertyId: field,
          values: [],
        });
      }}
      onRemove={onRemove}
      onUpdate={onUpdateFilter}
    />
  );
}

function ConditionalColorPanel({
  filterFieldOptions,
  filterValueOptionsByField,
  properties,
  settings,
  onSettingsChange,
}: {
  filterFieldOptions: DatabaseSearchableMenuOption[];
  filterValueOptionsByField: Record<string, DatabaseSearchableMenuOption[]>;
  properties: DatabaseViewProperty[];
  settings: DatabaseActiveConditionalColor[];
  onSettingsChange: (settings: DatabaseConditionalColorConfig[]) => void;
}) {
  const [isChoosingProperty, setIsChoosingProperty] = useState(false);
  const [draggingSettingId, setDraggingSettingId] = useState<string | null>(
    null,
  );

  const saveSettings = (nextSettings: DatabaseConditionalColorConfig[]) => {
    onSettingsChange(nextSettings);
  };

  const addSetting = (propertyId: string) => {
    const propertyType = getFilterPropertyType(propertyId, properties);

    saveSettings([
      ...getPlainConditionalColorSettings(settings),
      {
        applyTo: "entire-row",
        color: DEFAULT_CONDITIONAL_COLOR,
        filter: {
          id: createConditionalColorId("conditional-filter"),
          operator:
            getDatabaseFilterOperatorsForType(propertyType)[0]?.value ?? "is",
          propertyId,
          values: [],
        },
        id: createConditionalColorId("conditional-color"),
        style: "page-background",
      },
    ]);
    setIsChoosingProperty(false);
  };

  const updateSetting = (
    settingId: string,
    updates: Partial<DatabaseConditionalColorConfig>,
  ) => {
    saveSettings(
      getPlainConditionalColorSettings(settings).map((setting) =>
        setting.id === settingId ? { ...setting, ...updates } : setting,
      ),
    );
  };

  const updateFilter = (
    settingId: string,
    updates: DatabaseFilterUpdatePatch,
  ) => {
    saveSettings(
      getPlainConditionalColorSettings(settings).map((setting) =>
        setting.id === settingId
          ? { ...setting, filter: { ...setting.filter, ...updates } }
          : setting,
      ),
    );
  };

  const removeSetting = (settingId: string) => {
    saveSettings(
      getPlainConditionalColorSettings(settings).filter(
        (setting) => setting.id !== settingId,
      ),
    );
  };

  const reorderSettings = (settingIds: string[]) => {
    const settingsById = new Map(
      getPlainConditionalColorSettings(settings).map((setting) => [
        setting.id,
        setting,
      ]),
    );
    const reorderedSettings = settingIds.flatMap((settingId) => {
      const setting = settingsById.get(settingId);

      return setting ? [setting] : [];
    });
    const remainingSettings = getPlainConditionalColorSettings(settings).filter(
      (setting) => !settingIds.includes(setting.id),
    );

    saveSettings([...reorderedSettings, ...remainingSettings]);
  };

  return (
    <div className="w-80 max-w-[calc(100vw-2rem)] p-1">
      <div className="mb-2 flex items-center gap-2 px-1 py-1">
        <Palette className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 text-sm font-semibold">
          Conditional color
        </div>
      </div>
      {settings.length === 0 && !isChoosingProperty ? (
        <div className="mb-2 px-1">
          <ConditionalColorPreview />
        </div>
      ) : null}
      <Reorder.Group
        as="div"
        axis="y"
        className="space-y-2 px-1"
        layoutScroll
        values={settings.map((setting) => setting.id)}
        onReorder={reorderSettings}
      >
        {settings.map((setting) => (
          <ConditionalColorRuleItem
            filterFieldOptions={filterFieldOptions}
            filterValueOptionsByField={filterValueOptionsByField}
            isDragging={draggingSettingId === setting.id}
            key={setting.id}
            properties={properties}
            setting={setting}
            onDragEnd={() => setDraggingSettingId(null)}
            onDragStart={() => setDraggingSettingId(setting.id)}
            onRemove={() => removeSetting(setting.id)}
            onUpdateFilter={(updates) => updateFilter(setting.id, updates)}
            onUpdateSetting={(updates) => updateSetting(setting.id, updates)}
          />
        ))}
      </Reorder.Group>
      <div className="mt-2 px-1">
        {isChoosingProperty ? (
          <ConditionalColorPropertyPicker
            filterFieldOptions={filterFieldOptions}
            onSelect={addSetting}
          />
        ) : (
          <Button
            className="h-8 w-full justify-start gap-2 text-xs"
            disabled={filterFieldOptions.length === 0}
            onClick={() => setIsChoosingProperty(true)}
            type="button"
            variant="secondary"
          >
            <Plus className="size-4" />
            <span>
              {settings.length > 0 ? "Add another" : "New color setting"}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}

export function DatabaseViewSettingsMenu({
  activeConditionalColors,
  activeDatabaseFilters,
  activeDatabaseSorts,
  activeViewType,
  dateProperties = [],
  datePropertyId = null,
  addableFilterFieldOptions,
  addableSortFieldOptions,
  canAddDatabaseFilter,
  canAddDatabaseSort,
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
  onSetViewDateProperty,
  onSetViewGroupProperty,
  onSetViewType,
  onTogglePropertyTitles,
  onTogglePropertyVisibility,
  onUpdateDatabaseFilter,
  onUpdateDatabaseSort,
  properties,
  sortFieldOptions,
  sourceDatabaseId,
  viewConfig,
  visiblePropertyCount,
  showPropertyTitles,
}: {
  activeConditionalColors: DatabaseActiveConditionalColor[];
  activeDatabaseFilters: DatabaseActiveFilter[];
  activeDatabaseSorts: DatabaseActiveSort[];
  activeViewType?: string;
  dateProperties?: DatabaseViewProperty[];
  datePropertyId?: string | null;
  addableFilterFieldOptions: DatabaseSearchableMenuOption[];
  addableSortFieldOptions: DatabaseSearchableMenuOption[];
  canAddDatabaseFilter: boolean;
  canAddDatabaseSort: boolean;
  databaseId?: string;
  databaseName?: string;
  dataSources: DatabaseSourceMenuItem[];
  draftViewTitle: string;
  filterFieldOptions: DatabaseSearchableMenuOption[];
  filterValueOptionsByField: Record<string, DatabaseSearchableMenuOption[]>;
  groupProperties: DatabaseViewProperty[];
  groupPropertyId: string | null;
  linkedViews?: DatabaseLinkedViewConfig[];
  titlePropertyLabel: string;
  open?: boolean;
  workspaceId?: string;
  onAddLinkedDatabaseView: (view: DatabaseLinkedViewConfig) => void;
  onCopyDatabaseViewLink: () => void;
  onOpenChange?: (open: boolean) => void;
  onClearDatabaseFilter: () => void;
  onClearDatabaseSort: () => void;
  onCreateDatabaseFilter: (field: string) => void;
  onCreateDatabaseSort: (field: string) => void;
  onDraftViewTitleChange: (title: string) => void;
  onRemoveDatabaseFilter: (index: number) => void;
  onRemoveDatabaseSort: (index: number) => void;
  onReorderDatabaseFilters: (filterIds: string[]) => void;
  onSaveDatabaseConditionalColors: (
    settings: DatabaseConditionalColorConfig[],
  ) => void;
  onSaveDatabaseViewTitle: (title: string) => void;
  onSetViewDateProperty: (datePropertyId: string | null) => void;
  onSetViewGroupProperty: (groupPropertyId: string | null) => void;
  onSetViewType: (type: "table" | "kanban" | "timeline") => void;
  onTogglePropertyTitles: () => void;
  onTogglePropertyVisibility: (propertyId: string) => void;
  onUpdateDatabaseFilter: (
    index: number,
    patch: DatabaseFilterUpdatePatch,
  ) => void;
  onUpdateDatabaseSort: (index: number, patch: DatabaseSortUpdatePatch) => void;
  properties: DatabaseViewProperty[];
  sortFieldOptions: DatabaseSearchableMenuOption[];
  sourceDatabaseId?: string;
  viewConfig?: unknown;
  visiblePropertyCount: number;
  showPropertyTitles: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  };
  const [manageDataSourcesOpen, setManageDataSourcesOpen] = useState(false);
  const [showLinkExistingPicker, setShowLinkExistingPicker] = useState(false);
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
      enabled: manageDataSourcesOpen || showLinkExistingPicker,
    },
  );
  const isKanbanView = activeViewType === "kanban";
  const isTimelineView = activeViewType === "timeline";
  const ViewTypeIcon = isKanbanView
    ? Kanban
    : isTimelineView
      ? CalendarRange
      : Table2;
  const viewTypeLabel = isKanbanView
    ? "Kanban"
    : isTimelineView
      ? "Timeline"
      : "Table";
  const activeDateProperty = dateProperties.find(
    (property) => property.property.id === datePropertyId,
  );
  const activeGroupProperty = groupProperties.find(
    (property) => property.property.id === groupPropertyId,
  );
  const pagesById = new Map(
    (navigation?.pages ?? []).map((page) => [page.id, page]),
  );
  const linkableDatabaseOptions = (navigation?.databases ?? [])
    .filter((database) => database.id !== sourceDatabaseId)
    .map<LinkableDatabaseOption>((database) => {
      const pageName = database.pageId
        ? pagesById.get(database.pageId)?.name || "Untitled"
        : "Standalone";

      return {
        icon: <Database />,
        label: database.name,
        searchText: `${database.name} ${pageName}`.trim(),
        value: database.id,
        pageName,
      };
    });
  const selectedDatabaseOption = selectedLinkDatabaseId
    ? linkableDatabaseOptions.find(
        (option) => option.value === selectedLinkDatabaseId,
      )
    : null;
  const linkedViewKeys = new Set(
    linkedViews.map((linkedView) => getDatabaseLinkedViewKey(linkedView)),
  );
  const linkableDatabaseViewOptions =
    selectedLinkDatabasePayload?.views.map<LinkableDatabaseViewOption>(
      (view) => {
        const ViewIcon =
          view.type === "kanban"
            ? Kanban
            : view.type === "timeline"
              ? CalendarRange
              : Table2;

        return {
          icon: <ViewIcon />,
          label: view.name,
          searchText:
            `${view.name} ${selectedLinkDatabasePayload.database.name}`.trim(),
          value: view.id,
          viewType: view.type,
        };
      },
    ) ?? [];

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      setManageDataSourcesOpen(false);
      setShowLinkExistingPicker(false);
      setSelectedLinkDatabaseId(null);
    }
  };

  return (
    <DropDrawer open={open} onOpenChange={handleOpenChange}>
      <DropDrawerTrigger asChild>
        <Button
          aria-label="Open view settings"
          className="text-muted-foreground"
          size="icon"
          type="button"
          variant="ghost"
        >
          <Settings2 />
        </Button>
      </DropDrawerTrigger>
      <DropDrawerContent
        align="start"
        className="w-72"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="text-sm font-semibold text-foreground">
            View settings
          </div>
          <button
            aria-label="Close view settings"
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setOpen(false)}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-1.5 px-1.5 py-1">
          <Table2 className="size-4 shrink-0 text-muted-foreground" />
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
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <ViewSettingsRow
              icon={<ViewTypeIcon />}
              label="Layout"
              right={viewTypeLabel}
            />
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-72">
            <DropDrawerItem onSelect={() => onSetViewType("table")}>
              <Table2 />
              <span>Table</span>
              {!isKanbanView && !isTimelineView ? (
                <Check className="ml-auto text-foreground" />
              ) : null}
            </DropDrawerItem>
            <DropDrawerItem onSelect={() => onSetViewType("kanban")}>
              <Kanban />
              <span>Kanban</span>
              {isKanbanView ? (
                <Check className="ml-auto text-foreground" />
              ) : null}
            </DropDrawerItem>
            <DropDrawerItem onSelect={() => onSetViewType("timeline")}>
              <CalendarRange />
              <span>Timeline</span>
              {isTimelineView ? (
                <Check className="ml-auto text-foreground" />
              ) : null}
            </DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
        {isTimelineView ? (
          <DropDrawerSub>
            <DropDrawerSubTrigger>
              <ViewSettingsRow
                icon={<CalendarRange />}
                label="Date"
                right={activeDateProperty?.property.name ?? "None"}
              />
            </DropDrawerSubTrigger>
            <DropDrawerSubContent className="w-72">
              {dateProperties.length > 0 ? (
                dateProperties.map((property) => {
                  const PropertyIcon = getDatabasePropertyType(
                    property.property.type,
                  ).icon;
                  const isSelected = property.property.id === datePropertyId;

                  return (
                    <DropDrawerItem
                      key={property.id}
                      onSelect={() =>
                        onSetViewDateProperty(property.property.id)
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
                <DropDrawerItem disabled>No date properties yet</DropDrawerItem>
              )}
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
            <Eye />
            <span>Show property titles</span>
            <Switch
              checked={showPropertyTitles}
              className="ml-auto pointer-events-none"
              size="sm"
              tabIndex={-1}
            />
          </DropDrawerItem>
        ) : null}
        <DropDrawerSub>
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
        <DropDrawerSub>
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
        <DropDrawerSub>
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
        <DropDrawerLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Data source settings
        </DropDrawerLabel>
        <DropDrawerItem disabled>
          <ViewSettingsRow
            icon={<Database />}
            label="Source"
            right={
              <span className="block max-w-28 truncate">
                {databaseName || "Untitled database"}
              </span>
            }
          />
        </DropDrawerItem>
        <DropDrawerSub>
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
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <MoreHorizontal />
            <span>More settings</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>More database settings</DropDrawerItem>
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
              <div className="h-96 overflow-y-auto overscroll-contain">
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
                            selectedDatabaseOption?.label ||
                            "Untitled database",
                          viewId: viewOption.value,
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
                              setOpen(false);
                            }}
                          >
                            {viewOption.icon}
                            <div className="min-w-0 flex-1">
                              <div className="truncate">{viewOption.label}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {selectedLinkDatabasePayload.database.name ||
                                  selectedDatabaseOption?.label ||
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
            ) : (
              <>
                <DataSourceSectionLabel>Source</DataSourceSectionLabel>
                {dataSources.length > 0 ? (
                  dataSources.map((source) => (
                    <DataSourceMenuItem item={source} key={source.id} />
                  ))
                ) : (
                  <DropDrawerItem disabled>
                    <Database />
                    <span>No data sources</span>
                  </DropDrawerItem>
                )}
                <DropDrawerItem disabled>
                  <DataSourceAddGlyph />
                  <span>Add data source</span>
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
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <Lock />
            <span>Lock database</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>Database lock settings</DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
      </DropDrawerContent>
    </DropDrawer>
  );
}
