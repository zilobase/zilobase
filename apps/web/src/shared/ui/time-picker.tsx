"use client"

import { useState } from "react"

import { Clock } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select"
import { cn } from "@/shared/lib/utils"

type TimePeriod = "AM" | "PM"

function getTimeParts(value: string) {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  const hour24 = match ? Number(match[1]) : 9
  const minute = match?.[2] ?? "00"

  return {
    hour: String(hour24 % 12 || 12).padStart(2, "0"),
    minute,
    period: (hour24 >= 12 ? "PM" : "AM") as TimePeriod,
  }
}

function createTimeValue(hour: string, minute: string, period: TimePeriod) {
  const hour12 = Number(hour)
  const hour24 = period === "PM" ? (hour12 % 12) + 12 : hour12 % 12

  return `${String(hour24).padStart(2, "0")}:${minute}`
}

function getTimeLabel(value: string) {
  const { hour, minute, period } = getTimeParts(value)
  return `${hour}:${minute} ${period}`
}

export function TimePicker({
  "aria-label": ariaLabel,
  className,
  onValueChange,
  value,
}: {
  "aria-label": string
  className?: string
  onValueChange: (value: string) => void
  value: string
}) {
  const [open, setOpen] = useState(false)
  const parts = getTimeParts(value)
  const update = (next: Partial<typeof parts>) => {
    const merged = { ...parts, ...next }
    onValueChange(createTimeValue(merged.hour, merged.minute, merged.period))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={ariaLabel}
          className={cn("h-8 w-full justify-start gap-2 px-2 font-normal", className)}
          type="button"
          variant="outline"
        >
          <Clock className="size-4 text-content-secondary" />
          <span>{getTimeLabel(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-3 p-3">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <label className="grid gap-1 text-xs font-medium text-content-secondary">
            Hour
            <Select onValueChange={(hour) => update({ hour })} value={parts.hour}>
              <SelectTrigger aria-label={`${ariaLabel} hour`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map((hour) => (
                  <SelectItem key={hour} value={hour}>{hour}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-content-secondary">
            Minute
            <Select onValueChange={(minute) => update({ minute })} value={parts.minute}>
              <SelectTrigger aria-label={`${ariaLabel} minute`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((minute) => (
                  <SelectItem key={minute} value={minute}>{minute}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-content-secondary">
            Period
            <Select onValueChange={(period) => update({ period: period as TimePeriod })} value={parts.period}>
              <SelectTrigger aria-label={`${ariaLabel} period`} className="w-[4.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AM">AM</SelectItem>
                <SelectItem value="PM">PM</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <Button className="w-full" onClick={() => setOpen(false)} type="button" variant="secondary">
          Done
        </Button>
      </PopoverContent>
    </Popover>
  )
}
