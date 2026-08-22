import * as React from "react"
import { Search } from "lucide-react"
import type { IconComponent } from "reicon-react"

import { IconColorGrid } from "@/components/ui/icon-color-grid"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { buildStoredSvgFromRenderedSvg } from "@/lib/page-icon-utils"

type ReiconCatalogEntry = {
  Icon: React.LazyExoticComponent<IconComponent>
  label: string
  name: string
  searchText: string
}

const iconModules = import.meta.glob<{ default: IconComponent }>(
  "../../../../../node_modules/reicon-react/icons/*.js",
)

const reiconCatalog = Object.entries(iconModules)
  .map(([path, loadIcon]) => {
    const name = path.slice(path.lastIndexOf("/") + 1, -3)
    const label = formatReiconLabel(name)
    const Icon = React.lazy(loadIcon)

    return {
      Icon,
      label,
      name,
      searchText: `${name.toLowerCase()} ${label.toLowerCase()}`,
    }
  })
  .sort((first, second) => first.label.localeCompare(second.label))

type ReiconIconPickerProps = {
  className?: string
  onIconSelect: (svg: string) => void
}

const ICON_BATCH_SIZE = 72

export function ReiconIconPicker({
  className,
  onIconSelect,
}: ReiconIconPickerProps) {
  const [query, setQuery] = React.useState("")
  const [visibleCount, setVisibleCount] = React.useState(ICON_BATCH_SIZE)

  const filteredIcons = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return reiconCatalog
    }

    return reiconCatalog.filter((icon) =>
      icon.searchText.includes(normalizedQuery),
    )
  }, [query])

  React.useEffect(() => {
    setVisibleCount(ICON_BATCH_SIZE)
  }, [query])

  const visibleIcons = filteredIcons.slice(0, visibleCount)

  return (
    <div
      className={cn(
        "isolate flex h-[342px] w-72 flex-col bg-popover text-popover-foreground",
        className,
      )}
    >
      <div className="relative mx-2 mt-2">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          className="h-8 w-full rounded-md border border-input bg-input pr-2.5 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring dark:bg-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search icons..."
          type="search"
          value={query}
        />
      </div>
      <div
        className="relative flex-1 overflow-y-auto pb-2 outline-none"
        onScroll={(event) => {
          const element = event.currentTarget

          if (
            element.scrollHeight - element.scrollTop - element.clientHeight < 96 &&
            visibleCount < filteredIcons.length
          ) {
            setVisibleCount((count) =>
              Math.min(count + ICON_BATCH_SIZE, filteredIcons.length),
            )
          }
        }}
      >
        {filteredIcons.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No icons found.
          </div>
        ) : (
          <div className="grid grid-cols-9 px-2 pt-2">
            {visibleIcons.map((icon) => (
              <ReiconIconOption
                icon={icon}
                key={icon.name}
                onIconSelect={onIconSelect}
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex h-10 items-center border-t px-3 text-xs text-muted-foreground">
        Select a Reicon icon
      </div>
    </div>
  )
}

function ReiconIconOption({
  icon,
  onIconSelect,
}: {
  icon: ReiconCatalogEntry
  onIconSelect: (svg: string) => void
}) {
  const { Icon } = icon

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={icon.label}
          className="flex aspect-square size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-muted"
          title={icon.label}
          type="button"
        >
          <React.Suspense fallback={<span className="size-5" />}>
            <Icon aria-hidden className="size-5" weight="Filled" />
          </React.Suspense>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-auto min-w-0 p-2"
        side="right"
        sideOffset={6}
      >
        <IconColorGrid
          label={icon.label}
          onSelect={(colorValue, svgElement) => {
            if (!svgElement) {
              return
            }

            const storedSvg = buildStoredSvgFromRenderedSvg({
              color: colorValue,
              svg: svgElement.outerHTML,
            })

            if (storedSvg) {
              onIconSelect(storedSvg)
            }
          }}
          preview={
            <React.Suspense fallback={<span className="size-5" />}>
              <Icon aria-hidden weight="Filled" />
            </React.Suspense>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function formatReiconLabel(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/(\D)(\d+)/g, "$1 $2")
    .trim()
}
