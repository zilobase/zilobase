import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ArrowDownUp,
  ArrowUpRightIcon,
  Check,
  Copy,
  CopyPlus,
  Database,
  EyeOff,
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
  Settings2,
  Smile,
  Table2,
  Trash2,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IconEmojiPicker } from "@/components/ui/icon-emoji-picker"
import { PageIconDisplay } from "@/lib/page-icon"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { getDatabaseEmoji } from "@notelab/features/databases"

import { DatabaseSearchableMenuItems } from "./database-searchable-menu-items"
import { DatabaseFilterPopover } from "./database-filter-menu"
import { DatabaseSortPopover } from "./database-sort-menu"
import { useDatabaseViewContext } from "./database-view-context"
import { DatabaseViewSettingsMenu } from "./database-view-settings-menu"
import {
  getNameColumnWrapContent,
  getPropertyWrapContent,
} from "./database-view-config"

function ToolbarMenuRow({
  icon,
  label,
  right,
}: {
  icon: ReactNode
  label: string
  right?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {icon}
      <span className="truncate">{label}</span>
      {right ? (
        <span className="ml-auto flex min-w-0 shrink-0 items-center gap-1 text-muted-foreground">
          {right}
        </span>
      ) : null}
    </div>
  )
}

export function DatabaseViewToolbar() {
  const navigate = useNavigate()
  const databaseTitleInputRef = useRef<HTMLInputElement | null>(null)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [titleActionsOpen, setTitleActionsOpen] = useState(false)
  const [openViewMenuId, setOpenViewMenuId] = useState<string | null>(null)
  const [localViewSettingsOpen, setLocalViewSettingsOpen] = useState(false)
  const {
    activeConditionalColors,
    activeDatabaseFilters,
    activeDatabaseSorts,
    activeView,
    activeViewTabId,
    activeVisibilityConfig,
    addableFilterFieldOptions,
    addableSortFieldOptions,
    addDatabaseRow,
    addChartView,
    addGalleryView,
    addKanbanView,
    addListView,
    addLinkedDatabaseView,
    addTableView,
    addTimelineView,
    canAddDatabaseSort,
    canAddDatabaseFilter,
    chartSettings,
    canAddDatabaseRows,
    canAddDatabaseViews,
    clearDatabaseFilter,
    clearDatabaseSort,
    copyDatabaseViewLink,
    createDatabaseFilter,
    createDatabaseSort,
    databaseConfig,
    databaseId,
    databaseWorkspaceId,
    deleteDatabaseView,
    draftDatabaseTitle,
    draftViewTitle,
    duplicateDatabaseView,
    editable,
    filterFieldOptions,
    filterPickerOpen,
    filterValueOptionsByField,
    fullPage,
    groupProperty,
    groupableProperties,
    hostDatabaseId,
    hostDatabaseName,
    hostDatabaseWorkspaceId,
    hostViews,
    isAddingDatabaseProperty,
    isAddingDatabaseRow,
    isAddingDatabaseView,
    linkedDatabaseViews,
    layoutSettings,
    onShowTitleChange,
    onViewSettingsOpenChange,
    titlePropertyLabel,
    workspaceId,
    properties,
    removeDatabaseFilter,
    removeDatabaseSort,
    reorderDatabaseFilters,
    saveDatabaseConditionalColors,
    saveDatabaseEmoji,
    saveDatabaseTitle,
    saveDatabaseViewTitle,
    setActiveViewId,
    setDraftDatabaseTitle,
    setDraftViewTitle,
    setFilterPickerOpen,
    setViewDateProperty,
    setViewGroupProperty,
    setViewType,
    timelineDateProperties,
    timelineDateProperty,
    setSortPickerOpen,
    showExpandButton,
    showFilterPill,
    showPageIconInTitle,
    showPropertyTitles,
    showSortPill,
    showTitle,
    sortFieldOptions,
    sortPickerOpen,
    togglePropertyVisibility,
    togglePropertyTitles,
    toggleFilterPillVisibility,
    toggleSortPillVisibility,
    updateDatabaseFilter,
    updateDatabaseChartSettings,
    updateDatabaseLayoutSettings,
    updateDatabasePropertyConfig,
    updateDatabaseSort,
    updateNameColumnConfig,
    visiblePropertyCount,
    viewTabs,
    viewSettingsOpen: controlledViewSettingsOpen,
    viewSettingsPanelTarget,
  } = useDatabaseViewContext()
  const isMobile = useIsMobile()
  const viewSettingsOpen =
    controlledViewSettingsOpen ?? localViewSettingsOpen
  const setViewSettingsOpen =
    onViewSettingsOpenChange ?? setLocalViewSettingsOpen
  const viewSettingsPresentation =
    fullPage && !isMobile && onViewSettingsOpenChange ? "sidebar" : "menu"
  const canRenderAddView = canAddDatabaseViews ?? editable
  const canRenderAddRow = canAddDatabaseRows ?? editable
  const allContentWrapped =
    getNameColumnWrapContent(databaseConfig) &&
    properties.every((property) =>
      getPropertyWrapContent(property.property.config)
    )
  const setAllContentWrapped = async (wrapContent: boolean) => {
    updateDatabaseLayoutSettings({ wrapAllContent: false })
    await updateNameColumnConfig?.({ wrapContent })

    for (const property of properties) {
      await updateDatabasePropertyConfig(property.id, { wrapContent })
    }
  }
  const activeViewTab = viewTabs.find((view) => view.id === activeViewTabId)
  const hostDisplayTitle =
    activeViewTab?.isLinked
      ? hostDatabaseName || "Untitled"
      : draftDatabaseTitle || hostDatabaseName || "Untitled"
  const databaseEmoji = getDatabaseEmoji({ config: databaseConfig })
  const canEditDatabaseEmoji = editable && Boolean(databaseId)
  const focusDatabaseTitleInput = () => {
    window.setTimeout(() => {
      databaseTitleInputRef.current?.focus()
      databaseTitleInputRef.current?.select()
    }, 0)
  }
  const openDatabaseFullPage = (nextDatabaseId: string | null | undefined) => {
    if (!nextDatabaseId) {
      return
    }

    void navigate({
      params: { databaseId: nextDatabaseId },
      search: { view: undefined },
      to: "/d/$databaseId",
    })
  }
  const renderDatabaseEmojiPicker = (onSelect?: () => void) => (
    <IconEmojiPicker
      onEmojiSelect={(emoji) => {
        saveDatabaseEmoji(emoji)
        setEmojiPickerOpen(false)
        onSelect?.()
      }}
      onIconSelect={(svg) => {
        saveDatabaseEmoji(svg)
        setEmojiPickerOpen(false)
        onSelect?.()
      }}
    />
  )
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
  )
  const databaseEmojiPicker = databaseEmoji ? (
    canEditDatabaseEmoji ? (
      <div className="group/icon relative shrink-0">
        <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
          <PopoverTrigger asChild>
            <button
              aria-label="Change database icon"
              className="flex size-9 items-center justify-center rounded-md text-2xl leading-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              type="button"
            >
              <PageIconDisplay size="lg" value={databaseEmoji} />
            </button>
          </PopoverTrigger>
          {databaseEmojiPopoverContent}
        </Popover>
        <button
          aria-label="Remove database icon"
          className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none group-focus-within/icon:flex group-hover/icon:flex [&_svg]:size-3"
          onClick={() => {
            saveDatabaseEmoji("")
            setEmojiPickerOpen(false)
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
  ) : null

  return (
    <div className="database-toolbar">
      {showTitle ? (
        <div className="group/title flex min-w-0 items-center gap-3">
          {databaseEmojiPicker}
          {activeViewTab?.isLinked ? (
            <ArrowUpRightIcon
              aria-label={`Linked from ${activeViewTab.sourceDatabaseName ?? "another database"}`}
              className="size-5 shrink-0 text-muted-foreground"
            />
          ) : null}
          <input
            aria-label="Database title"
            className="h-auto min-w-[1ch] max-w-[44ch] shrink-0 truncate border-0 bg-transparent px-0 py-0 text-2xl font-semibold leading-tight text-foreground shadow-none outline-none [field-sizing:content] placeholder:text-muted-foreground/40 focus-visible:ring-0 md:text-2xl"
            disabled={!databaseId}
            onBlur={(event) => saveDatabaseTitle(event.target.value)}
            onChange={(event) => {
              setDraftDatabaseTitle(event.target.value)
            }}
            placeholder="New database"
            ref={databaseTitleInputRef}
            value={draftDatabaseTitle}
          />
          <DropDrawer open={titleActionsOpen} onOpenChange={setTitleActionsOpen}>
            <DropDrawerTrigger asChild>
              <Button
                aria-label="Open database title actions"
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-focus-within/title:opacity-100 group-hover/title:opacity-100 data-[state=open]:opacity-100"
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <MoreHorizontal />
              </Button>
            </DropDrawerTrigger>
            <DropDrawerContent align="start" className="w-64">
              <DropDrawerItem
                disabled={!databaseId}
                onSelect={() =>
                  openDatabaseFullPage(
                    activeViewTab?.sourceDatabaseId ?? databaseId
                  )
                }
              >
                <ArrowUpRightIcon />
                <span>
                  {activeViewTab?.isLinked ? "View data source" : "View database"}
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
                      "pointer-events-none opacity-50"
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
                  onShowTitleChange?.(false)
                  setTitleActionsOpen(false)
                }}
              >
                <EyeOff />
                <span>
                  {activeViewTab?.isLinked
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
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
            <Tabs
              onValueChange={(value) => {
                if (value == null) {
                  return
                }

                setOpenViewMenuId(null)
                setActiveViewId(String(value))
              }}
              value={activeViewTabId}
            >
              <TabsList variant="tab" className="min-w-0 w-full justify-start overflow-x-auto">
                {viewTabs.map((view) => {
                  const isActiveView = view.id === activeViewTabId
                  const ViewIcon =
                    view.type === "kanban"
                      ? Kanban
                      : view.type === "timeline"
                        ? CalendarRange
                        : view.type === "chart"
                          ? ChartPie
                          : view.type === "gallery"
                            ? GalleryThumbnails
                            : view.type === "list"
                              ? List
                              : Table2
                  const sourceDatabaseId =
                    view.sourceDatabaseId ?? hostDatabaseId ?? databaseId
                  const sourceDatabaseName =
                    view.sourceDatabaseName ?? hostDisplayTitle
                  const renameView = () => {
                    const currentTitle = isActiveView ? draftViewTitle : view.name
                    const nextTitle = window
                      .prompt("Rename view", currentTitle)
                      ?.trim()

                    if (!nextTitle || nextTitle === currentTitle) {
                      return
                    }

                    setActiveViewId(view.id)
                    setDraftViewTitle(nextTitle)
                    window.setTimeout(() => saveDatabaseViewTitle(nextTitle), 0)
                  }
                  const handleViewContextMenu = (
                    event: MouseEvent<HTMLButtonElement>
                  ) => {
                    event.preventDefault()
                    setActiveViewId(view.id)
                    setOpenViewMenuId(view.id)
                  }
                  const handleViewClick = (
                    event: MouseEvent<HTMLButtonElement>
                  ) => {
                    if (isActiveView) {
                      return
                    }

                    event.preventDefault()
                    event.stopPropagation()
                    setOpenViewMenuId(null)
                    setActiveViewId(view.id)
                  }
                  const selectInactiveView = () => {
                    setOpenViewMenuId(null)
                    setActiveViewId(view.id)
                  }
                  const handleViewPointerDownCapture = (
                    event: PointerEvent<HTMLButtonElement>
                  ) => {
                    if (isActiveView || event.button !== 0) {
                      return
                    }

                    event.preventDefault()
                    event.stopPropagation()
                    selectInactiveView()
                  }
                  const handleViewKeyDownCapture = (
                    event: KeyboardEvent<HTMLButtonElement>
                  ) => {
                    if (
                      isActiveView ||
                      (event.key !== "Enter" && event.key !== " ")
                    ) {
                      return
                    }

                    event.preventDefault()
                    event.stopPropagation()
                    selectInactiveView()
                  }

                  return (
                    <DropDrawer
                      key={view.id}
                      onOpenChange={(open) => {
                        setOpenViewMenuId(open ? view.id : null)

                        if (open) {
                          setActiveViewId(view.id)
                        }
                      }}
                      open={openViewMenuId === view.id}
                    >
                      <DropDrawerTrigger asChild>
                        <TabsTrigger
                          className="h-8 shrink-0 grow-0 gap-2 px-3"
                          onClick={handleViewClick}
                          onContextMenu={handleViewContextMenu}
                          onKeyDownCapture={handleViewKeyDownCapture}
                          onPointerDownCapture={handleViewPointerDownCapture}
                          value={view.id}
                        >
                          <ViewIcon className="size-4 shrink-0" />
                          <span className="truncate">
                            {isActiveView ? draftViewTitle : view.name}
                          </span>
                          {view.isLinked ? (
                            <ArrowUpRightIcon
                              aria-label={`Linked from ${view.sourceDatabaseName ?? "another database"}`}
                              className="size-3 shrink-0 text-muted-foreground"
                            />
                          ) : null}
                        </TabsTrigger>
                      </DropDrawerTrigger>
                      <DropDrawerContent
                        align="start"
                        className="w-72"
                        onCloseAutoFocus={(event) => event.preventDefault()}
                      >
                    <DropDrawerItem
                      disabled={!editable || !databaseId}
                      onSelect={renameView}
                    >
                      <Pencil />
                      <span>Rename</span>
                    </DropDrawerItem>
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
                            setActiveViewId(view.id)
                            setViewType("table")
                          }}
                        >
                          <Table2 />
                          <span>Table</span>
                          {view.type === "table" ? (
                            <Check className="ml-auto text-foreground" />
                          ) : null}
                        </DropDrawerItem>
                        <DropDrawerItem
                          disabled={!editable || view.type === "kanban"}
                          onSelect={() => {
                            setActiveViewId(view.id)
                            setViewType("kanban")
                          }}
                        >
                          <Kanban />
                          <span>Board</span>
                          {view.type === "kanban" ? (
                            <Check className="ml-auto text-foreground" />
                          ) : null}
                        </DropDrawerItem>
                        <DropDrawerItem
                          disabled={!editable || view.type === "gallery"}
                          onSelect={() => {
                            setActiveViewId(view.id)
                            setViewType("gallery")
                          }}
                        >
                          <GalleryThumbnails />
                          <span>Gallery</span>
                          {view.type === "gallery" ? (
                            <Check className="ml-auto text-foreground" />
                          ) : null}
                        </DropDrawerItem>
                        <DropDrawerItem
                          disabled={!editable || view.type === "list"}
                          onSelect={() => {
                            setActiveViewId(view.id)
                            setViewType("list")
                          }}
                        >
                          <List />
                          <span>List</span>
                          {view.type === "list" ? (
                            <Check className="ml-auto text-foreground" />
                          ) : null}
                        </DropDrawerItem>
                        <DropDrawerItem
                          disabled={!editable || view.type === "chart"}
                          onSelect={() => {
                            setActiveViewId(view.id)
                            setViewType("chart")
                          }}
                        >
                          <ChartPie />
                          <span>Chart</span>
                          {view.type === "chart" ? (
                            <Check className="ml-auto text-foreground" />
                          ) : null}
                        </DropDrawerItem>
                        <DropDrawerItem
                          disabled={!editable || view.type === "timeline"}
                          onSelect={() => {
                            setActiveViewId(view.id)
                            setViewType("timeline")
                          }}
                        >
                          <CalendarRange />
                          <span>Timeline</span>
                          {view.type === "timeline" ? (
                            <Check className="ml-auto text-foreground" />
                          ) : null}
                        </DropDrawerItem>
                      </DropDrawerSubContent>
                    </DropDrawerSub>
                    <DropDrawerItem
                      onSelect={() => {
                        setActiveViewId(view.id)
                        setViewSettingsOpen(true)
                      }}
                    >
                      <Settings2 />
                      <span>Edit view</span>
                    </DropDrawerItem>
                    <DropDrawerSub>
                      <DropDrawerSubTrigger>
                        <ToolbarMenuRow
                          icon={<Database />}
                          label="Source"
                          right={
                            <>
                              {view.isLinked ? (
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
                          disabled={!sourceDatabaseId}
                          onSelect={() => openDatabaseFullPage(sourceDatabaseId)}
                        >
                          <ArrowUpRightIcon />
                          <span>
                            {view.isLinked
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
                      disabled={!sourceDatabaseId}
                      onSelect={() => openDatabaseFullPage(sourceDatabaseId)}
                    >
                      <ArrowUpRightIcon />
                      <span>
                        {view.isLinked
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
                      disabled={!editable || !databaseId || viewTabs.length <= 1}
                      onSelect={() => deleteDatabaseView(view)}
                    >
                      <Trash2 />
                      <span>Delete view</span>
                    </DropDrawerItem>
                  </DropDrawerContent>
                    </DropDrawer>
                  )
                })}
              </TabsList>
            </Tabs>
            {canRenderAddView ? (
            <DropDrawer>
              <DropDrawerTrigger asChild>
                <Button
                  aria-label="Add database view"
                  className="h-8 w-8 shrink-0 rounded-full"
                  disabled={!databaseId || isAddingDatabaseView}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  {isAddingDatabaseView ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                </Button>
              </DropDrawerTrigger>
              <DropDrawerContent align="start" className="w-40">
                <DropDrawerItem
                  disabled={!databaseId || isAddingDatabaseView}
                  onSelect={addTableView}
                >
                  <Table2 className="size-4" />
                  <span>Table</span>
                </DropDrawerItem>
                <DropDrawerItem
                  disabled={!databaseId || isAddingDatabaseView}
                  onSelect={addGalleryView}
                >
                  <GalleryThumbnails className="size-4" />
                  <span>Gallery</span>
                </DropDrawerItem>
                <DropDrawerItem
                  disabled={!databaseId || isAddingDatabaseView}
                  onSelect={addListView}
                >
                  <List className="size-4" />
                  <span>List</span>
                </DropDrawerItem>
                <DropDrawerItem
                  disabled={
                    !databaseId ||
                    isAddingDatabaseView ||
                    isAddingDatabaseProperty
                  }
                  onSelect={addKanbanView}
                >
                  <Kanban className="size-4" />
                  <span>Kanban</span>
                </DropDrawerItem>
                <DropDrawerItem
                  disabled={!databaseId || isAddingDatabaseView}
                  onSelect={addChartView}
                >
                  <ChartPie className="size-4" />
                  <span>Chart</span>
                </DropDrawerItem>
                <DropDrawerItem
                  disabled={
                    !databaseId ||
                    isAddingDatabaseView ||
                    isAddingDatabaseProperty
                  }
                  onSelect={addTimelineView}
                >
                  <CalendarRange className="size-4" />
                  <span>Timeline</span>
                </DropDrawerItem>
              </DropDrawerContent>
            </DropDrawer>
            ) : null}
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
                    className="group h-8 shrink-0 rounded-full px-3"
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
                    className="group h-8 shrink-0 rounded-full px-3"
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
        <div className="ml-auto flex shrink-0 items-center gap-2">
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
                      className="text-muted-foreground"
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
                    showFilterPill ? "text-foreground" : "text-muted-foreground"
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
                      className="text-muted-foreground"
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
                  aria-label={showSortPill ? "Hide sort pill" : "Show sort pill"}
                  className={
                    showSortPill ? "text-foreground" : "text-muted-foreground"
                  }
                  onClick={toggleSortPillVisibility}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ArrowDownUp />
                </Button>
              )}
              <DatabaseViewSettingsMenu
                activeConditionalColors={activeConditionalColors}
                allContentWrapped={allContentWrapped}
                activeDatabaseSorts={activeDatabaseSorts}
                activeViewType={activeView?.type ?? activeViewTab?.type}
                activeDatabaseFilters={activeDatabaseFilters}
                addableFilterFieldOptions={addableFilterFieldOptions}
                databaseId={databaseId ?? undefined}
                databaseName={hostDisplayTitle}
                dataSources={
                  hostDatabaseId
                    ? [
                        {
                          id: hostDatabaseId,
                          name: hostDisplayTitle,
                          viewCount: hostViews.length,
                        },
                      ]
                    : []
                }
                draftViewTitle={draftViewTitle}
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
                linkedViews={linkedDatabaseViews}
                onAddLinkedDatabaseView={addLinkedDatabaseView}
                open={viewSettingsOpen}
                onCopyDatabaseViewLink={copyDatabaseViewLink}
                onClearDatabaseFilter={clearDatabaseFilter}
                onClearDatabaseSort={clearDatabaseSort}
                onCreateDatabaseFilter={createDatabaseFilter}
                onCreateDatabaseSort={createDatabaseSort}
                onDraftViewTitleChange={setDraftViewTitle}
                onOpenChange={setViewSettingsOpen}
                onRemoveDatabaseFilter={removeDatabaseFilter}
                onRemoveDatabaseSort={removeDatabaseSort}
                onReorderDatabaseFilters={reorderDatabaseFilters}
                onSaveDatabaseConditionalColors={saveDatabaseConditionalColors}
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
                properties={properties}
                presentation={viewSettingsPresentation}
                portalTarget={viewSettingsPanelTarget}
                filterFieldOptions={filterFieldOptions}
                filterValueOptionsByField={filterValueOptionsByField}
                sortFieldOptions={sortFieldOptions}
                sourceDatabaseId={hostDatabaseId ?? undefined}
                addableSortFieldOptions={addableSortFieldOptions}
                canAddDatabaseSort={canAddDatabaseSort}
                viewConfig={activeVisibilityConfig}
                visiblePropertyCount={visiblePropertyCount}
                showPropertyTitles={showPropertyTitles}
                showPageIcon={showPageIconInTitle}
                showTitle={showTitle}
              />
              {canRenderAddRow ? (
              <Button
                className="database-new-button"
                disabled={!databaseId || isAddingDatabaseRow}
                onClick={() => addDatabaseRow()}
                type="button"
              >
                {isAddingDatabaseRow ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Plus />
                )}
                <span>New</span>
              </Button>
              ) : null}
            </>
          ) : null}
          {showExpandButton && databaseId ? (
            <Button
              aria-label="Expand database"
              asChild
              className="database-expand-button"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Link
                params={{ databaseId }}
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
    </div>
  )
}
