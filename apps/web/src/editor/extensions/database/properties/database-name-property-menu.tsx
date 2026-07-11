import {
  ArrowDownUp,
  ArrowLeftToLine,
  ArrowRightToLine,
  Check,
  ChevronDown,
  FileText,
  Filter,
  GripVertical,
  Pin,
  Sparkles,
  TextWrap,
} from "lucide-react"
import type { ButtonHTMLAttributes } from "react"

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerShortcut,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useUpdateDatabase } from "@notelab/features/databases"

import {
  getDatabaseSorts,
  getMergedDatabaseConfig,
  getMergedNameColumnConfig,
  getNameColumnLabel,
  getNameColumnShowPageIcon,
  getNameColumnWrapContent,
  upsertDatabaseSort,
  type DatabaseNameColumnConfig,
  type DatabaseSortDirection,
} from "../views/database-view-config"
import { NameColumnGlyph } from "../interactions/name-column-glyph"

export function DatabaseNamePropertyMenu({
  config,
  databaseId,
  isGrouped = false,
  onOpenChange,
  onInsertProperty,
  onSort,
  onToggleGroup,
  onUpdateConfig,
  open,
  schemaActionsEnabled = true,
  triggerDragProps,
}: {
  config?: unknown
  databaseId: string
  isGrouped?: boolean
  onOpenChange?: (open: boolean) => void
  onInsertProperty: (side: "left" | "right") => void
  onSort?: (direction: DatabaseSortDirection) => void
  onToggleGroup?: () => void
  onUpdateConfig?: (config: DatabaseNameColumnConfig) => void
  open?: boolean
  schemaActionsEnabled?: boolean
  triggerDragProps?: Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onClick" | "onPointerDownCapture" | "title"
  >
}) {
  const updateDatabase = useUpdateDatabase()
  const label = getNameColumnLabel(config)
  const currentSorts = getDatabaseSorts(config)
  const currentSortDirection = currentSorts.find(
    (sort) => sort.column === "name"
  )?.direction
  const showPageIcon = getNameColumnShowPageIcon(config)
  const wrapContent = getNameColumnWrapContent(config)
  const updateNameColumnConfig = (nextConfig: DatabaseNameColumnConfig) => {
    if (onUpdateConfig) {
      onUpdateConfig(nextConfig)
      return
    }

    updateDatabase.mutate({
      config: getMergedNameColumnConfig(config, nextConfig),
      databaseId,
    })
  }
  const updateSort = (direction: DatabaseSortDirection) => {
    if (onSort) {
      onSort(direction)
      return
    }

    updateDatabase.mutate({
      config: getMergedDatabaseConfig(config, {
        sort: undefined,
        sorts: upsertDatabaseSort(currentSorts, {
          column: "name",
          direction,
        }),
      }),
      databaseId,
    })
  }

  return (
    <DropDrawer open={open} onOpenChange={onOpenChange}>
      <DropDrawerTrigger asChild>
        <button
          aria-label="Name column options"
          className="database-name-menu-trigger group flex h-8 w-full min-w-0 items-stretch gap-2 px-3 py-1 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none data-[state=open]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0"
          type="button"
          {...triggerDragProps}
        >
          <span className="self-center text-muted-foreground">
            <NameColumnGlyph />
          </span>
          <span className="flex min-w-0 items-center truncate">{label}</span>
          <ChevronDown className="ml-auto self-center opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </DropDrawerTrigger>
      <DropDrawerContent
        className="w-72"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center gap-1.5 px-1.5 py-1">
          <span className="shrink-0 text-muted-foreground">
            <NameColumnGlyph />
          </span>
          <Input
            aria-label="Name column label"
            className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm font-medium shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            defaultValue={label}
            onBlur={(event) => {
              const nextLabel = event.target.value.trim() || "Name"

              if (nextLabel !== label) {
                updateNameColumnConfig({
                  label: nextLabel === "Name" ? undefined : nextLabel,
                })
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur()
              }
            }}
          />
        </div>
        <DropDrawerSeparator />
        <DropDrawerItem
          aria-pressed={showPageIcon}
          onSelect={(event) => {
            event.preventDefault()
            updateNameColumnConfig({ showPageIcon: !showPageIcon })
          }}
        >
          <FileText />
          <span>Show page icon</span>
          <Switch
            checked={showPageIcon}
            className="ml-auto pointer-events-none"
            size="sm"
            tabIndex={-1}
          />
        </DropDrawerItem>
        <DropDrawerItem disabled>
          <Sparkles />
          <span>AI Autofill</span>
          <DropDrawerShortcut>Soon</DropDrawerShortcut>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <DropDrawerItem disabled>
          <Filter />
          <span>Filter</span>
        </DropDrawerItem>
        <DropDrawerItem
          onSelect={(event) => {
            event.preventDefault()
            onToggleGroup?.()
          }}
        >
          <GripVertical />
          <span>{isGrouped ? "Ungroup" : "Group"}</span>
        </DropDrawerItem>
        <DropDrawerSub>
          <DropDrawerSubTrigger>
            <ArrowDownUp />
            <span>Sort</span>
          </DropDrawerSubTrigger>
          <DropDrawerSubContent>
            <DropDrawerItem
              onSelect={(event) => {
                event.preventDefault()
                updateSort("ascending")
              }}
            >
              <span>Ascending</span>
              {currentSortDirection === "ascending" ? (
                <Check className="ml-auto" />
              ) : null}
            </DropDrawerItem>
            <DropDrawerItem
              onSelect={(event) => {
                event.preventDefault()
                updateSort("descending")
              }}
            >
              <span>Descending</span>
              {currentSortDirection === "descending" ? (
                <Check className="ml-auto" />
              ) : null}
            </DropDrawerItem>
          </DropDrawerSubContent>
        </DropDrawerSub>
        <DropDrawerItem disabled>
          <Pin />
          <span>Freeze</span>
        </DropDrawerItem>
        <DropDrawerItem
          aria-pressed={wrapContent}
          onSelect={(event) => {
            event.preventDefault()
            updateNameColumnConfig({ wrapContent: !wrapContent })
          }}
        >
          <TextWrap />
          <span>{wrapContent ? "Unwrap content" : "Wrap content"}</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        {schemaActionsEnabled ? (
          <>
            <DropDrawerItem onSelect={() => onInsertProperty("left")}>
              <ArrowLeftToLine />
              <span>Insert left</span>
            </DropDrawerItem>
            <DropDrawerItem onSelect={() => onInsertProperty("right")}>
              <ArrowRightToLine />
              <span>Insert right</span>
            </DropDrawerItem>
          </>
        ) : null}
      </DropDrawerContent>
    </DropDrawer>
  )
}
