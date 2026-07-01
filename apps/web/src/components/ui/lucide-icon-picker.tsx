import * as React from "react"
import { icons, Search, type LucideIcon } from "lucide-react"

import { IconColorGrid } from "@/components/ui/icon-color-grid"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { buildStoredSvgFromRenderedSvg } from "@/lib/workspace-icon-utils"

type LucideCatalogEntry = {
  Icon: LucideIcon
  label: string
  name: string
  searchText: string
}

const lucideCatalog = Object.entries(icons)
  .filter(([name]) => !name.startsWith("Lucide") && !name.endsWith("Icon"))
  .map(([name, Icon]) => {
    const label = formatLucideLabel(name)

    return {
      Icon,
      label,
      name,
      searchText: `${name.toLowerCase()} ${label.toLowerCase()}`,
    }
  })
  .sort((first, second) => first.label.localeCompare(second.label))

type LucideIconPickerProps = {
  className?: string
  onIconSelect: (svg: string) => void
}

export function LucideIconPicker({
  className,
  onIconSelect,
}: LucideIconPickerProps) {
  const [query, setQuery] = React.useState("")

  const filteredIcons = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return lucideCatalog
    }

    return lucideCatalog.filter((icon) =>
      icon.searchText.includes(normalizedQuery),
    )
  }, [query])

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
          className="h-8 w-full rounded-md border border-input bg-input/20 pr-2.5 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search icons..."
          type="search"
          value={query}
        />
      </div>
      <div className="relative flex-1 overflow-y-auto pb-2 outline-none">
        {filteredIcons.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            No icons found.
          </div>
        ) : (
          <div className="grid grid-cols-9 px-2 pt-2">
            {filteredIcons.map((icon) => (
              <LucideIconOption
                icon={icon}
                key={icon.name}
                onIconSelect={onIconSelect}
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex h-10 items-center border-t px-3 text-xs text-muted-foreground">
        Select a Lucide icon
      </div>
    </div>
  )
}

function LucideIconOption({
  icon,
  onIconSelect,
}: {
  icon: LucideCatalogEntry
  onIconSelect: (svg: string) => void
}) {
  const { Icon } = icon

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={icon.label}
          className="flex aspect-square size-8 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none data-[state=open]:bg-muted"
          title={icon.label}
          type="button"
        >
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground shadow-sm/5",
            )}
          >
            <Icon aria-hidden className="size-3.5" />
          </span>
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
          preview={<Icon aria-hidden className="size-6" />}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function formatLucideLabel(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
}
