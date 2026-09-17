import { useMemo, useState, type ComponentType } from "react"

import { Search } from "@/shared/components/icons"
import { DropDrawerItem, DropDrawerSeparator } from "@/shared/ui/dropdrawer"

export type PropertyTypeChoice = {
  icon: ComponentType<{ className?: string }>
  label: string
  type: string
}

export function PropertyTypePicker({
  onSelect,
  placeholder = "Select type",
  types,
}: {
  onSelect: (type: string, label: string) => void
  placeholder?: string
  types: readonly (readonly PropertyTypeChoice[])[]
}) {
  const [query, setQuery] = useState("")
  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return types.map((group) => normalized
      ? group.filter((item) => item.label.toLowerCase().includes(normalized))
      : [...group])
  }, [query, types])

  return (
    <>
      <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm">
        <Search className="size-4" />
        <input
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-content-secondary"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          placeholder={placeholder}
          value={query}
        />
      </div>
      {groups.map((group, groupIndex) => (
        <div className="grid grid-cols-2 gap-x-1 gap-y-0.5" key={`property-type-group-${groupIndex}`}>
          {group.map((item) => {
            const Icon = item.icon
            return (
              <DropDrawerItem key={item.type} onSelect={() => {
                setQuery("")
                onSelect(item.type, item.label)
              }}>
                <Icon />
                <span>{item.label}</span>
              </DropDrawerItem>
            )
          })}
          {group.length > 0 && groups.slice(groupIndex + 1).some((next) => next.length > 0) ? <DropDrawerSeparator className="col-span-2" /> : null}
        </div>
      ))}
    </>
  )
}
