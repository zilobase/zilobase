import { Loader2, Plus, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"

import { databasePropertyTypes } from "../core/database-property-types"

export function AddDatabasePropertyMenu({
  disabled,
  isPending,
  onAdd,
  onOpenChange,
  open,
  triggerLabel = "Add property",
}: {
  disabled: boolean
  isPending: boolean
  onAdd: (type: string, label: string) => void
  onOpenChange?: (open: boolean) => void
  open?: boolean
  triggerLabel?: string
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [propertyTitle, setPropertyTitle] = useState("")
  const [query, setQuery] = useState("")
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const actualOpen = open ?? internalOpen
  const normalizedQuery = query.trim().toLowerCase()
  const filteredPropertyTypes = databasePropertyTypes.map((group) =>
    normalizedQuery
      ? group.filter((item) => item.label.toLowerCase().includes(normalizedQuery))
      : group
  )
  const handleOpenChange = (nextOpen: boolean) => {
    setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)

    if (!nextOpen) {
      setPropertyTitle("")
      setQuery("")
    }
  }
  const handleAdd = (type: string, label: string) => {
    onAdd(type, propertyTitle.trim() || label)
    setPropertyTitle("")
    setQuery("")
  }

  useEffect(() => {
    if (!actualOpen) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [actualOpen])

  return (
    <DropDrawer open={actualOpen} onOpenChange={handleOpenChange}>
      <DropDrawerTrigger asChild>
        {actualOpen ? (
          <div
            aria-disabled={disabled}
            className="database-add-property"
            role="button"
            tabIndex={disabled ? -1 : 0}
          >
            {isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            <input
              aria-label="Property title"
              className="database-add-property-input"
              onChange={(event) => setPropertyTitle(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              placeholder="Property title"
              ref={titleInputRef}
              value={propertyTitle}
            />
          </div>
        ) : (
          <button
            className="database-add-property"
            disabled={disabled}
            type="button"
          >
            {isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            <span>{triggerLabel}</span>
          </button>
        )}
      </DropDrawerTrigger>
      <DropDrawerContent
        className="w-100"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
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
                  onSelect={() => handleAdd(item.type, item.label)}
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
