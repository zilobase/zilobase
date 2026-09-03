import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownUp,
  ArrowUpRightIcon,
  Check,
  Copy,
  CopyPlus,
  Database,
  Eye,
  EyeOff,
  FilePenLine,
  Filter,
  CalendarRange,
  ChartPie,
  GalleryThumbnails,
  Kanban,
  List,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Paintbrush,
  Pencil,
  Plus,
  SlidersHorizontalIcon,
  Smile,
  Table2,
  Trash2,
  X,
} from "@/shared/components/icons";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/app-tabs";
import { IconEmojiPicker } from "@/shared/ui/icon-emoji-picker";
import { PageIconDisplay } from "@/features/pages/index";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover";
import { cn } from "@/shared/lib/utils";
import { getDatabaseEmoji } from "@zilobase/features/databases";

import { DatabaseSearchableMenuItems } from "./database-searchable-menu-items";
import { DatabaseFilterPopover } from "./database-filter-menu";
import { DatabaseSortPopover } from "./database-sort-menu";
import {
  useDatabaseActionsContext, useDatabaseDataContext, useDatabaseUiContext,
  type DatabaseViewTab,
} from "../model/database-view-context";
import { DatabaseViewToolbarButton } from "./database-view-toolbar-button";
import { DatabaseViewSettingsMenu } from "../view-settings/view";
import {
  captureDatabaseViewScroll,
  restoreDatabaseViewScroll,
  type DatabaseViewScrollSnapshot,
} from "../controller/database-view-scroll";
import {
  getNameColumnWrapContent,
  getPropertyWrapContent,
} from "../model/database-view-config";
import { DatabaseFormShareMenu } from "../form/view/database-form-share-menu";
import { DatabaseViewToolbarDialogs } from "./database-view-toolbar-dialogs";
import { ViewTypeOptionGrid } from "../view-settings/view/view-type-option-grid";
import type { DatabaseViewType } from "../view-settings/model/view-type-options";
import { DatabaseAutomationManager } from "../../automations";
import { useDatabaseAutomationCapability } from "@zilobase/features/databases/automations/react";

function ToolbarMenuRow({
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
        <span className="ml-auto flex min-w-0 shrink-0 items-center gap-1 text-content-secondary">
          {right}
        </span>
      ) : null}
    </div>
  );
}

export function DatabaseViewToolbar() {
  const navigate = useNavigate();
  const databaseTitleInputRef = useRef<HTMLInputElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const viewNavigationRef = useRef<HTMLDivElement | null>(null);
  const viewTabMeasurementsRef = useRef<HTMLDivElement | null>(null);
  const overflowTriggerMeasurementRef = useRef<HTMLSpanElement | null>(null);
  const pendingViewScrollRef = useRef<DatabaseViewScrollSnapshot | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [viewIconPickerOpenId, setViewIconPickerOpenId] = useState<
    string | null
  >(null);
  const [titleActionsOpen, setTitleActionsOpen] = useState(false);
  const [openViewMenuId, setOpenViewMenuId] = useState<string | null>(null);
  const [pendingDeleteView, setPendingDeleteView] =
    useState<DatabaseViewTab | null>(null);
  const [addViewMenuOpen, setAddViewMenuOpen] = useState(false);
  const [viewSwitcherOpen, setViewSwitcherOpen] = useState(false);
  const [visibleViewCount, setVisibleViewCount] = useState(
    Number.MAX_SAFE_INTEGER,
  );
  const [localViewSettingsOpen, setLocalViewSettingsOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [formPreviewOpen, setFormPreviewOpen] = useState(false);
  const [automationManagerOpen, setAutomationManagerOpen] = useState(false);
  const {
    addDataSource,
    addDatabaseRow,
    addChartView,
    addFormView,
    addGalleryView,
    addKanbanView,
    addListView,
    addDataSourceView,
    replaceActiveViewSource,
    addTableView,
    addTimelineView,
    clearDatabaseFilter,
    clearDatabaseSort,
    configureDataSources,
    copyDatabaseViewLink,
    createDatabaseFilter,
    createDatabaseSort,
    deleteDatabaseView,
    duplicateDatabaseView,
    linkDataSourceView,
    unlinkDataSource,
    onShowTitleChange,
    removeDatabaseFilter,
    removeDatabaseSort,
    reorderDatabaseFilters,
    saveDatabaseConditionalColors,
    saveDatabaseEmoji,
    saveDatabaseTitle,
    saveDatabaseViewIcon,
    saveDatabaseViewTitle,
    setActiveViewId,
    setDraftDatabaseTitle,
    setDraftViewTitle,
    setFilterPickerOpen,
    setViewDateProperty,
    setViewGroupProperty,
    setViewType,
    setSortPickerOpen,
    togglePropertyVisibility,
    togglePropertyTitles,
    toggleFilterPillVisibility,
    toggleSortPillVisibility,
    updateDatabaseFilter,
    updateDatabaseChartSettings,
    updateDatabaseLayoutSettings,
    updateDatabasePropertyConfig,
    updateDatabaseSort,
    updateDatabaseSubItemsSettings,
    updateNameColumnConfig,
  } = useDatabaseActionsContext()
  const {
    activeConditionalColors,
    activeDatabaseFilters,
    activeDatabaseSorts,
    addableFilterFieldOptions,
    addableSortFieldOptions,
    canAddDatabaseSort,
    canAddDatabaseFilter,
    canAddDatabaseRows,
    canAddDatabaseViews,
    dataSources: configuredDataSources,
    databaseConfig,
    databaseId,
    databaseWorkspaceId,
    editable,
    filterFieldOptions,
    filterValueOptionsByField,
    groupProperty,
    groupableProperties,
    hostDatabaseId,
    hostDatabaseName,
    hostDatabaseWorkspaceId,
    hostViews,
    isAddingDatabaseProperty,
    isAddingDatabaseRow,
    isAddingDataSource,
    isAddingDatabaseView,
    workspaceId,
    properties,
    timelineDateProperties,
    timelineDateProperty,
    sortFieldOptions,
    visiblePropertyCount,
  } = useDatabaseDataContext()
  const {
    activeView,
    activeViewTabId,
    activeVisibilityConfig,
    chartSettings,
    draftDatabaseTitle,
    draftViewTitle,
    filterPickerOpen,
    fullPage,
    layoutSettings,
    newRowLabel,
    titlePropertyLabel,
    showExpandButton,
    showFilterPill,
    showPageIconInTitle,
    showPropertyTitles,
    showSortPill,
    showTitle,
    sortPickerOpen,
    subItemsSettings,
    viewTabs,
  } = useDatabaseUiContext()
  const viewSettingsOpen = localViewSettingsOpen;
  const setViewSettingsOpen = setLocalViewSettingsOpen;
  const canRenderAddView = canAddDatabaseViews ?? editable;
  const canRenderAddRow = canAddDatabaseRows ?? editable;
  const formQuestionCount = properties.length + 1;
  const allContentWrapped =
    getNameColumnWrapContent(databaseConfig) &&
    properties.every((property) =>
      getPropertyWrapContent(property.property.config),
    );
  const setAllContentWrapped = async (wrapContent: boolean) => {
    updateDatabaseLayoutSettings({ wrapAllContent: false });
    await updateNameColumnConfig?.({ wrapContent });

    for (const property of properties) {
      await updateDatabasePropertyConfig(property.id, { wrapContent });
    }
  };
  const activeViewTab = viewTabs.find((view) => view.id === activeViewTabId);
  const automationDatabaseId = hostDatabaseId ?? databaseId ?? "";
  const automationDataSourceId = activeViewTab?.dataSourceId ?? "";
  const automationWorkspaceId =
    hostDatabaseWorkspaceId ?? databaseWorkspaceId ?? workspaceId ?? "";
  const automationUiAvailable = import.meta.env.DEV;
  const automationCapability = useDatabaseAutomationCapability(
    automationUiAvailable ? automationDatabaseId : null,
    automationUiAvailable ? automationWorkspaceId : null,
  );
  const automationsEnabled =
    automationUiAvailable && automationCapability.data?.enabled === true;
  const clampedVisibleViewCount = Math.min(visibleViewCount, viewTabs.length);
  const visibleViewIds = new Set(
    viewTabs.slice(0, clampedVisibleViewCount).map((view) => view.id),
  );

  if (
    activeViewTab &&
    clampedVisibleViewCount > 0 &&
    !visibleViewIds.has(activeViewTab.id)
  ) {
    visibleViewIds.delete(viewTabs[clampedVisibleViewCount - 1]!.id);
    visibleViewIds.add(activeViewTab.id);
  }

  const visibleViewTabs = viewTabs.filter((view) => visibleViewIds.has(view.id));
  const overflowViewTabs = viewTabs.filter(
    (view) => !visibleViewIds.has(view.id),
  );
  const isExternalDataSourceView = (view?: DatabaseViewTab | null) =>
    Boolean(
      view?.sourceParentDatabaseId &&
        hostDatabaseId &&
        view.sourceParentDatabaseId !== hostDatabaseId,
    );
  const isFormView = (activeView?.type ?? activeViewTab?.type) === "form";
  const selectActiveView = (viewId: string) => {
    if (viewId === activeViewTabId) {
      return;
    }

    pendingViewScrollRef.current = captureDatabaseViewScroll(
      toolbarRef.current,
    );
    setActiveViewId(viewId);
  };
  const addView = (type: DatabaseViewType) => {
    setAddViewMenuOpen(false);

    switch (type) {
      case "table":
        addTableView();
        break;
      case "kanban":
        addKanbanView();
        break;
      case "timeline":
        addTimelineView();
        break;
      case "list":
        addListView();
        break;
      case "gallery":
        addGalleryView();
        break;
      case "chart":
        addChartView();
        break;
      case "form":
        setFormDialogOpen(true);
        break;
    }
  };
  const isAddViewTypeDisabled = (type: DatabaseViewType) =>
    !databaseId ||
    isAddingDatabaseView ||
    ((type === "kanban" || type === "timeline") && isAddingDatabaseProperty);

  useLayoutEffect(() => {
    const scrollSnapshot = pendingViewScrollRef.current;

    if (!scrollSnapshot) {
      return;
    }

    restoreDatabaseViewScroll(scrollSnapshot);
    pendingViewScrollRef.current = null;
  }, [activeViewTabId]);

  useLayoutEffect(() => {
    const navigation = viewNavigationRef.current;
    const measurements = viewTabMeasurementsRef.current;
    const overflowTrigger = overflowTriggerMeasurementRef.current;

    if (
      !navigation ||
      !measurements ||
      !overflowTrigger ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const measure = () => {
      const tabWidths = Array.from(
        measurements.querySelectorAll<HTMLElement>("[data-view-tab-measurement]"),
        (tab) => tab.offsetWidth,
      );
      const addViewSpace = canRenderAddView ? 40 : 0;
      const tabsWidth = (indexes: number[]) =>
        8 +
        indexes.reduce((total, index) => total + (tabWidths[index] ?? 0), 0) +
        Math.max(0, indexes.length - 1) * 2;
      const allIndexes = viewTabs.map((_, index) => index);

      if (
        tabsWidth(allIndexes) + addViewSpace <=
        navigation.clientWidth
      ) {
        setVisibleViewCount(viewTabs.length);
        return;
      }

      const activeIndex = viewTabs.findIndex(
        (view) => view.id === activeViewTabId,
      );
      const overflowSpace = overflowTrigger.offsetWidth + 8;
      let nextVisibleCount = Math.min(1, viewTabs.length);

      for (let count = 1; count < viewTabs.length; count += 1) {
        const indexes = Array.from({ length: count }, (_, index) => index);

        if (activeIndex >= count && indexes.length > 0) {
          indexes[indexes.length - 1] = activeIndex;
        }

        if (
          tabsWidth(indexes) + overflowSpace + addViewSpace <=
          navigation.clientWidth
        ) {
          nextVisibleCount = count;
        } else {
          break;
        }
      }

      setVisibleViewCount(nextVisibleCount);
    };
    const observer = new ResizeObserver(measure);

    observer.observe(navigation);
    observer.observe(measurements);
    measure();

    return () => observer.disconnect();
  }, [activeViewTabId, canRenderAddView, draftViewTitle, viewTabs]);

  useLayoutEffect(() => {
    if (overflowViewTabs.length === 0) {
      setViewSwitcherOpen(false);
    }
  }, [overflowViewTabs.length]);

  const hostDisplayTitle = isExternalDataSourceView(activeViewTab)
    ? hostDatabaseName || "Untitled"
    : draftDatabaseTitle || hostDatabaseName || "Untitled";
  const expandDatabaseId = hostDatabaseId ?? databaseId;
  const databaseEmoji = getDatabaseEmoji({ config: databaseConfig });
  const canEditDatabaseEmoji = editable && Boolean(databaseId);
  const focusDatabaseTitleInput = () => {
    window.setTimeout(() => {
      databaseTitleInputRef.current?.focus();
      databaseTitleInputRef.current?.select();
    }, 0);
  };
  const openDatabaseFullPage = (nextDatabaseId: string | null | undefined) => {
    if (!nextDatabaseId) {
      return;
    }

    void navigate({
      params: { databaseId: nextDatabaseId },
      search: { view: undefined },
      to: "/d/$databaseId",
    });
  };
  const renderDatabaseEmojiPicker = (onSelect?: () => void) => (
    <IconEmojiPicker
      onEmojiSelect={(emoji) => {
        saveDatabaseEmoji(emoji);
        setEmojiPickerOpen(false);
        onSelect?.();
      }}
      onIconSelect={(svg) => {
        saveDatabaseEmoji(svg);
        setEmojiPickerOpen(false);
        onSelect?.();
      }}
    />
  );
  const databaseEmojiPopoverContent = (
    <PopoverContent
      align="start"
      className="w-auto gap-0 overflow-hidden p-0"
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      sideOffset={6}
    >
      {renderDatabaseEmojiPicker()}
    </PopoverContent>
  );
  const databaseEmojiPicker = databaseEmoji ? (
    canEditDatabaseEmoji ? (
      <div className="group/icon relative shrink-0">
        <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
          <PopoverTrigger asChild>
            <button
              aria-label="Change database icon"
              className="flex size-9 items-center justify-center rounded-md text-2xl leading-none transition-colors hover:bg-action-neutral-hover focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none"
              type="button"
            >
              <PageIconDisplay size="lg" value={databaseEmoji} />
            </button>
          </PopoverTrigger>
          {databaseEmojiPopoverContent}
        </Popover>
        <button
          aria-label="Remove database icon"
          className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full border bg-surface-canvas text-content-secondary shadow-sm transition-colors hover:bg-action-neutral-hover hover:text-action-on-neutral active:bg-action-neutral-pressed active:text-action-on-neutral focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none group-focus-within/icon:flex group-hover/icon:flex [&_svg]:size-3"
          onClick={() => {
            saveDatabaseEmoji("");
            setEmojiPickerOpen(false);
          }}
          type="button"
        >
          <X />
        </button>
      </div>
    ) : (
      <span
        aria-label="Database icon"
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-2xl leading-none"
      >
        <PageIconDisplay size="lg" value={databaseEmoji} />
      </span>
    )
  ) : null;

  return (
    <div className="database-toolbar" ref={toolbarRef}>
      {showTitle ? (
        <div className="group/title flex min-w-0 items-center gap-3">
          {databaseEmojiPicker}
          {isExternalDataSourceView(activeViewTab) ? (
            <ArrowUpRightIcon
              aria-label={`Linked from ${activeViewTab?.dataSourceName ?? "another database"}`}
              className="size-5 shrink-0 text-content-secondary"
            />
          ) : null}
          <input
            aria-label="Database title"
            className={cn(
              "h-auto min-w-[1ch] max-w-[44ch] shrink-0 truncate border-0 bg-transparent px-0 py-0 font-semibold leading-tight tracking-normal text-content-primary shadow-none outline-none [field-sizing:content] placeholder:text-content-secondary focus-visible:ring-0",
              fullPage ? "text-2xl md:text-2xl" : "text-3xl",
            )}
            disabled={!databaseId}
            data-structural-block-title
            onBlur={(event) => saveDatabaseTitle(event.target.value)}
            onChange={(event) => {
              setDraftDatabaseTitle(event.target.value);
            }}
            placeholder="New database"
            ref={databaseTitleInputRef}
            value={draftDatabaseTitle}
          />
          <DropDrawer
            open={titleActionsOpen}
            onOpenChange={setTitleActionsOpen}
          >
            <DropDrawerTrigger asChild>
              <DatabaseViewToolbarButton
                aria-label="Open database title actions"
                className="opacity-0 transition-opacity group-focus-within/title:opacity-100 group-hover/title:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal />
              </DatabaseViewToolbarButton>
            </DropDrawerTrigger>
            <DropDrawerContent align="start" className="w-64">
              <DropDrawerItem
                disabled={!databaseId}
                onSelect={() =>
                  openDatabaseFullPage(
                    activeViewTab?.sourceParentDatabaseId ?? databaseId,
                  )
                }
              >
                <ArrowUpRightIcon />
                <span>
                  {isExternalDataSourceView(activeViewTab)
                    ? "View data source"
                    : "View database"}
                </span>
              </DropDrawerItem>
              <DropDrawerItem
                disabled={!editable || !databaseId}
                onSelect={focusDatabaseTitleInput}
              >
                <Pencil />
                <span>Edit title</span>
              </DropDrawerItem>
              <DropDrawerSub>
                <DropDrawerSubTrigger
                  className={cn(
                    (!canEditDatabaseEmoji || !databaseId) &&
                      "pointer-events-none opacity-50",
                  )}
                >
                  <Smile />
                  <span>Edit icon</span>
                </DropDrawerSubTrigger>
                <DropDrawerSubContent className="w-auto overflow-hidden p-0">
                  {renderDatabaseEmojiPicker(() => setTitleActionsOpen(false))}
                </DropDrawerSubContent>
              </DropDrawerSub>
              <DropDrawerSeparator />
              <DropDrawerItem
                disabled={!onShowTitleChange}
                onSelect={() => {
                  onShowTitleChange?.(false);
                  setTitleActionsOpen(false);
                }}
              >
                <EyeOff />
                <span>
                  {isExternalDataSourceView(activeViewTab)
                    ? "Hide data source titles"
                    : "Hide title"}
                </span>
              </DropDrawerItem>
            </DropDrawerContent>
          </DropDrawer>
        </div>
      ) : null}
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <div
            className="relative flex min-w-0 items-center gap-2 overflow-hidden"
            ref={viewNavigationRef}
          >
            <Tabs
              className="min-w-0 shrink-0"
              onValueChange={(value) => {
                if (value == null) {
                  return;
                }

                setOpenViewMenuId(null);
                selectActiveView(String(value));
              }}
              value={activeViewTabId}
            >
              <TabsList
                className="w-max min-w-0 justify-start"
              >
                {visibleViewTabs.map((view) => {
                  const isActiveView = view.id === activeViewTabId;
                  const ViewIcon =
                    view.fallbackIcon ?? (view.type === "kanban"
                      ? Kanban
                      : view.type === "timeline"
                        ? CalendarRange
                        : view.type === "chart"
                          ? ChartPie
                          : view.type === "gallery"
                            ? GalleryThumbnails
                            : view.type === "form"
                              ? FilePenLine
                              : view.type === "list"
                                ? List
                                : Table2);
                  const sourceParentDatabaseId =
                    view.sourceParentDatabaseId ?? hostDatabaseId ?? databaseId;
                  const sourceDatabaseName =
                    view.dataSourceName ?? hostDisplayTitle;
                  const handleViewContextMenu = (
                    event: MouseEvent<HTMLButtonElement>,
                  ) => {
                    event.preventDefault();
                    selectActiveView(view.id);
                    setOpenViewMenuId(view.id);
                  };
                  const handleViewClick = (
                    event: MouseEvent<HTMLButtonElement>,
                  ) => {
                    if (isActiveView) {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    setOpenViewMenuId(null);
                    selectActiveView(view.id);
                  };
                  const selectInactiveView = () => {
                    setOpenViewMenuId(null);
                    selectActiveView(view.id);
                  };
                  const handleViewPointerDownCapture = (
                    event: PointerEvent<HTMLButtonElement>,
                  ) => {
                    if (isActiveView || event.button !== 0) {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    selectInactiveView();
                  };
                  const handleViewKeyDownCapture = (
                    event: KeyboardEvent<HTMLButtonElement>,
                  ) => {
                    if (
                      isActiveView ||
                      (event.key !== "Enter" && event.key !== " ")
                    ) {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    selectInactiveView();
                  };

                  return (
                    <DropDrawer
                      key={view.id}
                      onOpenChange={(open) => {
                        setOpenViewMenuId(open ? view.id : null);

                        if (open) {
                          selectActiveView(view.id);
                        }
                      }}
                      open={openViewMenuId === view.id}
                    >
                      <DropDrawerTrigger asChild>
                        {/* Keep the Radix menu anchor separate from the Base UI
                            tab trigger so their stateful refs cannot feed back
                            into each other when view configuration rerenders. */}
                        <div className="inline-flex shrink-0">
                          <TabsTrigger
                            aria-expanded={openViewMenuId === view.id}
                            aria-haspopup="menu"
                            className="h-8 shrink-0 grow-0 gap-2 px-3"
                            onClick={handleViewClick}
                            onContextMenu={handleViewContextMenu}
                            onKeyDownCapture={handleViewKeyDownCapture}
                            onPointerDownCapture={handleViewPointerDownCapture}
                            value={view.id}
                          >
                            {view.icon ? (
                              <PageIconDisplay size="sm" value={view.icon} />
                            ) : (
                              <ViewIcon className="size-4 shrink-0" />
                            )}
                            <span className="truncate">
                              {isActiveView ? draftViewTitle : view.name}
                            </span>
                            {isExternalDataSourceView(view) ? (
                              <ArrowUpRightIcon
                                aria-label={`Linked from ${view.dataSourceName ?? "another database"}`}
                                className="size-3 shrink-0 text-content-secondary"
                              />
                            ) : null}
                          </TabsTrigger>
                        </div>
                      </DropDrawerTrigger>
                      <DropDrawerContent
                        align="start"
                        className="w-72"
                        onCloseAutoFocus={(event) => event.preventDefault()}
                      >
                        <div className="flex items-center gap-1.5 p-1.5">
                          <Popover
                            onOpenChange={(open) =>
                              setViewIconPickerOpenId(open ? view.id : null)
                            }
                            open={viewIconPickerOpenId === view.id}
                          >
                            <div className="group/view-icon relative shrink-0">
                              <PopoverTrigger asChild>
                                <button
                                  aria-label="Change view icon"
                                  className="flex size-8 items-center justify-center rounded-md border bg-surface-canvas text-content-secondary transition-colors hover:bg-action-neutral-hover focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none"
                                  disabled={!editable || !databaseId}
                                  type="button"
                                >
                                  {view.icon ? (
                                    <PageIconDisplay
                                      size="sm"
                                      value={view.icon}
                                    />
                                  ) : (
                                    <ViewIcon className="size-4" />
                                  )}
                                </button>
                              </PopoverTrigger>
                              {view.icon ? (
                                <button
                                  aria-label="Reset view icon"
                                  className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full border bg-surface-canvas text-content-secondary shadow-sm hover:bg-action-neutral-hover hover:text-action-on-neutral active:bg-action-neutral-pressed active:text-action-on-neutral group-focus-within/view-icon:flex group-hover/view-icon:flex [&_svg]:size-2.5"
                                  disabled={!editable || !databaseId}
                                  onClick={() => saveDatabaseViewIcon(view, "")}
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
                                  saveDatabaseViewIcon(view, icon);
                                  setViewIconPickerOpenId(null);
                                }}
                                onIconSelect={(icon) => {
                                  saveDatabaseViewIcon(view, icon);
                                  setViewIconPickerOpenId(null);
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                          <Input
                            aria-label="View name"
                            className="h-8 min-w-0 flex-1 text-sm font-medium"
                            defaultValue={
                              isActiveView ? draftViewTitle : view.name
                            }
                            disabled={!editable || !databaseId}
                            key={`${view.id}:${view.name}`}
                            onBlur={(event) => {
                              const nextTitle =
                                event.target.value.trim() || "Untitled view";
                              const currentTitle = isActiveView
                                ? draftViewTitle
                                : view.name;

                              if (nextTitle !== currentTitle) {
                                selectActiveView(view.id);
                                setDraftViewTitle(nextTitle);
                                window.setTimeout(
                                  () => saveDatabaseViewTitle(nextTitle),
                                  0,
                                );
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                            }}
                          />
                        </div>
                        <DropDrawerSub>
                          <DropDrawerSubTrigger>
                            <ToolbarMenuRow
                              icon={<Paintbrush />}
                              label="Display as"
                            />
                          </DropDrawerSubTrigger>
                          <DropDrawerSubContent className="w-56">
                            <DropDrawerItem
                              disabled={!editable || view.type === "table"}
                              onSelect={() => {
                                selectActiveView(view.id);
                                setViewType("table");
                              }}
                            >
                              <Table2 />
                              <span>Table</span>
                              {view.type === "table" ? (
                                <Check className="ml-auto text-content-primary" />
                              ) : null}
                            </DropDrawerItem>
                            <DropDrawerItem
                              disabled={!editable || view.type === "kanban"}
                              onSelect={() => {
                                selectActiveView(view.id);
                                setViewType("kanban");
                              }}
                            >
                              <Kanban />
                              <span>Board</span>
                              {view.type === "kanban" ? (
                                <Check className="ml-auto text-content-primary" />
                              ) : null}
                            </DropDrawerItem>
                            <DropDrawerItem
                              disabled={!editable || view.type === "gallery"}
                              onSelect={() => {
                                selectActiveView(view.id);
                                setViewType("gallery");
                              }}
                            >
                              <GalleryThumbnails />
                              <span>Gallery</span>
                              {view.type === "gallery" ? (
                                <Check className="ml-auto text-content-primary" />
                              ) : null}
                            </DropDrawerItem>
                            <DropDrawerItem
                              disabled={!editable || view.type === "list"}
                              onSelect={() => {
                                selectActiveView(view.id);
                                setViewType("list");
                              }}
                            >
                              <List />
                              <span>List</span>
                              {view.type === "list" ? (
                                <Check className="ml-auto text-content-primary" />
                              ) : null}
                            </DropDrawerItem>
                            <DropDrawerItem
                              disabled={!editable || view.type === "chart"}
                              onSelect={() => {
                                selectActiveView(view.id);
                                setViewType("chart");
                              }}
                            >
                              <ChartPie />
                              <span>Chart</span>
                              {view.type === "chart" ? (
                                <Check className="ml-auto text-content-primary" />
                              ) : null}
                            </DropDrawerItem>
                            <DropDrawerItem
                              disabled={!editable || view.type === "timeline"}
                              onSelect={() => {
                                selectActiveView(view.id);
                                setViewType("timeline");
                              }}
                            >
                              <CalendarRange />
                              <span>Timeline</span>
                              {view.type === "timeline" ? (
                                <Check className="ml-auto text-content-primary" />
                              ) : null}
                            </DropDrawerItem>
                            <DropDrawerItem
                              disabled={!editable || view.type === "form"}
                              onSelect={() => {
                                selectActiveView(view.id);
                                setViewType("form");
                              }}
                            >
                              <FilePenLine />
                              <span>Form</span>
                              {view.type === "form" ? (
                                <Check className="ml-auto text-content-primary" />
                              ) : null}
                            </DropDrawerItem>
                          </DropDrawerSubContent>
                        </DropDrawerSub>
                        <DropDrawerItem
                          onSelect={() => {
                            selectActiveView(view.id);
                            setViewSettingsOpen(true);
                          }}
                        >
                          <SlidersHorizontalIcon />
                          <span>Edit view</span>
                        </DropDrawerItem>
                        <DropDrawerSub>
                          <DropDrawerSubTrigger>
                            <ToolbarMenuRow
                              icon={<Database />}
                              label="Source"
                              right={
                                <>
                                  {isExternalDataSourceView(view) ? (
                                    <ArrowUpRightIcon className="size-3" />
                                  ) : null}
                                  <span className="block max-w-28 truncate">
                                    {sourceDatabaseName}
                                  </span>
                                </>
                              }
                            />
                          </DropDrawerSubTrigger>
                          <DropDrawerSubContent className="w-60">
                            <DropDrawerItem
                              disabled={!sourceParentDatabaseId}
                              onSelect={() =>
                                openDatabaseFullPage(sourceParentDatabaseId)
                              }
                            >
                              <ArrowUpRightIcon />
                              <span>
                                {isExternalDataSourceView(view)
                                  ? "Open source database"
                                  : "Open database"}
                              </span>
                            </DropDrawerItem>
                          </DropDrawerSubContent>
                        </DropDrawerSub>
                        <DropDrawerSeparator />
                        <DropDrawerItem onSelect={copyDatabaseViewLink}>
                          <Copy />
                          <span>Copy link to view</span>
                        </DropDrawerItem>
                        <DropDrawerItem
                          disabled={!sourceParentDatabaseId}
                          onSelect={() =>
                            openDatabaseFullPage(sourceParentDatabaseId)
                          }
                        >
                          <ArrowUpRightIcon />
                          <span>
                            {isExternalDataSourceView(view)
                              ? "Open source database"
                              : "Open as full page"}
                          </span>
                        </DropDrawerItem>
                        <DropDrawerItem
                          disabled={!onShowTitleChange}
                          onSelect={() => onShowTitleChange?.(!showTitle)}
                        >
                          <EyeOff />
                          <span>
                            {showTitle
                              ? "Hide data source titles"
                              : "Show data source title"}
                          </span>
                        </DropDrawerItem>
                        <DropDrawerSeparator />
                        <DropDrawerItem
                          disabled={!editable || !databaseId}
                          onSelect={() => duplicateDatabaseView(view)}
                        >
                          <CopyPlus />
                          <span>Duplicate view</span>
                        </DropDrawerItem>
                        <DropDrawerItem
                          disabled={
                            !editable || !databaseId || viewTabs.length <= 1
                          }
                          onSelect={() => setPendingDeleteView(view)}
                        >
                          <Trash2 />
                          <span>Delete view</span>
                        </DropDrawerItem>
                      </DropDrawerContent>
                    </DropDrawer>
                  );
                })}
              </TabsList>
            </Tabs>
            {overflowViewTabs.length > 0 ? (
              <DropDrawer
                onOpenChange={setViewSwitcherOpen}
                open={viewSwitcherOpen}
              >
                <DropDrawerTrigger asChild>
                  <Button
                    aria-label={`${overflowViewTabs.length} more database views`}
                    className="h-8 shrink-0 px-3 text-content-secondary"
                    type="button"
                    variant="ghost"
                  >
                    {overflowViewTabs.length} more…
                  </Button>
                </DropDrawerTrigger>
                <DropDrawerContent
                  align="start"
                  className="w-72 max-w-[calc(100vw-1rem)]"
                >
                  <DatabaseSearchableMenuItems
                    inputAriaLabel="Search database views"
                    inputPlaceholder="Search for a view..."
                    open={viewSwitcherOpen}
                    options={viewTabs.map((view) => ({
                      label:
                        view.id === activeViewTabId
                          ? draftViewTitle
                          : view.name,
                      value: view.id,
                    }))}
                    renderOption={(option) => {
                      const view = viewTabs.find(
                        (item) => item.id === option.value,
                      )!;
                      const ViewIcon =
                        view.fallbackIcon ??
                        (view.type === "kanban"
                          ? Kanban
                          : view.type === "timeline"
                            ? CalendarRange
                            : view.type === "chart"
                              ? ChartPie
                              : view.type === "gallery"
                                ? GalleryThumbnails
                                : view.type === "form"
                                  ? FilePenLine
                                  : view.type === "list"
                                    ? List
                                    : Table2);

                      return (
                        <DropDrawerItem
                          onSelect={() => {
                            selectActiveView(view.id);
                            setViewSwitcherOpen(false);
                          }}
                        >
                          {view.icon ? (
                            <PageIconDisplay size="sm" value={view.icon} />
                          ) : (
                            <ViewIcon />
                          )}
                          <span className="truncate">{option.label}</span>
                          {view.id === activeViewTabId ? (
                            <Check className="ml-auto" />
                          ) : null}
                        </DropDrawerItem>
                      );
                    }}
                  />
                </DropDrawerContent>
              </DropDrawer>
            ) : null}
            {canRenderAddView ? (
              <DropDrawer
                onOpenChange={setAddViewMenuOpen}
                open={addViewMenuOpen}
              >
                <DropDrawerTrigger asChild>
                  <DatabaseViewToolbarButton
                    aria-label="Add database view"
                    disabled={!databaseId || isAddingDatabaseView}
                  >
                    {isAddingDatabaseView ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Plus />
                    )}
                  </DatabaseViewToolbarButton>
                </DropDrawerTrigger>
                <DropDrawerContent
                  align="start"
                  className="w-72 max-w-[calc(100vw-1rem)] p-1"
                >
                  <ViewTypeOptionGrid
                    isOptionDisabled={isAddViewTypeDisabled}
                    onSelect={addView}
                  />
                </DropDrawerContent>
              </DropDrawer>
            ) : null}
            <div
              aria-hidden="true"
              className="pointer-events-none invisible absolute left-0 top-0 flex w-max items-center gap-0.5 p-1"
              ref={viewTabMeasurementsRef}
            >
              {viewTabs.map((view) => (
                <span
                  className="inline-flex h-8 items-center gap-2 px-3 text-sm font-medium"
                  data-view-tab-measurement
                  key={view.id}
                >
                  <span className="size-4 shrink-0" />
                  <span>
                    {view.id === activeViewTabId ? draftViewTitle : view.name}
                  </span>
                  {isExternalDataSourceView(view) ? (
                    <span className="size-3 shrink-0" />
                  ) : null}
                </span>
              ))}
            </div>
            <span
              aria-hidden="true"
              className="pointer-events-none invisible absolute left-0 top-0 inline-flex h-8 items-center px-3 text-sm font-medium"
              ref={overflowTriggerMeasurementRef}
            >
              {viewTabs.length} more…
            </span>
          </div>
          {(activeDatabaseFilters.length > 0 && showFilterPill) ||
          (activeDatabaseSorts.length > 0 && showSortPill) ? (
            <div className="mt-2 flex min-w-0 items-center gap-2 overflow-x-auto">
              {activeDatabaseFilters.length > 0 && showFilterPill ? (
                <DatabaseFilterPopover
                  activeDatabaseFilters={activeDatabaseFilters}
                  addableFilterFieldOptions={addableFilterFieldOptions}
                  canAddDatabaseFilter={canAddDatabaseFilter}
                  filterFieldOptions={filterFieldOptions}
                  filterValueOptionsByField={filterValueOptionsByField}
                  onClearDatabaseFilter={clearDatabaseFilter}
                  onCreateDatabaseFilter={createDatabaseFilter}
                  onRemoveDatabaseFilter={removeDatabaseFilter}
                  onReorderDatabaseFilters={reorderDatabaseFilters}
                  onUpdateDatabaseFilter={updateDatabaseFilter}
                >
                  <Button
                    aria-label="Open filter options"
                    className="group h-8 shrink-0 rounded-md px-3"
                    type="button"
                    variant="secondary"
                  >
                    <Filter className="size-4 self-center shrink-0" />
                    <span className="self-center truncate">
                      {`${activeDatabaseFilters.length} filter${
                        activeDatabaseFilters.length === 1 ? "" : "s"
                      }`}
                    </span>
                  </Button>
                </DatabaseFilterPopover>
              ) : null}
              {activeDatabaseSorts.length > 0 && showSortPill ? (
                <DatabaseSortPopover
                  activeDatabaseSorts={activeDatabaseSorts}
                  addableSortFieldOptions={addableSortFieldOptions}
                  canAddDatabaseSort={canAddDatabaseSort}
                  onClearDatabaseSort={clearDatabaseSort}
                  onCreateDatabaseSort={createDatabaseSort}
                  onRemoveDatabaseSort={removeDatabaseSort}
                  onUpdateDatabaseSort={updateDatabaseSort}
                  sortFieldOptions={sortFieldOptions}
                >
                  <Button
                    aria-label="Open sort options"
                    className="group h-8 shrink-0 rounded-md px-3"
                    type="button"
                    variant="secondary"
                  >
                    <ArrowDownUp className="size-4 self-center shrink-0" />
                    <span className="self-center truncate">
                      {`${activeDatabaseSorts.length} sort${
                        activeDatabaseSorts.length === 1 ? "" : "s"
                      }`}
                    </span>
                  </Button>
                </DatabaseSortPopover>
              ) : null}
            </div>
          ) : null}
        </div>
        <div
          className="ml-auto flex shrink-0 items-center gap-0"
          data-page-side-pane-avoid
        >
          {editable ? (
            <>
              {activeDatabaseFilters.length === 0 ? (
                <DropDrawer
                  open={filterPickerOpen}
                  onOpenChange={setFilterPickerOpen}
                >
                  <DropDrawerTrigger asChild>
                    <Button
                      aria-label="Add filter"
                      className="text-content-secondary"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Filter />
                    </Button>
                  </DropDrawerTrigger>
                  <DropDrawerContent
                    align="start"
                    className="w-72"
                    onCloseAutoFocus={(event) => event.preventDefault()}
                  >
                    <DatabaseSearchableMenuItems
                      inputAriaLabel="Filter properties"
                      inputIcon={<Filter className="size-4" />}
                      inputPlaceholder="Filter by..."
                      onSelect={createDatabaseFilter}
                      open={filterPickerOpen}
                      options={filterFieldOptions}
                    />
                  </DropDrawerContent>
                </DropDrawer>
              ) : (
                <Button
                  aria-label={
                    showFilterPill ? "Hide filter pill" : "Show filter pill"
                  }
                  className={
                    showFilterPill ? "text-content-primary" : "text-content-secondary"
                  }
                  onClick={toggleFilterPillVisibility}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Filter />
                </Button>
              )}
              {activeDatabaseSorts.length === 0 ? (
                <DropDrawer
                  open={sortPickerOpen}
                  onOpenChange={setSortPickerOpen}
                >
                  <DropDrawerTrigger asChild>
                    <Button
                      aria-label="Add sort"
                      className="text-content-secondary"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <ArrowDownUp />
                    </Button>
                  </DropDrawerTrigger>
                  <DropDrawerContent
                    align="start"
                    className="w-72"
                    onCloseAutoFocus={(event) => event.preventDefault()}
                  >
                    <DatabaseSearchableMenuItems
                      inputAriaLabel="Sort properties"
                      inputIcon={<ArrowDownUp className="size-4" />}
                      inputPlaceholder="Sort by..."
                      onSelect={createDatabaseSort}
                      open={sortPickerOpen}
                      options={sortFieldOptions}
                    />
                  </DropDrawerContent>
                </DropDrawer>
              ) : (
                <Button
                  aria-label={
                    showSortPill ? "Hide sort pill" : "Show sort pill"
                  }
                  className={
                    showSortPill ? "text-content-primary" : "text-content-secondary"
                  }
                  onClick={toggleSortPillVisibility}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ArrowDownUp />
                </Button>
              )}
              {automationsEnabled && automationDatabaseId && automationDataSourceId ? (
                <DatabaseAutomationManager
                  dataSourceId={automationDataSourceId}
                  databaseId={automationDatabaseId}
                  dataSourceName={activeViewTab?.dataSourceName ?? hostDisplayTitle}
                  onOpenChange={setAutomationManagerOpen}
                  open={automationManagerOpen}
                  timezone={Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"}
                />
              ) : null}
              <DatabaseViewSettingsMenu
                activeConditionalColors={activeConditionalColors}
                allContentWrapped={allContentWrapped}
                activeDatabaseSorts={activeDatabaseSorts}
                activeDataSourceId={
                  activeViewTab?.dataSourceId ?? undefined
                }
                activeDataSourceName={
                  activeViewTab?.dataSourceName ?? hostDisplayTitle
                }
                activeViewType={activeView?.type ?? activeViewTab?.type}
                activeDatabaseFilters={activeDatabaseFilters}
                addableFilterFieldOptions={addableFilterFieldOptions}
                databaseId={databaseId ?? undefined}
                dataSources={
                  configuredDataSources ??
                  (hostDatabaseId && activeViewTab?.dataSourceId
                    ? [
                        {
                          hiddenViewCount: 0,
                          id: activeViewTab.dataSourceId,
                          name: hostDisplayTitle,
                          parentDatabaseId:
                            activeViewTab.sourceParentDatabaseId ?? hostDatabaseId,
                          viewCount: hostViews.length,
                        },
                      ]
                    : [])
                }
                draftViewTitle={draftViewTitle}
                editable={editable}
                groupProperties={groupableProperties}
                groupPropertyId={groupProperty?.property.id ?? null}
                canAddDatabaseFilter={canAddDatabaseFilter}
                chartSettings={chartSettings}
                layoutSettings={layoutSettings}
                titlePropertyLabel={titlePropertyLabel}
                workspaceId={
                  hostDatabaseWorkspaceId ??
                  databaseWorkspaceId ??
                  workspaceId ??
                  undefined
                }
                isAddingDataSource={isAddingDataSource}
                onAddDataSource={addDataSource}
                onLinkDataSourceView={linkDataSourceView}
                onUnlinkDataSource={unlinkDataSource}
                onAddDataSourceView={addDataSourceView}
                onReplaceActiveViewSource={
                  replaceActiveViewSource ?? linkDataSourceView
                }
                open={viewSettingsOpen}
                onCopyDatabaseViewLink={copyDatabaseViewLink}
                onClearDatabaseFilter={clearDatabaseFilter}
                onClearDatabaseSort={clearDatabaseSort}
                onConfigureDataSources={configureDataSources}
                onCreateDatabaseFilter={createDatabaseFilter}
                onCreateDatabaseSort={createDatabaseSort}
                onDraftViewTitleChange={setDraftViewTitle}
                onOpenChange={setViewSettingsOpen}
                onOpenAutomations={automationsEnabled ? () => setAutomationManagerOpen(true) : undefined}
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
                onSetAllContentWrapped={(wrapContent) =>
                  void setAllContentWrapped(wrapContent)
                }
                onShowTitleChange={onShowTitleChange}
                onShowPageIconChange={(showPageIcon) =>
                  updateNameColumnConfig?.({ showPageIcon })
                }
                onTogglePropertyTitles={togglePropertyTitles}
                onTogglePropertyVisibility={togglePropertyVisibility}
                onUpdateDatabaseFilter={updateDatabaseFilter}
                onUpdateDatabaseChartSettings={updateDatabaseChartSettings}
                onUpdateDatabaseLayoutSettings={updateDatabaseLayoutSettings}
                onUpdateDatabaseSort={updateDatabaseSort}
                onUpdateDatabaseSubItemsSettings={
                  updateDatabaseSubItemsSettings
                }
                properties={properties}
                filterFieldOptions={filterFieldOptions}
                filterValueOptionsByField={filterValueOptionsByField}
                sortFieldOptions={sortFieldOptions}
                hostDatabaseId={hostDatabaseId ?? undefined}
                addableSortFieldOptions={addableSortFieldOptions}
                canAddDatabaseSort={canAddDatabaseSort}
                viewConfig={activeVisibilityConfig}
                visiblePropertyCount={visiblePropertyCount}
                showPropertyTitles={showPropertyTitles}
                showPageIcon={showPageIconInTitle}
                showTitle={showTitle}
                subItemsSettings={subItemsSettings}
              />
              {isFormView ? (
                <div className="ml-2 flex items-center gap-2">
                  <Button
                    aria-label="Preview form"
                    className="h-8 gap-1.5 px-3"
                    onClick={() => setFormPreviewOpen(true)}
                    type="button"
                    variant="outline"
                  >
                    <Eye />
                    <span>Preview</span>
                  </Button>
                  <DatabaseFormShareMenu />
                </div>
              ) : canRenderAddRow ? (
                <Button
                  aria-label={newRowLabel ?? "New page"}
                  className="database-new-button"
                  disabled={!databaseId || isAddingDatabaseRow}
                  onClick={() => addDatabaseRow()}
                  type="button"
                >
                  <Plus />
                  <span>{newRowLabel ?? "New"}</span>
                </Button>
              ) : null}
            </>
          ) : null}
          {showExpandButton && expandDatabaseId ? (
            <Button
              aria-label="Expand database"
              asChild
              className="database-expand-button"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Link
                params={{ databaseId: expandDatabaseId }}
                search={{ view: undefined }}
                title="Expand database"
                to="/d/$databaseId"
              >
                <Maximize2 />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <DatabaseViewToolbarDialogs
        formDialogOpen={formDialogOpen}
        formPreviewOpen={formPreviewOpen}
        formQuestionCount={formQuestionCount}
        isAddingDatabaseView={isAddingDatabaseView}
        onCreateForm={(includeExistingProperties) => {
          setFormDialogOpen(false);
          addFormView(
            includeExistingProperties
              ? []
              : properties.map((property) => property.id),
          );
        }}
        onDeleteView={() => {
          if (pendingDeleteView) deleteDatabaseView(pendingDeleteView);
        }}
        onFormDialogOpenChange={setFormDialogOpen}
        onFormPreviewOpenChange={setFormPreviewOpen}
        onPendingDeleteOpenChange={(open) => {
          if (!open) setPendingDeleteView(null);
        }}
        pendingDeleteViewName={pendingDeleteView?.name ?? null}
      />
    </div>
  );
}
