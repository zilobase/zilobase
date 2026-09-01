import { Loader2, Plus } from "@/shared/components/icons"
import { useEffect, useRef, useState } from "react"

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer"

import { databasePropertyTypes } from "../../core/database-property-types"
import { PropertyTypePicker } from "../shared/property-type-picker"

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
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const actualOpen = open ?? internalOpen
  const handleOpenChange = (nextOpen: boolean) => {
    setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)

    if (!nextOpen) {
      setPropertyTitle("")
    }
  }
  const handleAdd = (type: string, label: string) => {
    onAdd(type, propertyTitle.trim() || label)
    setPropertyTitle("")
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
        align="start"
        className="w-100"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <PropertyTypePicker onSelect={handleAdd} types={databasePropertyTypes} />
      </DropDrawerContent>
    </DropDrawer>
  )
}
