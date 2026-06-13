import {
  useRef,
  useState,
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
  Kanban,
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
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker"
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
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { getDatabaseEmoji } from "@notelab/features/databases"

import { DatabaseSearchableMenuItems } from "./database-searchable-menu-items"
import { DatabaseFilterPopover } from "./database-filter-menu"
import { DatabaseSortPopover } from "./database-sort-menu"
import { useDatabaseViewContext } from "./database-view-context"
import { DatabaseViewSettingsMenu } from "./database-view-settings-menu"

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
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false)
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
    addKanbanView,
    addLinkedDatabaseView,
    addTableView,
    canAddDatabaseSort,
    canAddDatabaseFilter,
    clearDatabaseFilter,
    clearDatabaseSort,
    copyDatabaseViewLink,
    createDatabaseFilter,
    createDatabaseSort,
    databaseConfig,
    databaseId,
    databaseOrganizationId,
    deleteDatabaseView,
    draftDatabaseTitle,
    draftViewTitle,
    duplicateDatabaseView,
    editable,
    filterFieldOptions,
    filterPickerOpen,
    filterValueOptionsByField,
    groupProperty,
    groupableProperties,
    hostDatabaseId,
    hostDatabaseName,
    hostDatabaseOrganizationId,
    hostViews,
    isAddingDatabaseProperty,
    isAddingDatabaseRow,
    isAddingDatabaseView,
    linkedDatabaseViews,
    onShowTitleChange,
    titlePropertyLabel,
    organizationId,
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
    setViewGroupProperty,
    setViewType,
    setSortPickerOpen,
    showExpandButton,
    showFilterPill,
    showSortPill,
    showTitle,
    sortFieldOptions,
    sortPickerOpen,
    togglePropertyVisibility,
    toggleFilterPillVisibility,
    toggleSortPillVisibility,
    updateDatabaseFilter,
    updateDatabaseSort,
    visiblePropertyCount,
    viewTabs,
  } = useDatabaseViewContext()
  const activeViewTab = viewTabs.find((view) => view.id === activeViewTabId)
  const hostDisplayTitle =
    activeViewTab?.isLinked
      ? hostDatabaseName || "Untitled"
      : draftDatabaseTitle || hostDatabaseName || "Untitled"
  const databaseEmoji = getDatabaseEmoji({ config: databaseConfig })
  const canEditDatabaseEmoji = editable && Boolean(databaseId)
  const databaseTitleMeasureValue = draftDatabaseTitle || "New database"
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
      to: "/database/$databaseId",
    })
  }
  const renderDatabaseEmojiPicker = (onSelect?: () => void) => (
    <EmojiPicker
      onEmojiSelect={({ emoji }) => {
        saveDatabaseEmoji(emoji)
        setEmojiPickerOpen(false)
        onSelect?.()
      }}
    >
      <EmojiPickerSearch autoFocus placeholder="Search emoji..." />
      <EmojiPickerContent />
      <EmojiPickerFooter />
    </EmojiPicker>
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
              {databaseEmoji}
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
        {databaseEmoji}
      </span>
    )
  ) : null

  return (
    <div className="database-toolbar">
      {showTitle ? (
        <div className="group/title flex min-w-0 items-center gap-0">
          {databaseEmojiPicker}
          {activeViewTab?.isLinked ? (
            <ArrowUpRightIcon
              aria-label={`Linked from ${activeViewTab.sourceDatabaseName ?? "another database"}`}
              className="size-5 shrink-0 text-muted-foreground"
            />
          ) : null}
          <span className="inline-grid w-fit min-w-[1ch] max-w-[44ch] shrink-0 overflow-hidden">
            <span
              aria-hidden="true"
              className="invisible col-start-1 row-start-1 max-w-[44ch] overflow-hidden text-ellipsis whitespace-pre text-2xl font-semibold leading-tight md:text-2xl"
            >
              {databaseTitleMeasureValue}
            </span>
            <Input
              aria-label="Database title"
              className="col-start-1 row-start-1 h-auto w-full min-w-[1ch] max-w-[44ch] rounded-none border-0 bg-transparent px-0 py-0 text-2xl font-semibold leading-tight truncate text-foreground shadow-none placeholder:text-muted-foreground/40 focus-visible:border-transparent focus-visible:ring-0 md:text-2xl dark:bg-transparent"
              disabled={!databaseId}
              onBlur={(event) => saveDatabaseTitle(event.target.value)}
              onChange={(event) => {
                setDraftDatabaseTitle(event.target.value)
              }}
              placeholder="New database"
              ref={databaseTitleInputRef}
              value={draftDatabaseTitle}
            />
          </span>
          <DropDrawer open={titleActionsOpen} onOpenChange={setTitleActionsOpen}>
            <DropDrawerTrigger asChild>
              <Button
                aria-label="Open database title actions"
                className="-ml-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-focus-within/title:opacity-100 group-hover/title:opacity-100 data-[state=open]:opacity-100"
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
            {viewTabs.map((view) => {
              const isActiveView = view.id === activeViewTabId
              const ViewIcon = view.type === "kanban" ? Kanban : Table2
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
              const handleViewPointerDown = (
                event: PointerEvent<HTMLButtonElement>
              ) => {
                if (!isActiveView && event.button === 0) {
                  event.preventDefault()
                  setOpenViewMenuId(null)
                  setActiveViewId(view.id)
                }
              }
              const handleViewClick = (event: MouseEvent<HTMLButtonElement>) => {
                if (!isActiveView) {
                  event.preventDefault()
                  setOpenViewMenuId(null)
                  setActiveViewId(view.id)
                }
              }
              const handleViewContextMenu = (
                event: MouseEvent<HTMLButtonElement>
              ) => {
                event.preventDefault()
                setActiveViewId(view.id)
                setOpenViewMenuId(view.id)
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
                    <button
                      aria-pressed={isActiveView}
                      className={cn(
                        "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-sm font-medium transition-colors",
                        isActiveView
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      onClick={handleViewClick}
                      onContextMenu={handleViewContextMenu}
                      onPointerDown={handleViewPointerDown}
                      type="button"
                    >
                      <ViewIcon className="mr-2 size-4 shrink-0" />
                      <span className="truncate">
                        {isActiveView ? draftViewTitle : view.name}
                      </span>
                      {view.isLinked ? (
                        <ArrowUpRightIcon
                          aria-label={`Linked from ${view.sourceDatabaseName ?? "another database"}`}
                          className="ml-2 size-3 shrink-0 text-muted-foreground"
                        />
                      ) : null}
                    </button>
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
              </DropDrawerContent>
            </DropDrawer>
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
                activeDatabaseSorts={activeDatabaseSorts}
                activeViewType={activeView?.type}
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
                titlePropertyLabel={titlePropertyLabel}
                organizationId={
                  hostDatabaseOrganizationId ??
                  databaseOrganizationId ??
                  organizationId ??
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
                onSetViewGroupProperty={setViewGroupProperty}
                onSetViewType={setViewType}
                onTogglePropertyVisibility={togglePropertyVisibility}
                onUpdateDatabaseFilter={updateDatabaseFilter}
                onUpdateDatabaseSort={updateDatabaseSort}
                properties={properties}
                filterFieldOptions={filterFieldOptions}
                filterValueOptionsByField={filterValueOptionsByField}
                sortFieldOptions={sortFieldOptions}
                sourceDatabaseId={hostDatabaseId ?? undefined}
                addableSortFieldOptions={addableSortFieldOptions}
                canAddDatabaseSort={canAddDatabaseSort}
                viewConfig={activeVisibilityConfig}
                visiblePropertyCount={visiblePropertyCount}
              />
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
                title="Expand database"
                to="/database/$databaseId"
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
