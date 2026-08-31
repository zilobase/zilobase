import { useState } from "react"

import {
  CheckIcon,
  SidebarSimpleIcon,
  SquareIcon,
} from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import {
  embeddedItemsOpenAsLabels,
  embeddedItemsOpenAsModes,
  type EmbeddedItemsOpenAs,
} from "@zilobase/features/pages"

export function EmbeddedItemPresentationDropdown({
  disabled,
  itemLabel = "items",
  mode,
  onSelect,
}: {
  disabled?: boolean
  itemLabel?: string
  mode: EmbeddedItemsOpenAs
  onSelect: (mode: EmbeddedItemsOpenAs) => void
}) {
  const ModeIcon = mode === "sidepanel" ? SidebarSimpleIcon : SquareIcon
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Open ${itemLabel} as`}
          disabled={disabled}
          size="icon"
          title={`Open ${itemLabel} as ${embeddedItemsOpenAsLabels[mode]}`}
          type="button"
          variant="ghost"
        >
          <ModeIcon mirrored={mode === "sidepanel"} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {embeddedItemsOpenAsModes.map((value) => {
          const OptionIcon = value === "sidepanel" ? SidebarSimpleIcon : SquareIcon

          return (
            <DropdownMenuItem
              key={value}
              onSelect={(event) => {
                event.preventDefault()
                onSelect(value)
                setOpen(false)
              }}
            >
              <OptionIcon mirrored={value === "sidepanel"} />
              <span>{embeddedItemsOpenAsLabels[value]}</span>
              {mode === value ? <CheckIcon className="ml-auto" /> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
