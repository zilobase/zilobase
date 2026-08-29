import * as React from "react"
import type { Icon } from "@/shared/components/icons"
import { Search } from "@/shared/components/icons"

import { IconColorGrid } from "@/shared/ui/icon-color-grid"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { cn } from "@/shared/lib/utils"
import { buildStoredSvgFromRenderedSvg } from "@/shared/lib/page-icon-utils"

export type PhosphorPickerWeight = "bold" | "fill"

type PhosphorCatalogEntry = {
  Icon: React.LazyExoticComponent<Icon>
  label: string
  name: string
  searchText: string
}

type PhosphorIconModule = Record<string, Icon>

const iconModules = import.meta.glob<PhosphorIconModule>(
  "../../../../../node_modules/@phosphor-icons/react/dist/csr/*.es.js",
)

const phosphorCatalog = Object.entries(iconModules)
  .map(([path, loadIcon]) => {
    const name = path.slice(path.lastIndexOf("/") + 1, -6)
    const label = formatPhosphorLabel(name)
    const Icon = React.lazy(async () => {
      const module = await loadIcon()
      const component = module[`${name}Icon`] ?? module[name]

      if (!component) {
        throw new Error(`Phosphor icon module did not export ${name}`)
      }

      return { default: component }
    })

    return {
      Icon,
      label,
      name,
      searchText: `${name.toLowerCase()} ${label.toLowerCase()}`,
    }
  })
  .sort((first, second) => first.label.localeCompare(second.label))

type PhosphorIconPickerProps = {
  className?: string
  onIconSelect: (svg: string) => void
  weight: PhosphorPickerWeight
}

const ICON_BATCH_SIZE = 72

export function PhosphorIconPicker({
  className,
  onIconSelect,
  weight,
}: PhosphorIconPickerProps) {
  const [query, setQuery] = React.useState("")
  const [visibleCount, setVisibleCount] = React.useState(ICON_BATCH_SIZE)

  const filteredIcons = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return phosphorCatalog
    }

    return phosphorCatalog.filter((icon) =>
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
        "isolate flex h-[342px] w-72 flex-col bg-surface-overlay text-content-primary",
        className,
      )}
    >
      <div className="relative mx-2 mt-2">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-content-secondary" />
        <input
          autoFocus
          className="h-8 w-full rounded-md border border-control-border bg-control-background pr-2.5 pl-8 text-sm outline-none placeholder:text-content-secondary focus-visible:border-action-focus-ring focus-visible:ring-2 focus-visible:ring-action-focus-ring dark:bg-control-background"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Phosphor icons..."
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
          <div className="absolute inset-0 flex items-center justify-center text-sm text-content-secondary">
            No icons found.
          </div>
        ) : (
          <div className="grid grid-cols-9 px-2 pt-2">
            {visibleIcons.map((icon) => (
              <PhosphorIconOption
                icon={icon}
                key={icon.name}
                onIconSelect={onIconSelect}
                weight={weight}
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex h-10 items-center border-t px-3 text-xs text-content-secondary">
        Select a Phosphor icon
      </div>
    </div>
  )
}

function PhosphorIconOption({
  icon,
  onIconSelect,
  weight,
}: {
  icon: PhosphorCatalogEntry
  onIconSelect: (svg: string) => void
  weight: PhosphorPickerWeight
}) {
  const { Icon } = icon

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={icon.label}
          className="flex aspect-square size-8 items-center justify-center rounded-md text-content-secondary transition-colors hover:bg-action-neutral-hover hover:text-action-on-neutral focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none active:bg-action-neutral-pressed data-[state=open]:bg-action-neutral-hover"
          title={icon.label}
          type="button"
        >
          <React.Suspense fallback={<span className="size-5" />}>
            <Icon aria-hidden className="size-5" weight={weight} />
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
              <Icon aria-hidden weight={weight} />
            </React.Suspense>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function formatPhosphorLabel(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/(\D)(\d+)/g, "$1 $2")
    .trim()
}
