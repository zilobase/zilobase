import { Loader2, Plus, Search } from "lucide-react"
import { useState } from "react"

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"

import { databasePropertyTypes } from "./constants"

export function AddDatabasePropertyMenu({
  disabled,
  isPending,
  onAdd,
}: {
  disabled: boolean
  isPending: boolean
  onAdd: (type: string, label: string) => void
}) {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const filteredPropertyTypes = databasePropertyTypes.map((group) =>
    normalizedQuery
      ? group.filter((item) => item.label.toLowerCase().includes(normalizedQuery))
      : group
  )

  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <button
          className="database-add-property"
          disabled={disabled}
          type="button"
        >
          {isPending ? <Loader2 className="animate-spin" /> : <Plus />}
          <span>Add property</span>
        </button>
      </DropDrawerTrigger>
      <DropDrawerContent className="w-100">
        <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm">
          <Search className="size-4" />
          <input
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Select type"
            value={query}
          />
        </div>
        {filteredPropertyTypes.map((group, groupIndex) => (
          <div
            className="grid grid-cols-2 gap-x-1 gap-y-0.5"
            key={`property-type-group-${groupIndex}`}
          >
            {group.map((item) => {
              const Icon = item.icon

              return (
                <DropDrawerItem
                  key={item.type}
                  onSelect={() => onAdd(item.type, item.label)}
                >
                  <Icon />
                  <span>{item.label}</span>
                </DropDrawerItem>
              )
            })}
            {group.length > 0 &&
            filteredPropertyTypes
              .slice(groupIndex + 1)
              .some((nextGroup) => nextGroup.length > 0) ? (
              <DropDrawerSeparator className="col-span-2" />
            ) : null}
          </div>
        ))}
      </DropDrawerContent>
    </DropDrawer>
  )
}
