import {
  ArrowDownUp,
  Database,
  Eye,
  FileText,
  Filter,
  GripVertical,
  HelpCircle,
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

import { getDatabasePropertyType } from "../constants"
import { type DatabaseSortDirection } from "./database-column-config"
import { NameColumnGlyph } from "./name-column-glyph"

type DatabaseViewProperty = {
  id: string
  property: {
    name: string
    type: string
  }
}

type ActiveDatabaseSort = {
  column: string
  direction: DatabaseSortDirection
  label: string
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
  databaseName,
  draftTitle,
  nameColumnLabel,
  onCopyDatabaseViewLink,
  onDraftTitleChange,
  onSaveDatabaseTitle,
  properties,
  visiblePropertyCount,
}: {
  activeDatabaseSorts: ActiveDatabaseSort[]
  databaseName?: string
  draftTitle: string
  nameColumnLabel: string
  onCopyDatabaseViewLink: () => void
  onDraftTitleChange: (title: string) => void
  onSaveDatabaseTitle: (title: string) => void
  properties: DatabaseViewProperty[]
  visiblePropertyCount: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <DropDrawer open={open} onOpenChange={setOpen}>
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
        <div className="px-2 py-1">
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-2 shadow-sm">
            <Table2 className="size-4 shrink-0 text-muted-foreground" />
            <Input
              aria-label="View name"
              className="h-auto border-0 bg-transparent px-0 py-0 text-sm font-semibold shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
              onBlur={(event) => onSaveDatabaseTitle(event.target.value)}
              onChange={(event) => onDraftTitleChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur()
                }
              }}
              placeholder="Untitled view"
              value={draftTitle}
            />
            <button
              aria-label="View settings info"
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              type="button"
            >
              <HelpCircle className="size-4" />
            </button>
          </div>
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
            </DropDrawerItem>
            {properties.map((property) => {
              const PropertyIcon = getDatabasePropertyType(property.property.type).icon

              return (
                <DropDrawerItem disabled key={property.id}>
                  <PropertyIcon />
                  <span>{property.property.name}</span>
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
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <ViewSettingsRow
              icon={<ArrowDownUp />}
              label="Sort"
              right={
                activeDatabaseSorts.length > 0 ? activeDatabaseSorts.length : undefined
              }
            />
          </DropDrawerSubTrigger>
          <DropDrawerSubContent className="w-72">
            {activeDatabaseSorts.length > 0 ? (
              activeDatabaseSorts.map((sort, index) => (
                <DropDrawerItem disabled key={`${sort.column}:${index}`}>
                  <ViewSettingsRow
                    icon={<ArrowDownUp />}
                    label={sort.label}
                    right={sort.direction}
                  />
                </DropDrawerItem>
              ))
            ) : (
              <DropDrawerItem disabled>No active sorts</DropDrawerItem>
            )}
          </DropDrawerSubContent>
        </DropDrawerSub>
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
            {properties.length > 0 ? (
              properties.map((property) => {
                const PropertyIcon = getDatabasePropertyType(property.property.type).icon

                return (
                  <DropDrawerItem disabled key={property.id}>
                    <PropertyIcon />
                    <span>{property.property.name}</span>
                  </DropDrawerItem>
                )
              })
            ) : (
              <DropDrawerItem disabled>No properties yet</DropDrawerItem>
            )}
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
