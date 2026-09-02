import type {
  DatabaseActiveConditionalColor,
  DatabaseSourceViewSelection,
} from "../../model/database-view-context";
import type {
  DatabaseConditionalColorConfig,
  DatabaseLayoutSettings,
  DatabaseSubItemsSettings,
} from "../../model/database-view-config";
import type {
  DatabaseActiveFilter,
  DatabaseFilterUpdatePatch,
} from "../../view/database-filter-menu";
import type { DatabaseSearchableMenuOption } from "../../view/database-searchable-menu-items";
import type {
  DatabaseActiveSort,
  DatabaseSortUpdatePatch,
} from "../../view/database-sort-menu";
import type { DatabaseChartSettings } from "../../chart/model/database-chart-config";
import type { DatabaseViewType } from "./view-type-options";

export type DatabaseViewProperty = {
  id: string;
  property: {
    config?: unknown;
    id: string;
    name: string;
    type: string;
  };
};

export type DatabaseSourceMenuItem = {
  config?: unknown;
  hiddenViewCount?: number;
  id: string;
  name: string;
  parentDatabaseId: string;
  position?: number;
  viewCount: number;
};

export type DatabaseViewSettingsMenuProps = {
  activeConditionalColors: DatabaseActiveConditionalColor[];
  allContentWrapped: boolean;
  activeDatabaseFilters: DatabaseActiveFilter[];
  activeDatabaseSorts: DatabaseActiveSort[];
  activeViewType?: string;
  activeDataSourceId?: string;
  activeDataSourceName?: string;
  dateProperties?: DatabaseViewProperty[];
  datePropertyId?: string | null;
  addableFilterFieldOptions: DatabaseSearchableMenuOption[];
  addableSortFieldOptions: DatabaseSearchableMenuOption[];
  canAddDatabaseFilter: boolean;
  canAddDatabaseSort: boolean;
  chartSettings: DatabaseChartSettings;
  layoutSettings: DatabaseLayoutSettings;
  databaseId?: string;
  dataSources: DatabaseSourceMenuItem[];
  draftViewTitle: string;
  editable?: boolean;
  filterFieldOptions: DatabaseSearchableMenuOption[];
  filterValueOptionsByField: Record<string, DatabaseSearchableMenuOption[]>;
  groupProperties: DatabaseViewProperty[];
  groupPropertyId: string | null;
  titlePropertyLabel: string;
  open?: boolean;
  workspaceId?: string;
  onLinkDataSourceView: (view: DatabaseSourceViewSelection) => void;
  onUnlinkDataSource?: (dataSourceId: string) => void;
  onAddDataSourceView?: (
    dataSourceId: string,
    type: DatabaseViewType,
    mode?: "add" | "replace",
  ) => void;
  onAddDataSource?: () => void;
  onCopyDatabaseViewLink: () => void;
  onOpenChange?: (open: boolean) => void;
  onOpenAutomations?: () => void;
  onReplaceActiveViewSource: (view: DatabaseSourceViewSelection) => void;
  onClearDatabaseFilter: () => void;
  onClearDatabaseSort: () => void;
  onConfigureDataSources?: () => void;
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
  onSaveDatabaseViewIcon: (icon: string) => void;
  onSetAllContentWrapped: (wrapContent: boolean) => void;
  onSetViewDateProperty: (datePropertyId: string | null) => void;
  onSetViewGroupProperty: (groupPropertyId: string | null) => void;
  onSetViewType: (
    type:
      "table" | "kanban" | "timeline" | "chart" | "gallery" | "list" | "form",
  ) => void;
  onShowPageIconChange: (showPageIcon: boolean) => void;
  onShowTitleChange?: (showTitle: boolean) => void;
  onTogglePropertyTitles: () => void;
  onTogglePropertyVisibility: (propertyId: string) => void;
  onUpdateDatabaseFilter: (
    index: number,
    patch: DatabaseFilterUpdatePatch,
  ) => void;
  onUpdateDatabaseChartSettings: (
    settings: Partial<DatabaseChartSettings>,
  ) => void;
  onUpdateDatabaseLayoutSettings: (
    settings: Partial<DatabaseLayoutSettings>,
  ) => void;
  onUpdateDatabaseSort: (index: number, patch: DatabaseSortUpdatePatch) => void;
  onUpdateDatabaseSubItemsSettings: (
    settings: Partial<DatabaseSubItemsSettings>,
  ) => void;
  properties: DatabaseViewProperty[];
  isAddingDataSource?: boolean;
  sortFieldOptions: DatabaseSearchableMenuOption[];
  hostDatabaseId?: string;
  viewConfig?: unknown;
  visiblePropertyCount: number;
  showPropertyTitles: boolean;
  showPageIcon: boolean;
  showTitle: boolean;
  subItemsSettings: DatabaseSubItemsSettings;
};
