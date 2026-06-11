import {
  ArrowDownUp,
  Database,
  Eye,
  EyeOff,
  FileText,
  Filter,
  GripVertical,
  Link as LinkIcon,
  Lock,
  MoreHorizontal,
  Settings2,
  Sparkles,
  Table2,
  X,
} from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
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
} from "@/components/ui/dropdrawer"
import { Input } from "@/components/ui/input"
import { useUpdateDatabaseProperty } from "@notelab/features/databases"

import { getDatabasePropertyType } from "../constants"
import {
  getMergedPropertyConfig,
  getPropertyHidden,
} from "./database-column-config"
import { DatabasePropertyEditSubmenu } from "./database-property-menu"
import { hasDatabasePropertyEditSettings } from "./database-property-edit-submenu"
import {
  DatabaseSearchableMenuItems,
  type DatabaseSearchableMenuOption,
} from "./database-searchable-menu-items"
import {
  DatabaseSortSubmenu,
  type DatabaseActiveSort,
  type DatabaseSortUpdatePatch,
} from "./database-sort-menu"
import { NameColumnGlyph } from "./name-column-glyph"

type DatabaseViewProperty = {
  id: string
  property: {
    config?: unknown
    name: string
    type: string
  }
}

function ViewSettingsRow({
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
        <span className="ml-auto shrink-0 text-muted-foreground">{right}</span>
      ) : null}
    </div>
  )
}

export function DatabaseViewSettingsMenu({
  activeDatabaseSorts,
  addableSortColumnOptions,
  canAddDatabaseSort,
  databaseId,
  databaseName,
  draftTitle,
  nameColumnLabel,
  onCopyDatabaseViewLink,
  onClearDatabaseSort,
  onCreateDatabaseSort,
  onDraftTitleChange,
  onRemoveDatabaseSort,
  onSaveDatabaseTitle,
  onUpdateDatabaseSort,
  properties,
  sortColumnOptions,
  visiblePropertyCount,
}: {
  activeDatabaseSorts: DatabaseActiveSort[]
  addableSortColumnOptions: DatabaseSearchableMenuOption[]
  canAddDatabaseSort: boolean
  databaseId?: string
  databaseName?: string
  draftTitle: string
  nameColumnLabel: string
  onCopyDatabaseViewLink: () => void
  onClearDatabaseSort: () => void
  onCreateDatabaseSort: (column: string) => void
  onDraftTitleChange: (title: string) => void
  onRemoveDatabaseSort: (index: number) => void
  onSaveDatabaseTitle: (title: string) => void
  onUpdateDatabaseSort: (index: number, patch: DatabaseSortUpdatePatch) => void
  properties: DatabaseViewProperty[]
  sortColumnOptions: DatabaseSearchableMenuOption[]
  visiblePropertyCount: number
}) {
  const [open, setOpen] = useState(false)
  const updateProperty = useUpdateDatabaseProperty()

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
  }

  const togglePropertyVisibility = (property: DatabaseViewProperty) => {
    if (!databaseId) {
      return
    }

    updateProperty.mutate({
      config: getMergedPropertyConfig(property.property.config, {
        hidden: !getPropertyHidden(property.property.config),
      }),
      databaseId,
      databasePropertyId: property.id,
    })
  }

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
            defaultValue={draftTitle}
            key={draftTitle}
            onBlur={(event) => {
              const nextTitle = event.target.value.trim()

              if (nextTitle !== draftTitle) {
                onDraftTitleChange(nextTitle)
                onSaveDatabaseTitle(nextTitle)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur()
              }
            }}
            placeholder="Untitled view"
          />
        </div>
        <DropDrawerSeparator />
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <ViewSettingsRow
              icon={<Table2 />}
              label="Layout"
              right="Table"
            />
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>
              <Table2 />
              <span>Table</span>
            </DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
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
              <span>{nameColumnLabel}</span>
              <Eye className="ml-auto text-muted-foreground" />
            </DropDrawerItem>
            {properties.map((property) => {
              const PropertyIcon = getDatabasePropertyType(property.property.type).icon
              const visible = !getPropertyHidden(property.property.config)

              return (
                <DropDrawerItem
                  aria-pressed={visible}
                  key={property.id}
                  onSelect={(event) => {
                    event.preventDefault()
                    togglePropertyVisibility(property)
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
              )
            })}
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <Filter />
            <span>Filter</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>No filters yet</DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DatabaseSortSubmenu
          activeDatabaseSorts={activeDatabaseSorts}
          addableSortColumnOptions={addableSortColumnOptions}
          canAddDatabaseSort={canAddDatabaseSort}
          onClearDatabaseSort={onClearDatabaseSort}
          onCreateDatabaseSort={onCreateDatabaseSort}
          onRemoveDatabaseSort={onRemoveDatabaseSort}
          onUpdateDatabaseSort={onUpdateDatabaseSort}
          sortColumnOptions={sortColumnOptions}
        >
          <ViewSettingsRow
            icon={<ArrowDownUp />}
            label="Sort"
            right={
              activeDatabaseSorts.length > 0 ? activeDatabaseSorts.length : undefined
            }
          />
        </DatabaseSortSubmenu>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <GripVertical />
            <span>Group</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>Grouping options</DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <FileText />
            <span>Conditional color</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>Conditional colors</DropDrawerItem>
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
                {databaseName || draftTitle}
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
                  hasDatabasePropertyEditSettings(property.property.type)
                )
                .map((property) => {
                  const PropertyIcon = getDatabasePropertyType(
                    property.property.type
                  ).icon

                  return {
                    icon: <PropertyIcon />,
                    label: property.property.name,
                    value: property.id,
                  }
                })}
              renderOption={(option) => {
                const property = properties.find(
                  (candidate) => candidate.id === option.value
                )

                if (!property || !databaseId) {
                  return (
                    <DropDrawerItem disabled>
                      {option.icon}
                      <span>{option.label}</span>
                    </DropDrawerItem>
                  )
                }

                return (
                  <DatabasePropertyEditSubmenu
                    config={property.property.config}
                    databaseId={databaseId}
                    databasePropertyId={property.id}
                    type={property.property.type}
                  >
                    {option.icon}
                    <span>{option.label}</span>
                  </DatabasePropertyEditSubmenu>
                )
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
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <Database />
            <span>Manage data sources</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem disabled>Data sources</DropDrawerItem>
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
  )
}
