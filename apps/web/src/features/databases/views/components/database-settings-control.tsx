import {
  getToolbarActiveView,
  getToolbarSourceIdentity,
  getToolbarSourceTitle,
  getToolbarFallbackSources,
} from "../model/toolbar-source";

import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../state/database-view-context";
import { DatabaseViewSettingsMenu } from "../view-settings/components";
import { getNameColumnWrapContent, getPropertyWrapContent } from "../model/database-view-config";

export function DatabaseSettingsControl({
  open,
  onOpenChange,
  onOpenAutomations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAutomations?: () => void;
}) {
  const {
    addDataSource,
    addDataSourceView,
    replaceActiveViewSource,
    clearDatabaseFilter,
    clearDatabaseSort,
    configureDataSources,
    copyDatabaseViewLink,
    createDatabaseFilter,
    createDatabaseSort,
    linkDataSourceView,
    unlinkDataSource,
    onShowTitleChange,
    removeDatabaseFilter,
    removeDatabaseSort,
    reorderDatabaseFilters,
    saveDatabaseConditionalColors,
    saveDatabaseViewIcon,
    saveDatabaseViewTitle,
    setDraftViewTitle,
    setViewDateProperty,
    setViewGroupProperty,
    setViewType,
    togglePropertyVisibility,
    togglePropertyTitles,
    updateDatabaseFilter,
    updateDatabaseChartSettings,
    updateDatabaseLayoutSettings,
    updateDatabasePropertyConfig,
    updateDatabaseSort,
    updateDatabaseSubItemsSettings,
    updateNameColumnConfig,
  } = useDatabaseActionsContext();
  const {
    activeConditionalColors,
    activeDatabaseFilters,
    activeDatabaseSorts,
    addableFilterFieldOptions,
    addableSortFieldOptions,
    canAddDatabaseSort,
    canAddDatabaseFilter,
    databaseConfig,
    editable,
    filterFieldOptions,
    filterValueOptionsByField,
    groupProperty,
    groupableProperties,
    isAddingDataSource,
    properties,
    timelineDateProperties,
    timelineDateProperty,
    sortFieldOptions,
    visiblePropertyCount,
  } = useDatabaseDataContext();
  const {
    activeVisibilityConfig,
    chartSettings,
    draftViewTitle,
    layoutSettings,
    titlePropertyLabel,
    showPageIconInTitle,
    showPropertyTitles,
    showTitle,
    subItemsSettings,
  } = useDatabaseUiContext();
  const allContentWrapped =
    getNameColumnWrapContent(databaseConfig) &&
    properties.every((property) => getPropertyWrapContent(property.property.config));
  const setAllContentWrapped = async (wrapContent: boolean) => {
    updateDatabaseLayoutSettings({ wrapAllContent: false });
    await updateNameColumnConfig?.({ wrapContent });

    for (const property of properties) {
      await updateDatabasePropertyConfig(property.id, { wrapContent });
    }
  };
  const source = useSettingsSource();
  const { activeViewTabId, viewTabs } = useDatabaseUiContext();
  const activeViewTab = viewTabs.find((view) => view.id === activeViewTabId);
  return (
    <DatabaseViewSettingsMenu
      {...source}
      activeConditionalColors={activeConditionalColors}
      allContentWrapped={allContentWrapped}
      activeDatabaseSorts={activeDatabaseSorts}
      activeDatabaseFilters={activeDatabaseFilters}
      addableFilterFieldOptions={addableFilterFieldOptions}
      draftViewTitle={draftViewTitle}
      editable={editable}
      groupProperties={groupableProperties}
      groupPropertyId={groupProperty?.property.id ?? null}
      canAddDatabaseFilter={canAddDatabaseFilter}
      chartSettings={chartSettings}
      layoutSettings={layoutSettings}
      titlePropertyLabel={titlePropertyLabel}
      isAddingDataSource={isAddingDataSource}
      onAddDataSource={addDataSource}
      onLinkDataSourceView={linkDataSourceView}
      onUnlinkDataSource={unlinkDataSource}
      onAddDataSourceView={addDataSourceView}
      onReplaceActiveViewSource={replaceActiveViewSource ?? linkDataSourceView}
      open={open}
      onCopyDatabaseViewLink={copyDatabaseViewLink}
      onClearDatabaseFilter={clearDatabaseFilter}
      onClearDatabaseSort={clearDatabaseSort}
      onConfigureDataSources={configureDataSources}
      onCreateDatabaseFilter={createDatabaseFilter}
      onCreateDatabaseSort={createDatabaseSort}
      onDraftViewTitleChange={setDraftViewTitle}
      onOpenChange={onOpenChange}
      onOpenAutomations={onOpenAutomations}
      onRemoveDatabaseFilter={removeDatabaseFilter}
      onRemoveDatabaseSort={removeDatabaseSort}
      onReorderDatabaseFilters={reorderDatabaseFilters}
      onSaveDatabaseConditionalColors={saveDatabaseConditionalColors}
      onSaveDatabaseViewIcon={(icon) => {
        if (activeViewTab) {
          saveDatabaseViewIcon(activeViewTab, icon);
        }
      }}
      onSaveDatabaseViewTitle={saveDatabaseViewTitle}
      dateProperties={timelineDateProperties}
      datePropertyId={timelineDateProperty?.property.id ?? null}
      onSetViewDateProperty={setViewDateProperty}
      onSetViewGroupProperty={setViewGroupProperty}
      onSetViewType={setViewType}
      onSetAllContentWrapped={(wrapContent) => void setAllContentWrapped(wrapContent)}
      onShowTitleChange={onShowTitleChange}
      onShowPageIconChange={(showPageIcon) => updateNameColumnConfig?.({ showPageIcon })}
      onTogglePropertyTitles={togglePropertyTitles}
      onTogglePropertyVisibility={togglePropertyVisibility}
      onUpdateDatabaseFilter={updateDatabaseFilter}
      onUpdateDatabaseChartSettings={updateDatabaseChartSettings}
      onUpdateDatabaseLayoutSettings={updateDatabaseLayoutSettings}
      onUpdateDatabaseSort={updateDatabaseSort}
      onUpdateDatabaseSubItemsSettings={updateDatabaseSubItemsSettings}
      properties={properties}
      filterFieldOptions={filterFieldOptions}
      filterValueOptionsByField={filterValueOptionsByField}
      sortFieldOptions={sortFieldOptions}
      addableSortFieldOptions={addableSortFieldOptions}
      canAddDatabaseSort={canAddDatabaseSort}
      viewConfig={activeVisibilityConfig}
      visiblePropertyCount={visiblePropertyCount}
      showPropertyTitles={showPropertyTitles}
      showPageIcon={showPageIconInTitle}
      showTitle={showTitle}
      subItemsSettings={subItemsSettings}
    />
  );
}

function useSettingsSource() {
  const {
    databaseId,
    hostDatabaseId,
    hostDatabaseName,
    hostDatabaseWorkspaceId,
    databaseWorkspaceId,
    workspaceId,
    dataSources: configuredDataSources,
    hostViews,
  } = useDatabaseDataContext();
  const { activeView, activeViewTabId, viewTabs, draftDatabaseTitle } = useDatabaseUiContext();
  const activeViewTab = viewTabs.find((view) => view.id === activeViewTabId);
  const sourceHost = {
    hostDatabaseId,
    databaseId,
    hostDatabaseName,
    hostDatabaseWorkspaceId,
    databaseWorkspaceId,
    workspaceId,
  };
  const hostDisplayTitle = getToolbarSourceTitle(sourceHost, activeViewTab, draftDatabaseTitle);
  return {
    ...getToolbarActiveView(activeViewTab, activeView, hostDisplayTitle),
    databaseId: databaseId ?? undefined,
    dataSources:
      configuredDataSources ??
      getToolbarFallbackSources(hostDatabaseId, activeViewTab, hostDisplayTitle, hostViews.length),
    workspaceId: getToolbarSourceIdentity(sourceHost).workspaceId,
    hostDatabaseId: hostDatabaseId ?? undefined,
  };
}
