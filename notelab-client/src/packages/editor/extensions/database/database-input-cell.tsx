import { useRef, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { useIsMobile } from "@/hooks/use-mobile"

export function DatabaseInputCell({
  label,
  onActivate,
  onChange,
  onCommit,
  onDeactivate,
  onInput,
  value,
}: {
  label: string
  onActivate: (element: HTMLTextAreaElement) => void
  onChange: (value: string) => void
  onCommit: () => void
  onDeactivate: () => void
  onInput: (event: FormEvent<HTMLTextAreaElement>) => void
  value: string
}) {
  const isMobile = useIsMobile()
  const [isOpen, setIsOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const commitAndClose = () => {
    onCommit()
    onDeactivate()
    setIsOpen(false)
  }

  const textarea = (
    <textarea
      aria-label={`${label} value`}
      className="database-input-cell"
      data-database-cell-input
      onBlur={
        isMobile
          ? undefined
          : (event) => {
              onCommit()
              event.currentTarget.style.height = ""
              onDeactivate()
            }
      }
      onChange={(event) => onChange(event.target.value)}
      onFocus={(event) => onActivate(event.currentTarget)}
      onInput={onInput}
      ref={textareaRef}
      rows={1}
      value={value}
    />
  )

  if (!isMobile) {
    return textarea
  }

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(open) => {
        if (open) {
          setIsOpen(true)
          return
        }

        commitAndClose()
      }}
    >
      <DrawerTrigger asChild>
        <button
          aria-label={`${label} value`}
          className="database-input-cell-trigger"
          type="button"
        >
          {value || <span className="text-muted-foreground">Empty</span>}
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh] bg-popover px-1 pb-2 text-popover-foreground">
        <DrawerHeader className="flex-row items-center justify-between px-2 py-2 text-left">
          <DrawerTitle className="min-w-0 truncate text-sm font-medium">
            {label}
          </DrawerTitle>
          <Button
            className="h-8 px-2 text-xs"
            onClick={commitAndClose}
            type="button"
            variant="ghost"
          >
            Done
          </Button>
        </DrawerHeader>
        <div className="database-input-cell-drawer">{textarea}</div>
      </DrawerContent>
    </Drawer>
  )
}
