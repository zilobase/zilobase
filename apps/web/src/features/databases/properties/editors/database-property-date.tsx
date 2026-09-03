import { useMemo, useState, type ReactNode } from "react"
import { Check, ChevronRight, HelpCircle } from "@/shared/components/icons"
import type { DateRange } from "react-day-picker"

import { Button } from "@/shared/ui/button"
import { DateCalendar } from "@/shared/ui/calendar"
import { Input } from "@/shared/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { Switch } from "@/shared/ui/switch"
import {
  dateFormatOptions,
  formatDatabaseDateValueWithFormats,
  getDateFormatConfig,
  getDateFormatLabel,
  getTimeFormatConfig,
  getTimeFormatLabel,
  timeFormatOptions,
  type DatabaseDatePropertyConfig,
  type DateFormatValue,
  type TimeFormatValue,
} from "../model/database-date-config"
import { parseDatabaseDateValue } from "../model/database-date-value"
import { firstScalarValue } from "../../core/database-property-values"

type DatabasePropertyDateProps = {
  editable?: boolean
  emptyLabel?: string
  label: string
  onOpenChange?: (open: boolean) => void
  open?: boolean
  onPropertyConfigChange?: (config: unknown) => Promise<unknown> | unknown
  onSelect: (value: string | string[]) => void
  propertyConfig?: unknown
  trigger?: ReactNode
  value: string | string[]
}

export function DatabasePropertyDate({
  editable = true,
  emptyLabel,
  label,
  onOpenChange,
  open: controlledOpen,
  onPropertyConfigChange,
  onSelect,
  propertyConfig,
  trigger,
  value,
}: DatabasePropertyDateProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
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
  const displayValue = formatDatabaseDateValueWithFormats(
    value,
    dateFormat,
    timeFormat
  )
  const displayContent = displayValue ||
    (emptyLabel ? (
      <span className="text-content-secondary">{emptyLabel}</span>
    ) : null)
  const dateFormatLabel = getDateFormatLabel(dateFormat)
  const timeFormatLabel = getTimeFormatLabel(timeFormat)
  const hasTime = timeFormat !== "hidden"
  const isOpen = controlledOpen ?? uncontrolledOpen

  const setOpen = (open: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(open)
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
    const nextStartValue = parseDatabaseDateValue(startValue)
    const nextEndValue = parseDatabaseDateValue(endValue)
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

  const updateDateFormat = async (dateFormat: DateFormatValue) => {
    if (!onPropertyConfigChange) {
      return
    }

    await onPropertyConfigChange(
      getDateConfigWithFormat(propertyConfig, { dateFormat })
    )
  }

  const updateTimeFormat = async (timeFormat: TimeFormatValue) => {
    if (!onPropertyConfigChange) {
      return
    }

    await onPropertyConfigChange(
      getDateConfigWithFormat(propertyConfig, { timeFormat })
    )
  }

  if (!editable) {
    return <span className="database-date-cell-trigger">{displayContent}</span>
  }

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            aria-label={`${label} value`}
            className="database-date-cell-trigger"
            type="button"
          >
            {displayContent}
          </button>
        )}
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
                const date = parseDatabaseDateValue(nextValue)
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

                const date = parseDatabaseDateValue(draftStartValue)
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
            <DateCalendar
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
            <DateCalendar
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
          {onPropertyConfigChange ? (
            <>
              <DatabaseDateFormatOption
                label="Date format"
                onSelect={(nextValue) => void updateDateFormat(nextValue)}
                options={dateFormatOptions}
                selectedValue={dateFormat}
                value={dateFormatLabel}
              />
              <DatabaseDateFormatOption
                label="Time format"
                onSelect={(nextValue) => void updateTimeFormat(nextValue)}
                options={timeFormatOptions}
                selectedValue={timeFormat}
                value={timeFormatLabel}
              />
              <DatabaseDateOption label="Remind" value="None" />
            </>
          ) : null}
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
        <div className="flex items-center gap-1.5 rounded-md border-t px-2 py-1 text-sm text-content-secondary">
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
    <label className="grid gap-1 text-xs font-medium text-content-secondary">
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
    <label className="grid gap-1 text-xs font-medium text-content-secondary">
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
      className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none hover:bg-action-neutral-hover hover:text-action-on-neutral"
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
          className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none hover:bg-action-neutral-hover hover:text-action-on-neutral"
          type="button"
        >
          <span>{label}</span>
          <span className="ml-auto inline-flex min-w-0 items-center gap-1.5 text-content-secondary">
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
            className="flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm outline-hidden select-none hover:bg-action-neutral-hover hover:text-action-on-neutral"
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
        <span className="ml-auto inline-flex min-w-0 items-center gap-1.5 text-content-secondary">
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
    end: endValue ? parseDatabaseDateValue(endValue) : undefined,
    endTime: endValue ? getTimeFromValue(endValue) : "",
    start: startValue ? parseDatabaseDateValue(startValue) : undefined,
    startTime: startValue ? getTimeFromValue(startValue) : "",
  }
}

function getStartValue(value: string | string[]) {
  return firstScalarValue(value)
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
