"use client"

import { useState } from "react"

import { CalendarIcon } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import { DateCalendar } from "@/shared/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { cn } from "@/shared/lib/utils"

function dateValueToDate(value: string | undefined) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return undefined

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? undefined : date
}

function toDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function DatePicker({
  "aria-label": ariaLabel,
  className,
  clearable = false,
  minValue,
  onValueChange,
  placeholder = "Pick a date",
  value,
}: {
  "aria-label": string
  className?: string
  clearable?: boolean
  minValue?: string
  onValueChange: (value: string) => void
  placeholder?: string
  value: string
}) {
  const [open, setOpen] = useState(false)
  const selected = dateValueToDate(value)
  const minimum = dateValueToDate(minValue)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={ariaLabel}
          className={cn("h-8 w-full justify-start gap-2 px-2 font-normal", !value && "text-content-secondary", className)}
          type="button"
          variant="outline"
        >
          <CalendarIcon className="size-4 text-content-secondary" />
          <span className="truncate">{value || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-2 p-2">
        <DateCalendar
          className="w-full bg-transparent p-1 [--cell-size:2rem]"
          classNames={{ month: "w-full", month_grid: "w-full", months: "w-full", root: "relative w-full" }}
          disabled={minimum ? { before: minimum } : undefined}
          mode="single"
          onSelect={(date) => {
            if (!date) return
            onValueChange(toDateValue(date))
            setOpen(false)
          }}
          selected={selected}
        />
        {clearable && value ? (
          <Button className="w-full justify-start" onClick={() => { onValueChange(""); setOpen(false) }} type="button" variant="ghost">
            Clear date
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
