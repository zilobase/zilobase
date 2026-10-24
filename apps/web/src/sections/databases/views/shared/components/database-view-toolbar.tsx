import { DatabaseViewTabAppearance } from "./database-view-tab-appearance";
import { getDatabaseViewTypePresentation } from "../../settings/lib/view-type-options";
import { getVisibleToolbarViewCount, partitionToolbarViews } from "../../lib/toolbar-view-overflow";
import { DatabaseToolbarActions } from "./database-toolbar-actions";
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  Check,
  Copy,
  CopyPlus,
  Database,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Paintbrush,
  Pencil,
  Plus,
  SlidersHorizontalIcon,
  Smile,
  Trash2,
} from "@/components/icons";

import { Button } from "@/components/ui/button";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/app-tabs";
import { IconEmojiPicker } from "@/components/ui/icon-emoji-picker";
import { PageIconDisplay } from "@/sections/pages/appearance/components/page-icon";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getDatabaseEmoji } from "@zilobase/features/databases";

import { DatabaseSearchableMenuItems } from "./database-searchable-menu-items";
import { DatabaseFilterBar } from "./database-filter-bar";
import { DatabaseSortBar } from "./database-sort-bar";
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
  type DatabaseViewTab,
} from "../../state/components/database-view-context";
import { DatabaseViewToolbarButton } from "./database-view-toolbar-button";

import { DatabaseViewToolbarDialogs } from "./database-view-toolbar-dialogs";
import { ViewTypeOptionGrid } from "../../settings/components/view-type-option-grid";
import type { DatabaseViewType } from "../../settings/lib/view-type-options";

export function DatabaseViewToolbar({
  canRestoreDeleted = false,
  deletedDatabaseId = null,
}: {
  canRestoreDeleted?: boolean;
  deletedDatabaseId?: string | null;
} = {}) {
  const navigate = useNavigate();
  const databaseTitleInputRef = useRef<HTMLInputElement | null>(null);
  const viewNavigationRef = useRef<HTMLDivElement | null>(null);
  const viewTabMeasurementsRef = useRef<HTMLDivElement | null>(null);
  const overflowTriggerMeasurementRef = useRef<HTMLSpanElement | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [viewIconPickerOpenId, setViewIconPickerOpenId] = useState<string | null>(null);
  const [titleActionsOpen, setTitleActionsOpen] = useState(false);
  const [openViewMenuId, setOpenViewMenuId] = useState<string | null>(null);
  const [pendingDeleteView, setPendingDeleteView] = useState<DatabaseViewTab | null>(null);
  const [addViewMenuOpen, setAddViewMenuOpen] = useState(false);
  const [viewSwitcherOpen, setViewSwitcherOpen] = useState(false);
  const [visibleViewCount, setVisibleViewCount] = useState(Number.MAX_SAFE_INTEGER);
  const [localViewSettingsOpen, setLocalViewSettingsOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [formPreviewOpen, setFormPreviewOpen] = useState(false);

  const {
    addChartView,
    addFormView,
    addGalleryView,
    addKanbanView,
    addListView,
    addTableView,
    addTimelineView,
    addCalendarView,
    clearDatabaseFilter,
    clearDatabaseSort,
    copyDatabaseViewLink,
    createDatabaseFilter,
    createDatabaseSort,
    deleteDatabaseView,
    duplicateDatabaseView,
    onShowTitleChange,
    prefetchDatabaseView,
    removeDatabaseFilter,
    removeDatabaseSort,
    reorderDatabaseFilters,
    saveDatabaseEmoji,
    saveDatabaseTitle,
    setActiveViewId,
    setDraftDatabaseTitle,
    setViewType,
    updateDatabaseFilter,
    updateDatabaseSort,
  } = useDatabaseActionsContext();
  const {
    activeDatabaseFilters,
    activeDatabaseSorts,
    addableFilterFieldOptions,
    addableSortFieldOptions,
    canAddDatabaseSort,
    canAddDatabaseFilter,
    canAddDatabaseViews,
    databaseConfig,
    databaseId,
    editable,
    filterFieldOptions,
    filterValueOptionsByField,
    hostDatabaseId,
    hostDatabaseName,
    isAddingDatabaseProperty,
    isAddingDatabaseView,
    properties,
    sortFieldOptions,
  } = useDatabaseDataContext();
  const {
    activeViewTabId,
    draftDatabaseTitle,
    draftViewTitle,
    fullPage,
    showFilterPill,
    showSortPill,
    showTitle,
    viewTabs,
  } = useDatabaseUiContext();

  const setViewSettingsOpen = setLocalViewSettingsOpen;
  const canRenderAddView = canAddDatabaseViews ?? editable;

  const formQuestionCount = properties.length + 1;

  const activeViewTab = viewTabs.find((view) => view.id === activeViewTabId);

  const { visibleViewTabs, overflowViewTabs } = partitionToolbarViews(
    viewTabs,
    activeViewTab,
    visibleViewCount,
  );
  const isExternalDataSourceView = (view?: DatabaseViewTab | null) =>
    Boolean(
      view?.sourceParentDatabaseId &&
      hostDatabaseId &&
      view.sourceParentDatabaseId !== hostDatabaseId,
    );

  const selectActiveView = (viewId: string) => {
    if (viewId === activeViewTabId) {
      return;
    }

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
      case "calendar":
        addCalendarView();
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
    ((type === "kanban" || type === "timeline" || type === "calendar") && isAddingDatabaseProperty);

  useLayoutEffect(() => {
    const navigation = viewNavigationRef.current;
    const measurements = viewTabMeasurementsRef.current;
    const overflowTrigger = overflowTriggerMeasurementRef.current;

    if (!navigation || !measurements || !overflowTrigger || typeof ResizeObserver === "undefined") {
      return;
    }

    const measure = () => {
      const tabWidths = Array.from(
        measurements.querySelectorAll<HTMLElement>("[data-view-tab-measurement]"),
        (tab) => tab.offsetWidth,
      );
      setVisibleViewCount(
        getVisibleToolbarViewCount({
          viewCount: viewTabs.length,
          tabWidths,
          availableWidth: navigation.clientWidth,
          overflowWidth: overflowTrigger.offsetWidth,
          activeIndex: viewTabs.findIndex((view) => view.id === activeViewTabId),
          canAddView: canRenderAddView,
        }),
      );
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
      onRemove={
        databaseEmoji
          ? () => {
              saveDatabaseEmoji("");
              setEmojiPickerOpen(false);
              onSelect?.();
            }
          : undefined
      }
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
              className="inline-flex shrink-0 items-center justify-center rounded-sm border-0 bg-transparent p-0 leading-none focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none"
              type="button"
            >
              <PageIconDisplay className="size-auto" size="lg" value={databaseEmoji} />
            </button>
          </PopoverTrigger>
          {databaseEmojiPopoverContent}
        </Popover>
      </div>
    ) : (
      <span
        aria-label="Database icon"
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-2xl leading-none"
      >
        <PageIconDisplay className="size-auto" size="lg" value={databaseEmoji} />
      </span>
    )
  ) : null;

  return (
    <div className="database-toolbar">
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
          <DropDrawer open={titleActionsOpen} onOpenChange={setTitleActionsOpen}>
            <DropDrawerTrigger asChild>
              <DatabaseViewToolbarButton
                aria-label="Open database title actions"
                className="opacity-0 transition-opacity group-focus-within/title:opacity-100 group-hover/title:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal />
              </DatabaseViewToolbarButton>
            </DropDrawerTrigger>
            <DropDrawerContent align="start" width="lg">
              <DropDrawerItem
                disabled={!databaseId}
                onSelect={() =>
                  openDatabaseFullPage(activeViewTab?.sourceParentDatabaseId ?? databaseId)
                }
              >
                <ArrowUpRightIcon />
                <span>
                  {isExternalDataSourceView(activeViewTab) ? "View data source" : "View database"}
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
                    (!canEditDatabaseEmoji || !databaseId) && "pointer-events-none opacity-50",
                  )}
                >
                  <Smile />
                  <span>Edit icon</span>
                </DropDrawerSubTrigger>
                <DropDrawerSubContent className="overflow-hidden" padding="none" width="auto">
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
      <div className="flex min-w-0 items-start gap-2">
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
              <TabsList className="min-w-0" width="max">
                {visibleViewTabs.map((view) => {
                  const isActiveView = view.id === activeViewTabId;
                  const ViewIcon =
                    view.fallbackIcon ?? getDatabaseViewTypePresentation(view.type).Icon;
                  const sourceParentDatabaseId =
                    view.sourceParentDatabaseId ?? hostDatabaseId ?? databaseId;
                  const sourceDatabaseName = view.dataSourceName ?? hostDisplayTitle;
                  const handleViewContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
                    event.preventDefault();
                    selectActiveView(view.id);
                    setOpenViewMenuId(view.id);
                  };
                  const handleViewClick = (event: MouseEvent<HTMLButtonElement>) => {
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
                  const handleViewPointerDownCapture = (event: PointerEvent<HTMLButtonElement>) => {
                    if (isActiveView || event.button !== 0) {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    selectInactiveView();
                  };
                  const handleViewKeyDownCapture = (event: KeyboardEvent<HTMLButtonElement>) => {
                    if (isActiveView || (event.key !== "Enter" && event.key !== " ")) {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    selectInactiveView();
                  };

                  function renderViewSource() {
                    return (
                      <DropDrawerSub>
                        <DropDrawerSubTrigger
                          trailing={
                            <span className="flex items-center gap-1">
                              {isExternalDataSourceView(view) ? (
                                <ArrowUpRightIcon className="size-3" />
                              ) : null}
                              <span className="block max-w-28 truncate">{sourceDatabaseName}</span>
                            </span>
                          }
                        >
                          <Database />
                          <span className="truncate">Source</span>
                        </DropDrawerSubTrigger>
                        <DropDrawerSubContent className="w-60">
                          <DropDrawerItem
                            disabled={!sourceParentDatabaseId}
                            onSelect={() => openDatabaseFullPage(sourceParentDatabaseId)}
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
                    );
                  }

                  function renderViewActions() {
                    return (
                      <>
                        <DropDrawerItem onSelect={copyDatabaseViewLink}>
                          <Copy />
                          <span>Copy link to view</span>
                        </DropDrawerItem>
                        <DropDrawerItem
                          disabled={!sourceParentDatabaseId}
                          onSelect={() => openDatabaseFullPage(sourceParentDatabaseId)}
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
                            {showTitle ? "Hide data source titles" : "Show data source title"}
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
                          disabled={!editable || !databaseId || viewTabs.length <= 1}
                          onSelect={() => setPendingDeleteView(view)}
                        >
                          <Trash2 />
                          <span>Delete view</span>
                        </DropDrawerItem>
                      </>
                    );
                  }

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
                            onClick={handleViewClick}
                            onContextMenu={handleViewContextMenu}
                            onFocus={() => prefetchDatabaseView(view.id)}
                            onKeyDownCapture={handleViewKeyDownCapture}
                            onMouseEnter={() => prefetchDatabaseView(view.id)}
                            onPointerDownCapture={handleViewPointerDownCapture}
                            value={view.id}
                            width="content"
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
                        onCloseAutoFocus={(event) => event.preventDefault()}
                        width="default"
                      >
                        <DatabaseViewTabAppearance
                          view={view}
                          selectActiveView={selectActiveView}
                          openPickerId={viewIconPickerOpenId}
                          onPickerChange={setViewIconPickerOpenId}
                        />
                        <DropDrawerSub>
                          <DropDrawerSubTrigger>
                            <Paintbrush />
                            <span className="truncate">Display as</span>
                          </DropDrawerSubTrigger>
                          <DropDrawerSubContent width="md">
                            {(
                              [
                                "table",
                                "kanban",
                                "gallery",
                                "list",
                                "chart",
                                "timeline",
                                "calendar",
                                "form",
                              ] as const
                            ).map((type) => {
                              const { Icon, label } = getDatabaseViewTypePresentation(type);
                              return (
                                <DropDrawerItem
                                  key={type}
                                  disabled={!editable || view.type === type}
                                  onSelect={() => {
                                    selectActiveView(view.id);
                                    setViewType(type);
                                  }}
                                >
                                  <Icon />
                                  <span>{type === "kanban" ? "Board" : label}</span>
                                  {view.type === type ? (
                                    <Check className="ml-auto text-content-primary" />
                                  ) : null}
                                </DropDrawerItem>
                              );
                            })}
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
                        {renderViewSource()}
                        <DropDrawerSeparator />
                        {renderViewActions()}
                      </DropDrawerContent>
                    </DropDrawer>
                  );
                })}
              </TabsList>
            </Tabs>
            {overflowViewTabs.length > 0 ? (
              <DropDrawer onOpenChange={setViewSwitcherOpen} open={viewSwitcherOpen}>
                <DropDrawerTrigger asChild>
                  <Button
                    aria-label={`${overflowViewTabs.length} more database views`}
                    className="h-7 shrink-0 px-3 text-content-secondary"
                    type="button"
                    variant="ghost"
                  >
                    {overflowViewTabs.length} more…
                  </Button>
                </DropDrawerTrigger>
                <DropDrawerContent align="start" className="w-72 max-w-[calc(100vw-1rem)]">
                  <DatabaseSearchableMenuItems
                    inputAriaLabel="Search database views"
                    inputPlaceholder="Search for a view..."
                    open={viewSwitcherOpen}
                    options={viewTabs.map((view) => ({
                      label: view.id === activeViewTabId ? draftViewTitle : view.name,
                      value: view.id,
                    }))}
                    renderOption={(option) => {
                      const view = viewTabs.find((item) => item.id === option.value)!;
                      const ViewIcon =
                        view.fallbackIcon ?? getDatabaseViewTypePresentation(view.type).Icon;

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
                          {view.id === activeViewTabId ? <Check className="ml-auto" /> : null}
                        </DropDrawerItem>
                      );
                    }}
                  />
                </DropDrawerContent>
              </DropDrawer>
            ) : null}
            {canRenderAddView ? (
              // Modal aria-hiding touches neighboring editor blocks when the
              // timeline has a live region, causing ProseMirror to remount us.
              <DropDrawer modal={false} onOpenChange={setAddViewMenuOpen} open={addViewMenuOpen}>
                <DropDrawerTrigger asChild>
                  <DatabaseViewToolbarButton
                    aria-label="Add database view"
                    disabled={!databaseId || isAddingDatabaseView}
                  >
                    {isAddingDatabaseView ? <Loader2 className="animate-spin" /> : <Plus />}
                  </DatabaseViewToolbarButton>
                </DropDrawerTrigger>
                <DropDrawerContent align="start" className="w-72 max-w-[calc(100vw-1rem)] p-1">
                  <ViewTypeOptionGrid isOptionDisabled={isAddViewTypeDisabled} onSelect={addView} />
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
                  className="inline-flex h-7 items-center gap-2 px-3 text-sm font-medium"
                  data-view-tab-measurement
                  key={view.id}
                >
                  <span className="size-4 shrink-0" />
                  <span>{view.id === activeViewTabId ? draftViewTitle : view.name}</span>
                  {isExternalDataSourceView(view) ? <span className="size-3 shrink-0" /> : null}
                </span>
              ))}
            </div>
            <span
              aria-hidden="true"
              className="pointer-events-none invisible absolute left-0 top-0 inline-flex h-7 items-center px-3 text-sm font-medium"
              ref={overflowTriggerMeasurementRef}
            >
              {viewTabs.length} more…
            </span>
          </div>
        </div>
        <DatabaseToolbarActions
          canRestoreDeleted={canRestoreDeleted}
          deletedDatabaseId={deletedDatabaseId}
          settingsOpen={localViewSettingsOpen}
          onSettingsOpenChange={setLocalViewSettingsOpen}
          onPreviewForm={() => setFormPreviewOpen(true)}
        />
      </div>
      {(activeDatabaseFilters.length > 0 && showFilterPill) ||
      (activeDatabaseSorts.length > 0 && showSortPill) ? (
        <div className="flex min-w-0 flex-col gap-2">
          {activeDatabaseFilters.length > 0 && showFilterPill ? (
            <DatabaseFilterBar
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
            />
          ) : null}
          {activeDatabaseSorts.length > 0 && showSortPill ? (
            <DatabaseSortBar
              activeDatabaseSorts={activeDatabaseSorts}
              addableSortFieldOptions={addableSortFieldOptions}
              canAddDatabaseSort={canAddDatabaseSort}
              onClearDatabaseSort={clearDatabaseSort}
              onCreateDatabaseSort={createDatabaseSort}
              onRemoveDatabaseSort={removeDatabaseSort}
              onUpdateDatabaseSort={updateDatabaseSort}
              sortFieldOptions={sortFieldOptions}
            />
          ) : null}
        </div>
      ) : null}
      <DatabaseViewToolbarDialogs
        formDialogOpen={formDialogOpen}
        formPreviewOpen={formPreviewOpen}
        formQuestionCount={formQuestionCount}
        isAddingDatabaseView={isAddingDatabaseView}
        onCreateForm={(includeExistingProperties) => {
          setFormDialogOpen(false);
          addFormView(includeExistingProperties ? [] : properties.map((property) => property.id));
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
