import type { DatabaseActiveConditionalColor } from "../database-view-context";
import type {
  DatabaseConditionalColorConfig,
  DatabaseLinkedViewConfig,
  DatabaseLayoutSettings,
  DatabaseSubItemsSettings,
} from "../database-view-config";
import type {
  DatabaseActiveFilter,
  DatabaseFilterUpdatePatch,
} from "../database-filter-menu";
import type { DatabaseSearchableMenuOption } from "../database-searchable-menu-items";
import type {
  DatabaseActiveSort,
  DatabaseSortUpdatePatch,
} from "../database-sort-menu";
import type { DatabaseChartSettings } from "../chart/database-chart-config";
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
  hiddenViewCount?: number;
  id: string;
  name: string;
  viewCount: number;
};

export type DatabaseViewSettingsMenuProps = {
  activeConditionalColors: DatabaseActiveConditionalColor[];
  allContentWrapped: boolean;
  activeDatabaseFilters: DatabaseActiveFilter[];
  activeDatabaseSorts: DatabaseActiveSort[];
  activeViewType?: string;
  activeSourceDatabaseId?: string;
  activeSourceDatabaseName?: string;
  dateProperties?: DatabaseViewProperty[];
  datePropertyId?: string | null;
  addableFilterFieldOptions: DatabaseSearchableMenuOption[];
  addableSortFieldOptions: DatabaseSearchableMenuOption[];
  canAddDatabaseFilter: boolean;
  canAddDatabaseSort: boolean;
  chartSettings: DatabaseChartSettings;
  layoutSettings: DatabaseLayoutSettings;
  databaseId?: string;
  databaseName?: string;
  dataSources: DatabaseSourceMenuItem[];
  draftViewTitle: string;
  editable?: boolean;
  filterFieldOptions: DatabaseSearchableMenuOption[];
  filterValueOptionsByField: Record<string, DatabaseSearchableMenuOption[]>;
  groupProperties: DatabaseViewProperty[];
  groupPropertyId: string | null;
  linkedViews?: DatabaseLinkedViewConfig[];
  titlePropertyLabel: string;
  open?: boolean;
  workspaceId?: string;
  onAddLinkedDatabaseView: (view: DatabaseLinkedViewConfig) => void;
  onAddDataSourceView?: (
    sourceDatabaseId: string,
    type: DatabaseViewType,
  ) => void;
  onAddDataSource?: () => void;
  onCopyDatabaseViewLink: () => void;
  onOpenChange?: (open: boolean) => void;
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
  sourceDatabaseId?: string;
  viewConfig?: unknown;
  visiblePropertyCount: number;
  showPropertyTitles: boolean;
  showPageIcon: boolean;
  showTitle: boolean;
  subItemsSettings: DatabaseSubItemsSettings;
};
