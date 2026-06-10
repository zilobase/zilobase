import { useMemo, useState, type ReactNode } from "react"
import { Check, ChevronRight, HelpCircle } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { useUpdateDatabaseProperty } from "@notelab/features/databases"
import {
  dateFormatOptions,
  getDateFormatConfig,
  getDateFormatLabel,
  getTimeFormatConfig,
  getTimeFormatLabel,
  timeFormatOptions,
  type DatabaseDatePropertyConfig,
  type DateFormatValue,
  type TimeFormatValue,
} from "./database-date-config"

type DatabaseDateCellProps = {
  databaseId: string
  editable?: boolean
  label: string
  onOpenChange?: (open: boolean) => void
  onSelect: (value: string | string[]) => void
  propertyConfig?: unknown
  propertyId: string
  value: string | string[]
}

export function DatabaseDateCell({
  databaseId,
  editable = true,
  label,
  onOpenChange,
  onSelect,
  propertyConfig,
  propertyId,
  value,
}: DatabaseDateCellProps) {
  const updateProperty = useUpdateDatabaseProperty()
  const [isOpen, setIsOpen] = useState(false)
  const [isRange, setIsRange] = useState(Array.isArray(value) && value.length > 1)
  const [draftStartValue, setDraftStartValue] = useState(getStartValue(value))
  const [draftEndValue, setDraftEndValue] = useState(getEndValue(value))
  const [draftStartTimeValue, setDraftStartTimeValue] = useState(
    getStartTimeValue(value)
  )
  const [draftEndTimeValue, setDraftEndTimeValue] = useState(
    getEndTimeValue(value)
  )
  const selectedRange = useMemo(() => parseDateRange(value), [value])
  const dateFormat = getDateFormatConfig(propertyConfig)
  const timeFormat = getTimeFormatConfig(propertyConfig)
  const displayValue = formatDisplayValue(selectedRange, dateFormat, timeFormat)
  const dateFormatLabel = getDateFormatLabel(dateFormat)
  const timeFormatLabel = getTimeFormatLabel(timeFormat)
  const hasTime = timeFormat !== "hidden"

  const setOpen = (open: boolean) => {
    setIsOpen(open)
    onOpenChange?.(open)

    if (open) {
      setIsRange(Boolean(getEndValue(value)))
      setDraftStartValue(getStartValue(value))
      setDraftEndValue(getEndValue(value))
      setDraftStartTimeValue(getStartTimeValue(value))
      setDraftEndTimeValue(getEndTimeValue(value))
    }
  }

  const commitDate = (
    date: Date | undefined,
    nextIsRange = isRange,
    timeValue = hasTime ? draftStartTimeValue : ""
  ) => {
    const nextValue = date ? toDateValue(date, timeValue) : ""

    if (nextIsRange) {
      commitRange(nextValue, "", getTimeFromValue(nextValue), "")
      return
    }

    onSelect(nextValue)
    setDraftStartValue(nextValue)
    setDraftEndValue("")
    setDraftStartTimeValue(getTimeFromValue(nextValue))
    setDraftEndTimeValue("")
  }

  const commitRange = (
    startValue: string,
    endValue: string,
    startTimeValue = draftStartTimeValue,
    endTimeValue = draftEndTimeValue
  ) => {
    const nextStartValue = parseDateValue(startValue)
    const nextEndValue = parseDateValue(endValue)
    const serializedStartValue = nextStartValue
      ? toDateValue(nextStartValue, hasTime ? startTimeValue : "")
      : ""
    const serializedEndValue = nextEndValue
      ? toDateValue(nextEndValue, hasTime ? endTimeValue : "")
      : ""

    if (serializedStartValue && serializedEndValue) {
      onSelect([serializedStartValue, serializedEndValue])
    } else {
      onSelect(serializedStartValue)
    }

    setDraftStartValue(serializedStartValue)
    setDraftEndValue(serializedEndValue)
    setDraftStartTimeValue(getTimeFromValue(serializedStartValue))
    setDraftEndTimeValue(getTimeFromValue(serializedEndValue))
  }

  const commitCalendarRange = (range: DateRange | undefined) => {
    const startValue = range?.from ? toDateValue(range.from) : ""
    const endValue = range?.to ? toDateValue(range.to) : ""

    commitRange(startValue, endValue)
  }

  const updateDateFormat = (dateFormat: DateFormatValue) => {
    updateProperty.mutate({
      config: getDateConfigWithFormat(propertyConfig, { dateFormat }),
      databaseId,
      databasePropertyId: propertyId,
    })
  }

  const updateTimeFormat = (timeFormat: TimeFormatValue) => {
    updateProperty.mutate({
      config: getDateConfigWithFormat(propertyConfig, { timeFormat }),
      databaseId,
      databasePropertyId: propertyId,
    })
  }

  if (!editable) {
    return <span className="database-date-cell-trigger">{displayValue}</span>
  }

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`${label} value`}
          className="database-date-cell-trigger"
          type="button"
        >
          {displayValue}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-1 p-1" sideOffset={0}>
        <div
          className={
            hasTime ? "grid grid-cols-2 gap-1 px-2 pt-1" : "grid gap-1 px-2 pt-1"
          }
        >
          <DateInput
            fieldLabel={isRange ? "Start date" : "Date"}
            label={`${label} start date`}
            onCommit={(nextValue) => {
              if (isRange) {
                commitRange(nextValue, draftEndValue)
              } else {
                const date = parseDateValue(nextValue)
                const nextValueWithTime = date
                  ? toDateValue(date, hasTime ? draftStartTimeValue : "")
                  : ""

                onSelect(nextValueWithTime)
                setDraftStartValue(nextValueWithTime)
                setDraftStartTimeValue(getTimeFromValue(nextValueWithTime))
                setDraftEndValue("")
                setDraftEndTimeValue("")
              }
            }}
            onValueChange={setDraftStartValue}
            placeholder={isRange ? "Start date" : "Add date"}
            value={getDateFromValue(draftStartValue)}
          />
          {hasTime ? (
            <TimeInput
              fieldLabel={isRange ? "Start time" : "Time"}
              label={`${label} start time`}
              onCommit={(nextValue) => {
                if (isRange) {
                  commitRange(draftStartValue, draftEndValue, nextValue)
                  return
                }

                const date = parseDateValue(draftStartValue)
                const nextDateValue = date ? toDateValue(date, nextValue) : ""

                onSelect(nextDateValue)
                setDraftStartValue(nextDateValue)
                setDraftStartTimeValue(nextValue)
              }}
              onValueChange={setDraftStartTimeValue}
              value={draftStartTimeValue}
            />
          ) : null}
          {isRange ? (
            <>
              <DateInput
                fieldLabel="End date"
                label={`${label} end date`}
                onCommit={(nextValue) => commitRange(draftStartValue, nextValue)}
                onValueChange={setDraftEndValue}
                placeholder="End date"
                value={getDateFromValue(draftEndValue)}
              />
              {hasTime ? (
                <TimeInput
                  fieldLabel="End time"
                  label={`${label} end time`}
                  onCommit={(nextValue) =>
                    commitRange(
                      draftStartValue,
                      draftEndValue,
                      draftStartTimeValue,
                      nextValue
                    )
                  }
                  onValueChange={setDraftEndTimeValue}
                  value={draftEndTimeValue}
                />
              ) : null}
            </>
          ) : null}
        </div>
        <div className="relative px-2 [--cell-size:calc((18rem-1.5rem)/7)]">
          <Button
            className="absolute top-[calc((var(--cell-size)-1.5rem)/2+0.25rem)] right-11 z-10 h-6 active:not-aria-[haspopup]:translate-y-0"
            onClick={(event) => {
              event.stopPropagation()
              const today = new Date()

              commitDate(
                today,
                isRange,
                hasTime ? getTimeValueFromDate(today) : ""
              )
            }}
            size="xs"
            type="button"
            variant="secondary"
          >
            Today
          </Button>
          {isRange ? (
            <Calendar
              className="w-full py-1"
              classNames={{
                root: "relative w-full",
                month: "w-full",
                month_grid: "w-full",
                months: "w-full",
              }}
              defaultMonth={selectedRange.start}
              mode="range"
              onSelect={commitCalendarRange}
              selected={{
                from: selectedRange.start,
                to: selectedRange.end,
              }}
            />
          ) : (
            <Calendar
              className="w-full py-1"
              classNames={{
                root: "relative w-full",
                month: "w-full",
                month_grid: "w-full",
                months: "w-full",
              }}
              defaultMonth={selectedRange.start}
              mode="single"
              onSelect={(date) => commitDate(date)}
              selected={selectedRange.start}
            />
          )}
        </div>
        <div className="border-t pt-1">
          <DatabaseDateRangeOption
            checked={isRange}
            onCheckedChange={(checked) => {
              const nextIsRange = checked === true

              setIsRange(nextIsRange)

              if (!nextIsRange) {
                commitRange(draftStartValue, "")
              }
            }}
          />
          <DatabaseDateFormatOption
            label="Date format"
            onSelect={updateDateFormat}
            options={dateFormatOptions}
            selectedValue={dateFormat}
            value={dateFormatLabel}
          />
          <DatabaseDateFormatOption
            label="Time format"
            onSelect={updateTimeFormat}
            options={timeFormatOptions}
            selectedValue={timeFormat}
            value={timeFormatLabel}
          />
          <DatabaseDateOption label="Remind" value="None" />
        </div>
        <Button
          className="h-8 w-full justify-start rounded-md border-t px-2 py-1"
          onClick={() => {
            onSelect("")
            setDraftStartValue("")
            setDraftEndValue("")
            setDraftStartTimeValue("")
            setDraftEndTimeValue("")
          }}
          type="button"
          variant="ghost"
        >
          Clear
        </Button>
        <div className="flex items-center gap-1.5 rounded-md border-t px-2 py-1 text-sm text-muted-foreground">
          <HelpCircle className="size-4 shrink-0" />
          <span>Learn about reminders</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function getDateConfigWithFormat(
  config: unknown,
  nextConfig: DatabaseDatePropertyConfig
) {
  return {
    ...(config && typeof config === "object" ? config : {}),
    ...nextConfig,
  }
}

function DateInput({
  action,
  fieldLabel,
  label,
  onCommit,
  onValueChange,
  placeholder,
  value,
}: {
  action?: ReactNode
  fieldLabel: string
  label: string
  onCommit: (value: string) => void
  onValueChange: (value: string) => void
  placeholder: string
  value: string
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      <span className="px-1">{fieldLabel}</span>
      <span className="relative">
        <Input
          aria-label={label}
          className={action ? "pr-16" : undefined}
          onBlur={() => onCommit(value)}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return
            }

            onCommit(value)
          }}
          placeholder={placeholder}
          value={value}
        />
        {action}
      </span>
    </label>
  )
}

function TimeInput({
  fieldLabel,
  label,
  onCommit,
  onValueChange,
  value,
}: {
  fieldLabel: string
  label: string
  onCommit: (value: string) => void
  onValueChange: (value: string) => void
  value: string
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      <span className="px-1">{fieldLabel}</span>
      <Input
        aria-label={label}
        className="[&::-webkit-calendar-picker-indicator]:hidden"
        onBlur={() => onCommit(value)}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") {
            return
          }

          onCommit(value)
        }}
        step={60}
        type="time"
        value={value}
      />
    </label>
  )
}

function DatabaseDateRangeOption({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <button
      aria-pressed={checked}
      className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
      onClick={() => onCheckedChange(!checked)}
      type="button"
    >
      <span>End date</span>
      <Switch
        checked={checked}
        className="ml-auto pointer-events-none"
        size="sm"
        tabIndex={-1}
      />
    </button>
  )
}

function DatabaseDateFormatOption<TValue extends string>({
  label,
  onSelect,
  options,
  selectedValue,
  value,
}: {
  label: string
  onSelect: (value: TValue) => void
  options: {
    label: string
    value: TValue
  }[]
  selectedValue: TValue
  value: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
          type="button"
        >
          <span>{label}</span>
          <span className="ml-auto inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
            {value}
            <ChevronRight className="size-4 shrink-0" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-1"
        side="right"
        sideOffset={4}
      >
        {options.map((option) => (
          <button
            className="flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
            key={option.value}
            onClick={() => onSelect(option.value)}
            type="button"
          >
            <span>{option.label}</span>
            {option.value === selectedValue ? (
              <Check className="ml-auto size-4" />
            ) : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function DatabaseDateOption({
  children,
  label,
  value,
}: {
  children?: ReactNode
  label: string
  value?: string
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm">
      <span>{label}</span>
      {children ?? (
        <span className="ml-auto inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
          {value}
          <ChevronRight className="size-4 shrink-0" />
        </span>
      )}
    </div>
  )
}

function parseDateRange(value: string | string[]) {
  const [startValue, endValue] = Array.isArray(value)
    ? value
    : [value, undefined]

  return {
    end: endValue ? parseDateValue(endValue) : undefined,
    endTime: endValue ? getTimeFromValue(endValue) : "",
    start: startValue ? parseDateValue(startValue) : undefined,
    startTime: startValue ? getTimeFromValue(startValue) : "",
  }
}

function getStartValue(value: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value
}

function getEndValue(value: string | string[]) {
  return Array.isArray(value) ? value[1] ?? "" : ""
}

function getStartTimeValue(value: string | string[]) {
  return getTimeFromValue(getStartValue(value))
}

function getEndTimeValue(value: string | string[]) {
  return getTimeFromValue(getEndValue(value))
}

function getDateFromValue(value: string) {
  return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? value
}

function getTimeFromValue(value: string) {
  return value.match(/T(\d{2}:\d{2})/)?.[1] ?? ""
}

function parseDateValue(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return undefined
  }

  const localDateTimeMatch = trimmedValue.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  )

  if (localDateTimeMatch) {
    const year = Number(localDateTimeMatch[1])
    const month = Number(localDateTimeMatch[2])
    const day = Number(localDateTimeMatch[3])
    const hours = Number(localDateTimeMatch[4])
    const minutes = Number(localDateTimeMatch[5])
    const date = new Date(year, month - 1, day, hours, minutes)

    return isSameDateParts(date, year, month, day) &&
      date.getHours() === hours &&
      date.getMinutes() === minutes
      ? date
      : undefined
  }

  const dateOnlyMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1])
    const month = Number(dateOnlyMatch[2])
    const day = Number(dateOnlyMatch[3])
    const date = new Date(year, month - 1, day)

    return isSameDateParts(date, year, month, day) ? date : undefined
  }

  const date = new Date(trimmedValue)

  if (Number.isNaN(date.getTime())) {
    return undefined
  }

  return date
}

function isSameDateParts(date: Date, year: number, month: number, day: number) {
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function toDateValue(date: Date, timeValue = "") {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const dateValue = `${year}-${month}-${day}`

  return timeValue ? `${dateValue}T${timeValue}` : dateValue
}

function getTimeValueFromDate(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")

  return `${hours}:${minutes}`
}

function formatDisplayValue(
  range: { end?: Date; endTime: string; start?: Date; startTime: string },
  dateFormat: DateFormatValue,
  timeFormat: TimeFormatValue
) {
  if (range.start && range.end) {
    return `${formatDate(
      range.start,
      dateFormat,
      timeFormat,
      range.startTime
    )} - ${formatDate(range.end, dateFormat, timeFormat, range.endTime)}`
  }

  return range.start
    ? formatDate(range.start, dateFormat, timeFormat, range.startTime)
    : ""
}

function formatDate(
  date: Date,
  dateFormat: DateFormatValue,
  timeFormat: TimeFormatValue,
  timeValue: string
) {
  const dateValue = formatDateOnly(date, dateFormat)
  const formattedTimeValue = formatTime(timeValue, timeFormat)

  return formattedTimeValue ? `${dateValue} ${formattedTimeValue}` : dateValue
}

function formatDateOnly(date: Date, dateFormat: DateFormatValue) {
  if (dateFormat === "short") {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(date)
  }

  if (dateFormat === "month_day_year") {
    return formatNumericDate(date, [
      date.getMonth() + 1,
      date.getDate(),
      date.getFullYear(),
    ])
  }

  if (dateFormat === "day_month_year") {
    return formatNumericDate(date, [
      date.getDate(),
      date.getMonth() + 1,
      date.getFullYear(),
    ])
  }

  if (dateFormat === "year_month_day") {
    return formatNumericDate(date, [
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
    ])
  }

  if (dateFormat === "relative") {
    return formatRelativeDate(date)
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

function formatTime(value: string, timeFormat: TimeFormatValue) {
  if (timeFormat === "hidden" || !value) {
    return ""
  }

  const [hoursValue, minutesValue] = value.split(":")
  const date = new Date()
  const hours = Number(hoursValue)
  const minutes = Number(minutesValue)

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return ""
  }

  date.setHours(hours, minutes, 0, 0)

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    hour12: timeFormat === "12_hour",
    minute: "2-digit",
  }).format(date)
}

function formatNumericDate(date: Date, parts: number[]) {
  return parts
    .map((part, index) =>
      index === 0 && part === date.getFullYear()
        ? String(part)
        : String(part).padStart(2, "0")
    )
    .join("/")
}

function formatRelativeDate(date: Date) {
  const today = new Date()
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  )
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDiff = Math.round(
    (dateStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (dayDiff === 0) {
    return "Today"
  }

  if (dayDiff === -1) {
    return "Yesterday"
  }

  if (dayDiff === 1) {
    return "Tomorrow"
  }

  return new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  }).format(dayDiff, "day")
}
