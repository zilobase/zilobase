import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BotIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FileIcon,
  GripVerticalIcon,
  HistoryIcon,
  LibraryIcon,
  Layers3Icon,
  ListChecksIcon,
  Loader2Icon,
  LockIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
  UsersIcon,
} from "@/shared/components/icons"
import * as React from "react"
import { toast } from "sonner"

import { SidebarLayoutTabs } from "./sidebar-layout-tabs"
import { DatabaseViewIcon } from "@/components/database-view-icon"
import { libraryViewIcons, SidebarShortcutIcon, SidebarTabIcon } from "./sidebar-layout-icons"
import {
  getSectionLabel,
  getShortcutLabel,
  hasShortcutTarget,
  libraryViewLabels,
  moveArrayItem,
  moveLayoutEntry,
  sidebarSectionLabels,
  updateSidebarTab,
} from "../model/sidebar-layout-model"
import { Button } from "@/shared/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
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
} from "@/shared/ui/dropdrawer"
import { Input } from "@/shared/ui/input"
import { IconEmojiPicker } from "@/shared/ui/icon-emoji-picker"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/collapsible"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { Switch } from "@/shared/ui/switch"
import { cn } from "@/shared/lib/utils"
import { getDatabaseIconNode, getPageIconNode, PageIconDisplay } from "@/lib/page-icon"
import { useAppSearchResults, type AppSearchResult } from "@zilobase/features/search"
import type { Page, PageDatabase, PageDatabaseView } from "@zilobase/features/pages"
import {
  cloneSidebarWorkspaceLayout,
  libraryViewIds,
  sidebarSectionKinds,
  sidebarSectionLimits,
  sidebarSectionSorts,
  type SidebarSection,
  type SidebarSectionKind,
  type SidebarShortcut,
  type SidebarTab,
  type SidebarWorkspaceLayout,
} from "@zilobase/features/user-settings"

const sectionIcons: Record<SidebarSectionKind, typeof StarIcon> = {
  aiChats: MessageSquareIcon,
  databaseView: DatabaseIcon,
  favorites: StarIcon,
  meetings: CalendarDaysIcon,
  private: LockIcon,
  recents: HistoryIcon,
  shared: UsersIcon,
  teamspaces: Layers3Icon,
  tasks: ListChecksIcon,
}

export function SidebarCustomizePanel({
  activeTabId,
  databases,
  disabled,
  layout,
  onActiveTabChange,
  onCancel,
  onDone,
  onOpenSearch,
  pages,
  workspaceId,
}: {
  activeTabId: string
  databases: PageDatabase[]
  disabled?: boolean
  layout: SidebarWorkspaceLayout
  onActiveTabChange: (tabId: string) => void
  onCancel: () => void
  onDone: (layout: SidebarWorkspaceLayout) => Promise<void>
  onOpenSearch: () => void
  pages: Page[]
  workspaceId: string | null
}) {
  const [draft, setDraft] = React.useState(() => cloneSidebarWorkspaceLayout(layout))
  const [deleteTabDialogOpen, setDeleteTabDialogOpen] = React.useState(false)
  const baseline = React.useMemo(() => JSON.stringify(layout), [layout])
  const dirty = JSON.stringify(draft) !== baseline
  const activeTab = draft.tabs.find((tab) => tab.id === activeTabId) ?? draft.tabs[0]!
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  React.useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (deleteTabDialogOpen) return
      if (!dirty || window.confirm("Discard your sidebar changes?")) onCancel()
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [deleteTabDialogOpen, dirty, onCancel])

  const updateTab = (update: (tab: SidebarTab) => SidebarTab) => {
    setDraft((current) => updateSidebarTab(current, activeTab.id, update))
  }
  const addTab = () => {
    if (draft.tabs.length >= 8) {
      toast.info("You can create up to eight sidebar tabs.")
      return
    }
    const id = crypto.randomUUID()
    setDraft((current) => ({
      ...current,
      tabs: [...current.tabs, { icon: "circle", id, name: "New tab", sections: [], shortcuts: [] }],
    }))
    onActiveTabChange(id)
  }
  const deleteTab = () => {
    if (activeTab.id === "home") return
    setDraft((current) => ({ ...current, tabs: current.tabs.filter((tab) => tab.id !== activeTab.id) }))
    onActiveTabChange("home")
  }
  const requestDeleteTab = () => {
    if (activeTab.id === "home") return
    if (!activeTab.shortcuts.length && !activeTab.sections.length) {
      deleteTab()
      return
    }
    setDeleteTabDialogOpen(true)
  }
  const reorderTabs = (draggedTabId: string, overTabId: string) => {
    setDraft((current) => {
      const from = current.tabs.findIndex((tab) => tab.id === draggedTabId)
      const to = current.tabs.findIndex((tab) => tab.id === overTabId)
      if (from <= 0 || to <= 0 || from === to) return current
      const tabs = [...current.tabs]
      const [tab] = tabs.splice(from, 1)
      if (!tab) return current
      tabs.splice(to, 0, tab)
      return { ...current, tabs }
    })
  }
  const addShortcut = (target: SidebarShortcut["target"], label?: string) => {
    if (activeTab.shortcuts.length >= 24) {
      toast.info("This tab already has the maximum of 24 shortcuts.")
      return
    }
    if (hasShortcutTarget(activeTab, target)) {
      toast.info("That shortcut is already in this tab.")
      return
    }
    updateTab((tab) => ({
      ...tab,
      shortcuts: [...tab.shortcuts, { id: crypto.randomUUID(), ...(label ? { label } : {}), target }],
    }))
  }
  const addSection = (kind: Exclude<SidebarSectionKind, "databaseView">) => {
    if (activeTab.sections.length >= 24) {
      toast.info("This tab already has the maximum of 24 sections.")
      return
    }
    updateTab((tab) => ({
      ...tab,
      sections: [...tab.sections, { id: crypto.randomUUID(), kind, limit: 10, sort: "lastEdited" }],
    }))
  }
  const addDatabaseSection = (database: PageDatabase, viewId?: string) => {
    if (activeTab.sections.length >= 24) {
      toast.info("This tab already has the maximum of 24 sections.")
      return
    }
    updateTab((tab) => ({
      ...tab,
      sections: [...tab.sections, {
        databaseId: database.id,
        id: crypto.randomUUID(),
        kind: "databaseView",
        label: database.name.trim() || "Untitled database",
        limit: 10,
        showPageIcon: true,
        ...(viewId ? { viewId } : {}),
      }],
    }))
  }
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const dragged = parseSortableEntryId(active.id)
    const target = parseSortableEntryId(over.id)
    if (!dragged || !target || dragged.type !== target.type) return
    const key = dragged.type
    const from = activeTab[key].findIndex((item) => item.id === dragged.id)
    const to = activeTab[key].findIndex((item) => item.id === target.id)
    if (from < 0 || to < 0) return
    updateTab((tab) => {
      const next = [...tab[key]]
      const [item] = next.splice(from, 1)
      if (item) next.splice(to, 0, item)
      return { ...tab, [key]: next }
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sidebar">
      <SidebarLayoutTabs
        activeTabId={activeTab.id}
        activeTabSettings={(
          <TabSettingsEditor
            onDelete={requestDeleteTab}
            onIconChange={(icon) => updateTab((tab) => ({ ...tab, icon }))}
            onNameChange={(name) => updateTab((tab) => ({ ...tab, name }))}
            tab={activeTab}
          />
        )}
        editing
        onAddTab={addTab}
        onOpenSearch={onOpenSearch}
        onReorderTab={reorderTabs}
        onSelectTab={onActiveTabChange}
        tabs={draft.tabs}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-4 pt-3">
        <AddShortcutMenu databases={databases} onAdd={addShortcut} pages={pages} workspaceId={workspaceId} />
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
          <SortableContext items={activeTab.shortcuts.map((shortcut) => `shortcuts:${shortcut.id}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5 py-1">
              {activeTab.shortcuts.map((shortcut, index) => (
              <EditableRow id={`shortcuts:${shortcut.id}`} key={shortcut.id}>
                <span className="text-muted-foreground"><SidebarShortcutIcon shortcut={shortcut} /></span>
                <span className="min-w-0 flex-1 truncate">{resolveShortcutLabel(shortcut, pages, databases)}</span>
                <EntryMenu
                  index={index}
                  itemId={shortcut.id}
                  itemType="shortcuts"
                  label={shortcut.label ?? ""}
                  layout={draft}
                  onChange={setDraft}
                  onIconChange={(icon) => setDraft((current) => updateSidebarTab(current, activeTab.id, (tab) => ({
                    ...tab,
                    shortcuts: tab.shortcuts.map((entry) => entry.id === shortcut.id
                      ? { ...entry, icon }
                      : entry),
                  })))}
                  onRename={(label) => setDraft((current) => updateSidebarTab(current, activeTab.id, (tab) => ({
                    ...tab,
                    shortcuts: tab.shortcuts.map((entry) => entry.id === shortcut.id
                      ? { ...entry, label: label.trim() ? label : undefined }
                      : entry),
                  })))}
                  placeholder={resolveShortcutLabel(shortcut, pages, databases)}
                  shortcut={shortcut}
                  sourceTabId={activeTab.id}
                />
              </EditableRow>
              ))}
            </div>
          </SortableContext>

          <div className="my-2 h-px bg-border" />
          <AddSectionMenu databases={databases} onAdd={addSection} onAddDatabase={addDatabaseSection} workspaceId={workspaceId} />
          <SortableContext items={activeTab.sections.map((section) => `sections:${section.id}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5 py-1">
              {activeTab.sections.map((section, index) => {
              const Icon = sectionIcons[section.kind]
              return (
                <EditableRow id={`sections:${section.id}`} key={section.id}>
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{getSectionLabel(section)}</span>
                  <SectionSettings
                    databases={databases}
                    index={index}
                    layout={draft}
                    onChange={setDraft}
                    section={section}
                    sourceTabId={activeTab.id}
                  />
                </EditableRow>
              )
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      <div className="border-t border-border bg-sidebar p-3">
        <Button className="w-full" disabled={disabled} onClick={() => void onDone(draft).catch((error) => toast.error(error instanceof Error ? error.message : "Could not save sidebar preferences."))}>
          {disabled ? "Saving…" : "Done"}
        </Button>
      </div>
      <AlertDialog onOpenChange={setDeleteTabDialogOpen} open={deleteTabDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{activeTab.name || "Untitled tab"}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the tab and its sidebar layout. Your pages, databases,
              meetings, chats, and other content will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTab} variant="destructive">
              Delete tab
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function parseSortableEntryId(value: string | number): {
  id: string
  type: "sections" | "shortcuts"
} | null {
  const serialized = String(value)
  const separator = serialized.indexOf(":")
  if (separator < 0) return null
  const type = serialized.slice(0, separator)
  if (type !== "sections" && type !== "shortcuts") return null
  return {
    id: serialized.slice(separator + 1),
    type: type as "sections" | "shortcuts",
  }
}

function EditableRow({ children, id }: { children: React.ReactNode; id: string }) {
  const sortable = useSortable({
    animateLayoutChanges: ({ isSorting }) => isSorting,
    id,
  })
  const [menuOpen, setMenuOpen] = React.useState(false)
  return (
    <div
      {...sortable.attributes}
      {...sortable.listeners}
      className="group/editor-row relative cursor-grab touch-none active:cursor-grabbing"
      ref={sortable.setNodeRef}
      style={{
        transform: sortable.transform ? `translate3d(0, ${sortable.transform.y}px, 0)` : undefined,
        transition: sortable.transition,
      }}
    >
      <div className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md p-2 pr-8 text-left text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
        (sortable.isDragging || sortable.isOver || menuOpen) && "bg-accent text-accent-foreground",
      )}>
        <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4!">
          <GripVerticalIcon />
        </span>
        <EditableRowMenuContext.Provider value={setMenuOpen}>{children}</EditableRowMenuContext.Provider>
      </div>
    </div>
  )
}

const EditableRowMenuContext = React.createContext<(open: boolean) => void>(() => undefined)

const sidebarEditorButtonClassName =
  "flex h-8 w-full items-center gap-2 rounded-md p-2 text-left text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring active:bg-active active:text-active-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"

const sidebarEditorActionClassName =
  "absolute right-1 top-1.5 inline-flex size-5 shrink-0 cursor-default items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-colors group-hover/editor-row:opacity-100 hover:bg-sidebar-control-hover focus-visible:bg-sidebar-control-hover focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-sidebar-control-hover data-[state=open]:opacity-100 [&_svg]:size-4!"

function AddShortcutMenu({ databases, onAdd, pages, workspaceId }: { databases: PageDatabase[]; onAdd: (target: SidebarShortcut["target"], label?: string) => void; pages: Page[]; workspaceId: string | null }) {
  return (
    <DropDrawer>
      <DropDrawerTrigger asChild><button className={sidebarEditorButtonClassName} type="button"><PlusIcon className="size-4" />Add shortcut</button></DropDrawerTrigger>
      <DropDrawerContent align="start" className="w-72">
        <DropDrawerLabel>Create</DropDrawerLabel>
        <DropDrawerItem onSelect={() => onAdd({ action: "createPage", type: "action" })}><FileIcon />New page</DropDrawerItem>
        <DropDrawerItem onSelect={() => onAdd({ action: "createDatabase", type: "action" })}><DatabaseIcon />New database</DropDrawerItem>
        <DropDrawerItem onSelect={() => onAdd({ action: "createChat", type: "action" })}><BotIcon />New AI chat</DropDrawerItem>
        <DropDrawerSeparator />
        <DropDrawerLabel>Go to</DropDrawerLabel>
        <DropDrawerItem onSelect={() => onAdd({ route: "ai", type: "route" })}><SparklesIcon />Ask AI</DropDrawerItem>
        <DropDrawerItem onSelect={() => onAdd({ route: "tasks", type: "route" })}><ListChecksIcon />Tasks</DropDrawerItem>
        <DropDrawerSub title="Library views"><DropDrawerSubTrigger><LibraryIcon />Library views</DropDrawerSubTrigger><DropDrawerSubContent className="w-56">{libraryViewIds.map((view) => { const Icon = libraryViewIcons[view]; return <DropDrawerItem key={view} onSelect={() => onAdd({ type: "library", view })}><Icon />{libraryViewLabels[view]}</DropDrawerItem> })}</DropDrawerSubContent></DropDrawerSub>
        <DropDrawerSub title="Pages"><DropDrawerSubTrigger><FileIcon />Page</DropDrawerSubTrigger><DropDrawerSubContent className="w-72 overflow-hidden p-0"><PageShortcutPicker onSelect={(pageId, label) => onAdd({ pageId, type: "page" }, label)} pages={pages} workspaceId={workspaceId} /></DropDrawerSubContent></DropDrawerSub>
        <DropDrawerSub title="Databases"><DropDrawerSubTrigger><DatabaseIcon />Database or view</DropDrawerSubTrigger><DropDrawerSubContent className="w-72 overflow-hidden p-0"><DatabasePicker databases={databases} onSelect={(database, view) => onAdd({ databaseId: database.id, type: "database", ...(view ? { viewId: view.id } : {}) }, view?.name.trim() || database.name.trim() || "Untitled database")} workspaceId={workspaceId} /></DropDrawerSubContent></DropDrawerSub>
        <DropDrawerItem onSelect={() => onAdd({ route: "trash", type: "route" })}><Trash2Icon />Trash</DropDrawerItem>
        <DropDrawerItem onSelect={() => onAdd({ route: "settings", type: "route" })}><SettingsIcon />Settings</DropDrawerItem>
      </DropDrawerContent>
    </DropDrawer>
  )
}

function AddSectionMenu({ databases, onAdd, onAddDatabase, workspaceId }: { databases: PageDatabase[]; onAdd: (kind: Exclude<SidebarSectionKind, "databaseView">) => void; onAddDatabase: (database: PageDatabase, viewId?: string) => void; workspaceId: string | null }) {
  return (
    <DropDrawer>
      <DropDrawerTrigger asChild><button className={sidebarEditorButtonClassName} type="button"><PlusIcon className="size-4" />Add section</button></DropDrawerTrigger>
      <DropDrawerContent align="start" className="w-72">
        <DropDrawerLabel>Sections</DropDrawerLabel>
        {sidebarSectionKinds.filter((kind) => kind !== "databaseView").map((kind) => { const Icon = sectionIcons[kind]; return <DropDrawerItem key={kind} onSelect={() => onAdd(kind)}><Icon />{sidebarSectionLabels[kind]}</DropDrawerItem> })}
        <DropDrawerSub title="Database view"><DropDrawerSubTrigger><DatabaseIcon />Database view</DropDrawerSubTrigger><DropDrawerSubContent className="w-72 overflow-hidden p-0"><DatabasePicker databases={databases} onSelect={(database, view) => onAddDatabase(database, view?.id)} workspaceId={workspaceId} /></DropDrawerSubContent></DropDrawerSub>
      </DropDrawerContent>
    </DropDrawer>
  )
}

function EntryMenu({ index, itemId, itemType, label, layout, onChange, onIconChange, onRename, placeholder, shortcut, sourceTabId }: { index: number; itemId: string; itemType: "sections" | "shortcuts"; label?: string; layout: SidebarWorkspaceLayout; onChange: React.Dispatch<React.SetStateAction<SidebarWorkspaceLayout>>; onIconChange?: (icon: string) => void; onRename?: (label: string) => void; placeholder?: string; shortcut?: SidebarShortcut; sourceTabId: string }) {
  const tab = layout.tabs.find((entry) => entry.id === sourceTabId)!
  const setRowMenuOpen = React.useContext(EditableRowMenuContext)
  const [iconPickerOpen, setIconPickerOpen] = React.useState(false)
  return (
    <DropDrawer defaultSubDisplayMode="inline" onOpenChange={setRowMenuOpen}>
      <DropDrawerTrigger asChild><button aria-label="Item options" className={sidebarEditorActionClassName} data-sidebar-customize-action onPointerDown={(event) => event.stopPropagation()} type="button"><MoreHorizontalIcon /></button></DropDrawerTrigger>
      <DropDrawerContent align="start" className="w-56" side="right">
        {onRename && onIconChange && shortcut ? <div className="flex items-center gap-2 p-2"><Popover onOpenChange={setIconPickerOpen} open={iconPickerOpen}><PopoverTrigger asChild><button aria-label="Change shortcut icon" className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" type="button"><SidebarShortcutIcon shortcut={shortcut} /></button></PopoverTrigger><PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0" side="right" sideOffset={6}><IconEmojiPicker allowUpload={false} onEmojiSelect={(icon) => { onIconChange(icon); setIconPickerOpen(false) }} onIconSelect={(icon) => { onIconChange(icon); setIconPickerOpen(false) }} /></PopoverContent></Popover><Input aria-label="Shortcut name" className="h-8 min-w-0 flex-1" maxLength={40} onChange={(event) => onRename(event.target.value)} placeholder={placeholder} value={label ?? ""} /></div> : null}
        <DropDrawerItem disabled={index === 0} onSelect={() => onChange((current) => updateSidebarTab(current, sourceTabId, (entry) => itemType === "sections" ? { ...entry, sections: moveArrayItem(entry.sections, index, -1) } : { ...entry, shortcuts: moveArrayItem(entry.shortcuts, index, -1) }))}><ArrowUpIcon />Move up</DropDrawerItem>
        <DropDrawerItem disabled={index === tab[itemType].length - 1} onSelect={() => onChange((current) => updateSidebarTab(current, sourceTabId, (entry) => itemType === "sections" ? { ...entry, sections: moveArrayItem(entry.sections, index, 1) } : { ...entry, shortcuts: moveArrayItem(entry.shortcuts, index, 1) }))}><ArrowDownIcon />Move down</DropDrawerItem>
        <DropDrawerSub title="Move to tab"><DropDrawerSubTrigger><ArrowRightIcon />Move to tab</DropDrawerSubTrigger><DropDrawerSubContent className="w-48">{layout.tabs.filter((entry) => entry.id !== sourceTabId).map((entry) => <DropDrawerItem key={entry.id} onSelect={() => onChange((current) => moveLayoutEntry(current, sourceTabId, entry.id, itemType, itemId))}>{entry.name}</DropDrawerItem>)}</DropDrawerSubContent></DropDrawerSub>
        <DropDrawerSeparator />
        <DropDrawerItem variant="destructive" onSelect={() => onChange((current) => updateSidebarTab(current, sourceTabId, (entry) => itemType === "sections" ? { ...entry, sections: entry.sections.filter((item) => item.id !== itemId) } : { ...entry, shortcuts: entry.shortcuts.filter((item) => item.id !== itemId) }))}><Trash2Icon />Remove</DropDrawerItem>
      </DropDrawerContent>
    </DropDrawer>
  )
}

function SectionSettings({ databases, index, layout, onChange, section, sourceTabId }: { databases: PageDatabase[]; index: number; layout: SidebarWorkspaceLayout; onChange: React.Dispatch<React.SetStateAction<SidebarWorkspaceLayout>>; section: SidebarSection; sourceTabId: string }) {
  const patchSection = (patch: Partial<SidebarSection>) => onChange((current) => updateSidebarTab(current, sourceTabId, (tab) => ({ ...tab, sections: tab.sections.map((entry) => entry.id === section.id ? { ...entry, ...patch } as SidebarSection : entry) })))
  const tab = layout.tabs.find((entry) => entry.id === sourceTabId)!
  const setRowMenuOpen = React.useContext(EditableRowMenuContext)
  return (
    <DropDrawer defaultSubDisplayMode="inline" onOpenChange={setRowMenuOpen}>
      <DropDrawerTrigger asChild><button aria-label={`${getSectionLabel(section)} settings`} className={sidebarEditorActionClassName} data-sidebar-customize-action onPointerDown={(event) => event.stopPropagation()} type="button"><MoreHorizontalIcon /></button></DropDrawerTrigger>
      <DropDrawerContent align="start" className="w-64" side="right">
        <div className="p-2"><Input aria-label="Section name" className="h-8" maxLength={40} onChange={(event) => patchSection({ label: event.target.value })} placeholder={sidebarSectionLabels[section.kind]} value={section.label ?? ""} /></div>
        {section.kind === "databaseView" ? <DatabaseSourceMenu databases={databases} onChange={patchSection} section={section} /> : null}
        {section.kind !== "databaseView" ? <DropDrawerSub title="Sort"><DropDrawerSubTrigger><HistoryIcon />Sort<span className="ml-auto text-xs text-muted-foreground">{section.sort === "alphabetical" ? "A–Z" : "Recent"}</span></DropDrawerSubTrigger><DropDrawerSubContent className="w-44">{sidebarSectionSorts.map((sort) => <DropDrawerItem key={sort} onSelect={() => patchSection({ sort })}>{section.sort === sort ? <CheckIcon /> : null}{sort === "alphabetical" ? "Alphabetical" : "Last edited"}</DropDrawerItem>)}</DropDrawerSubContent></DropDrawerSub> : null}
        <DropDrawerSub title="Show"><DropDrawerSubTrigger><ListChecksIcon />Show<span className="ml-auto text-xs text-muted-foreground">{section.limit}</span></DropDrawerSubTrigger><DropDrawerSubContent className="w-36">{sidebarSectionLimits.map((limit) => <DropDrawerItem key={limit} onSelect={() => patchSection({ limit })}>{section.limit === limit ? <CheckIcon /> : null}{limit} items</DropDrawerItem>)}</DropDrawerSubContent></DropDrawerSub>
        {section.kind === "databaseView" ? <div className="flex min-h-9 items-center gap-2 px-2 text-sm"><FileIcon className="size-4 text-muted-foreground" /><span className="flex-1">Show page icon</span><Switch checked={section.showPageIcon} onCheckedChange={(showPageIcon) => patchSection({ showPageIcon })} /></div> : null}
        <DropDrawerSeparator />
        <DropDrawerItem disabled={index === 0} onSelect={() => onChange((current) => updateSidebarTab(current, sourceTabId, (entry) => ({ ...entry, sections: moveArrayItem(entry.sections, index, -1) })))}><ArrowUpIcon />Move up</DropDrawerItem>
        <DropDrawerItem disabled={index === tab.sections.length - 1} onSelect={() => onChange((current) => updateSidebarTab(current, sourceTabId, (entry) => ({ ...entry, sections: moveArrayItem(entry.sections, index, 1) })))}><ArrowDownIcon />Move down</DropDrawerItem>
        <DropDrawerSub title="Move to tab"><DropDrawerSubTrigger><ArrowRightIcon />Move to tab</DropDrawerSubTrigger><DropDrawerSubContent className="w-48">{layout.tabs.filter((entry) => entry.id !== sourceTabId).map((entry) => <DropDrawerItem key={entry.id} onSelect={() => onChange((current) => moveLayoutEntry(current, sourceTabId, entry.id, "sections", section.id))}>{entry.name}</DropDrawerItem>)}</DropDrawerSubContent></DropDrawerSub>
        <DropDrawerSeparator />
        <DropDrawerItem variant="destructive" onSelect={() => onChange((current) => updateSidebarTab(current, sourceTabId, (entry) => ({ ...entry, sections: entry.sections.filter((item) => item.id !== section.id) })))}><Trash2Icon />Remove section</DropDrawerItem>
      </DropDrawerContent>
    </DropDrawer>
  )
}

function DatabaseSourceMenu({ databases, onChange, section }: { databases: PageDatabase[]; onChange: (patch: Partial<SidebarSection>) => void; section: Extract<SidebarSection, { kind: "databaseView" }> }) {
  const database = databases.find((entry) => entry.id === section.databaseId)
  return <><DropDrawerSub title="Source"><DropDrawerSubTrigger><DatabaseIcon />Source<span className="ml-auto max-w-24 truncate text-xs text-muted-foreground">{database?.name ?? "Unavailable"}</span></DropDrawerSubTrigger><DropDrawerSubContent className="w-64">{databases.map((entry) => <DropDrawerItem key={entry.id} onSelect={() => onChange({ databaseId: entry.id, viewId: entry.views[0]?.id })}>{entry.id === section.databaseId ? <CheckIcon /> : null}{entry.name || "Untitled database"}</DropDrawerItem>)}</DropDrawerSubContent></DropDrawerSub>{database ? <DropDrawerSub title="View"><DropDrawerSubTrigger><ListChecksIcon />View<span className="ml-auto max-w-24 truncate text-xs text-muted-foreground">{database.views.find((view) => view.id === section.viewId)?.name ?? "Default"}</span></DropDrawerSubTrigger><DropDrawerSubContent className="w-64">{database.views.map((view) => <DropDrawerItem key={view.id} onSelect={() => onChange({ viewId: view.id })}>{view.id === section.viewId ? <CheckIcon /> : null}{view.name || "Untitled view"}</DropDrawerItem>)}</DropDrawerSubContent></DropDrawerSub> : null}</>
}

function TabSettingsEditor({ onDelete, onIconChange, onNameChange, tab }: { onDelete: () => void; onIconChange: (icon: string) => void; onNameChange: (name: string) => void; tab: SidebarTab }) {
  const editable = tab.id !== "home"
  const [iconPickerOpen, setIconPickerOpen] = React.useState(false)
  return <div className="bg-popover text-popover-foreground"><div className="flex items-center gap-2 p-2"><Popover onOpenChange={setIconPickerOpen} open={iconPickerOpen}><PopoverTrigger asChild><button aria-label="Change tab icon" className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50" disabled={!editable} type="button"><SidebarTabIcon value={tab.icon} /></button></PopoverTrigger><PopoverContent align="start" className="w-auto gap-0 overflow-hidden p-0" side="right" sideOffset={6}><IconEmojiPicker allowUpload={false} onEmojiSelect={(icon) => { onIconChange(icon); setIconPickerOpen(false) }} onIconSelect={(icon) => { onIconChange(icon); setIconPickerOpen(false) }} /></PopoverContent></Popover><Input aria-label="Tab name" className="h-8 min-w-0 flex-1 text-sm font-medium" disabled={!editable} maxLength={40} onChange={(event) => onNameChange(event.target.value)} placeholder="Untitled tab" value={tab.name} /></div>{editable ? <div className="border-t border-border p-1"><button className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-destructive hover:bg-status-danger-diff-surface" onClick={onDelete} type="button"><Trash2Icon className="size-4" />Delete tab</button></div> : <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Home is the fixed default tab.</p>}</div>
}

function resolveShortcutLabel(shortcut: SidebarShortcut, pages: Page[], databases: PageDatabase[]) {
  if (shortcut.label) return shortcut.label
  const target = shortcut.target
  if (target.type === "page") return pages.find((page) => page.id === target.pageId)?.name || "Unavailable page"
  if (target.type === "database") return databases.find((database) => database.id === target.databaseId)?.name || "Unavailable database"
  return getShortcutLabel(shortcut)
}

function PageShortcutPicker({ onSelect, pages, workspaceId }: { onSelect: (pageId: string, label: string) => void; pages: Page[]; workspaceId: string | null }) {
  const [query, setQuery] = React.useState("")
  const debouncedQuery = useDebouncedValue(query.trim(), 250)
  const hasQuery = Boolean(query.trim())
  const searchSettled = query.trim() === debouncedQuery
  const { data: results = [], isFetching } = useAppSearchResults(
    workspaceId,
    debouncedQuery,
    hasQuery && searchSettled,
    ["page"],
  )
  const pagesById = React.useMemo(
    () => new Map(pages.map((page) => [page.id, page])),
    [pages],
  )
  const displayedPages = hasQuery
    ? searchSettled
      ? results
      : []
    : pages.slice(0, 50)

  return (
    <PickerPanel
      ariaLabel="Search pages"
      emptyLabel="No pages found"
      isSearching={hasQuery && (!searchSettled || isFetching)}
      onQueryChange={setQuery}
      query={query}
    >
      {displayedPages.map((entry) => {
        const result = isAppSearchResult(entry) ? entry : null
        const page = result ? pagesById.get(result.id) : entry as Page
        const id = result?.id ?? page?.id ?? ""
        const label = (result?.title ?? page?.name ?? "").trim() || "Untitled"
        return (
          <DropDrawerItem key={id} onSelect={() => onSelect(id, label)}>
            {page
              ? getPageIconNode(page)
              : result?.emoji
                ? <PageIconDisplay size="sm" value={result.emoji} />
                : <FileIcon className="text-muted-foreground" />}
            <span className="truncate">{label}</span>
          </DropDrawerItem>
        )
      })}
    </PickerPanel>
  )
}

function DatabasePicker({ databases, onSelect, workspaceId }: { databases: PageDatabase[]; onSelect: (database: PageDatabase, view?: PageDatabaseView) => void; workspaceId: string | null }) {
  const [query, setQuery] = React.useState("")
  const debouncedQuery = useDebouncedValue(query.trim(), 250)
  const hasQuery = Boolean(query.trim())
  const searchSettled = query.trim() === debouncedQuery
  const { data: results = [], isFetching } = useAppSearchResults(
    workspaceId,
    debouncedQuery,
    hasQuery && searchSettled,
    ["database"],
  )
  const databasesById = React.useMemo(
    () => new Map(databases.map((database) => [database.id, database])),
    [databases],
  )
  const displayedDatabases = hasQuery
    ? searchSettled
      ? results.flatMap((result) => {
          const database = databasesById.get(result.id)
          return database ? [database] : []
        })
      : []
    : databases.slice(0, 50)

  return (
    <PickerPanel
      ariaLabel="Search databases and views"
      emptyLabel="No databases found"
      isSearching={hasQuery && (!searchSettled || isFetching)}
      onQueryChange={setQuery}
      query={query}
    >
      {displayedDatabases.map((database) => (
        <DatabasePickerRow database={database} defaultOpen={hasQuery} key={`${debouncedQuery}:${database.id}`} onSelect={onSelect} />
      ))}
    </PickerPanel>
  )
}

function DatabasePickerRow({ database, defaultOpen, onSelect }: { database: PageDatabase; defaultOpen: boolean; onSelect: (database: PageDatabase, view?: PageDatabaseView) => void }) {
  const [open, setOpen] = React.useState(defaultOpen)
  const hasViews = database.views.length > 0
  const label = database.name.trim() || "Untitled database"

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <div className="group/database-picker-row relative">
        <DropDrawerItem className={hasViews ? "pl-8" : undefined} onSelect={() => onSelect(database)}>
          {getDatabaseIconNode(database) ?? <DatabaseIcon className="text-muted-foreground" />}
          <span className="truncate">{label}</span>
        </DropDrawerItem>
        {hasViews ? (
          <CollapsibleTrigger asChild>
            <button
              aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
              className="absolute left-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              <ChevronRightIcon className={cn("transition-transform", open && "rotate-90")} />
            </button>
          </CollapsibleTrigger>
        ) : null}
      </div>
      {hasViews ? (
        <CollapsibleContent className="pl-3">
          {database.views.map((view) => (
            <DropDrawerItem inset key={view.id} onSelect={() => onSelect(database, view)}>
              <DatabaseViewPickerIcon view={view} />
              <span className="truncate">{view.name.trim() || "Untitled view"}</span>
            </DropDrawerItem>
          ))}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  )
}

function DatabaseViewPickerIcon({ view }: { view: PageDatabaseView }) {
  return <DatabaseViewIcon className="text-muted-foreground" view={view} />
}

function PickerPanel({ ariaLabel, children, emptyLabel, isSearching, onQueryChange, query }: { ariaLabel: string; children: React.ReactNode; emptyLabel: string; isSearching: boolean; onQueryChange: (query: string) => void; query: string }) {
  const hasChildren = React.Children.count(children) > 0
  return (
    <div className="flex min-h-0 flex-col">
      <div className="sticky top-0 z-10 shrink-0 bg-popover p-2">
        <div className="relative">
          <Input aria-label={ariaLabel} className="h-8 pr-8" onChange={(event) => onQueryChange(event.target.value)} onKeyDown={(event) => event.stopPropagation()} placeholder="Search…" value={query} />
          {isSearching ? <Loader2Icon className="absolute right-2 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
        </div>
      </div>
      <div className="max-h-[min(28rem,calc(100vh-8rem))] min-h-0 overflow-y-auto overscroll-contain px-1 pb-1">
        {hasChildren ? children : <p className="px-2 py-3 text-xs text-muted-foreground">{isSearching ? "Searching…" : emptyLabel}</p>}
      </div>
    </div>
  )
}

function isAppSearchResult(value: AppSearchResult | Page): value is AppSearchResult {
  return "title" in value
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = React.useState(value)
  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delay)
    return () => window.clearTimeout(timeoutId)
  }, [delay, value])
  return debouncedValue
}
