import { CalendarIcon, GripVertical, X } from "lucide-react"
import { Reorder, useDragControls } from "framer-motion"
import { useState, type ReactNode } from "react"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

import {
  getDatabaseFilterOperatorsForType,
  type DatabasePropertyFilterOperator,
} from "./database-view-config"
import { isDateLikePropertyType } from "../core/database-property-types"
import type { DatabaseSearchableMenuOption } from "./database-searchable-menu-items"

export type DatabaseCondition = {
  id: string
  label: string
  operator: DatabasePropertyFilterOperator
  operatorLabel: string
  propertyId: string
  propertyType: string
  values: string[]
}

export type DatabaseConditionUpdatePatch = {
  operator?: DatabasePropertyFilterOperator
  propertyId?: string
  values?: string[]
}

type DatabaseConditionEditorLayout = "inline" | "stacked"

type DatabaseConditionEditorDrag = {
  ariaLabel: string
  isDragging: boolean
  onDragEnd: () => void
  onDragStart: () => void
  value: string
}

const DEFAULT_RELATIVE_DATE_FILTER_VALUE = "relative:this:week"

const databaseRelativeDateDirections = [
  { label: "Past", value: "past" },
  { label: "Next", value: "next" },
  { label: "This", value: "this" },
] as const

const databaseRelativeDateUnits = [
  { label: "day", value: "day" },
  { label: "week", value: "week" },
  { label: "month", value: "month" },
  { label: "year", value: "year" },
] as const

const dateFilterCalendarClassNames = {
  root: "relative w-full",
  month: "w-full",
  month_grid: "w-full",
  months: "w-full",
}

function conditionOperatorNeedsValue(operator: DatabasePropertyFilterOperator) {
  return operator !== "is_empty" && operator !== "is_not_empty"
}

function isDateConditionType(propertyType: string) {
  return isDateLikePropertyType(propertyType)
}

function getConditionInputType(propertyType: string) {
  if (isDateConditionType(propertyType)) {
    return "date"
  }

  return propertyType === "number" ? "number" : "text"
}

function parseRelativeDateFilterValue(value: string | undefined) {
  const [, direction, unit] = (value ?? DEFAULT_RELATIVE_DATE_FILTER_VALUE).split(
    ":"
  )

  return {
    direction: databaseRelativeDateDirections.some(
      (item) => item.value === direction
    )
      ? direction
      : "this",
    unit: databaseRelativeDateUnits.some((item) => item.value === unit)
      ? unit
      : "week",
  }
}

function createRelativeDateFilterValue(direction: string, unit: string) {
  return `relative:${direction}:${unit}`
}

function parseDateInput(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return null
  }

  const parsedDate = dateValueToDate(trimmedValue)

  return parsedDate ? toDateOnlyValue(parsedDate) : undefined
}

function dateValueToDate(value: string | undefined) {
  if (!value) {
    return null
  }

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1])
    const month = Number(dateOnlyMatch[2])
    const day = Number(dateOnlyMatch[3])
    const date = new Date(year, month - 1, day)

    return date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
      ? date
      : null
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

function toDateOnlyValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function getDateFilterValueLabel(values: string[]) {
  return values[0]?.slice(0, 10) || "Date"
}

function getDateBetweenFilterValueLabel(values: string[]) {
  const startValue = values[0]?.slice(0, 10)
  const endValue = values[1]?.slice(0, 10)

  if (startValue && endValue) {
    return `${startValue} - ${endValue}`
  }

  return startValue || "Date range"
}

export function getNextConditionValuesForOperator(
  condition: DatabaseCondition,
  operator: DatabasePropertyFilterOperator
) {
  if (!conditionOperatorNeedsValue(operator)) {
    return []
  }

  if (operator === "is_relative_to_today") {
    return [
      condition.values[0]?.startsWith("relative:")
        ? condition.values[0]
        : DEFAULT_RELATIVE_DATE_FILTER_VALUE,
    ]
  }

  if (operator === "is_between") {
    return condition.values.slice(0, 2)
  }

  return condition.values.slice(0, 1)
}

function DateConditionInput({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onCommit: (value: string) => void
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-md border bg-transparent">
      <CalendarIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label={label}
        className="h-8 w-full min-w-0 border-0 bg-transparent pl-7 pr-2 text-xs shadow-none focus-visible:border-transparent focus-visible:ring-0"
        onBlur={(event) => onCommit(event.target.value)}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onCommit(event.currentTarget.value)
          }
        }}
        placeholder={label}
        value={value}
      />
    </div>
  )
}

function DatabaseDateConditionEditor({
  values,
  onValuesChange,
}: {
  values: string[]
  onValuesChange: (values: string[]) => void
}) {
  const [dateDraft, setDateDraft] = useState<string | null>(null)
  const dateValue = values[0] ?? ""
  const selectedDate = dateValue ? dateValueToDate(dateValue) ?? undefined : undefined

  const commitDateInput = (inputValue: string) => {
    const parsedValue = parseDateInput(inputValue)

    setDateDraft(null)

    if (parsedValue === undefined) {
      return
    }

    onValuesChange(parsedValue === null ? [] : [parsedValue])
  }

  const setSelectedDate = (date: Date | undefined) => {
    if (!date) {
      return
    }

    onValuesChange([toDateOnlyValue(date)])
  }

  return (
    <div className="flex flex-col gap-2">
      <DateConditionInput
        label="Date"
        onChange={setDateDraft}
        onCommit={commitDateInput}
        value={dateDraft ?? dateValue}
      />
      <Calendar
        className="w-full bg-transparent p-1 [--cell-size:2rem]"
        classNames={dateFilterCalendarClassNames}
        mode="single"
        onSelect={setSelectedDate}
        selected={selectedDate}
      />
    </div>
  )
}

function DatabaseDateBetweenConditionEditor({
  values,
  onValuesChange,
}: {
  values: string[]
  onValuesChange: (values: string[]) => void
}) {
  const [startDraft, setStartDraft] = useState<string | null>(null)
  const [endDraft, setEndDraft] = useState<string | null>(null)
  const startValue = values[0] ?? ""
  const endValue = values[1] ?? ""
  const selectedStartDate = startValue
    ? dateValueToDate(startValue) ?? undefined
    : undefined
  const selectedEndDate = endValue ? dateValueToDate(endValue) ?? undefined : undefined

  const commitDateInput = (inputValue: string, field: "end" | "start") => {
    const parsedValue = parseDateInput(inputValue)

    if (field === "start") {
      setStartDraft(null)
    } else {
      setEndDraft(null)
    }

    if (parsedValue === undefined) {
      return
    }

    const nextValues = [...values]

    if (field === "start") {
      nextValues[0] = parsedValue ?? ""
    } else {
      nextValues[1] = parsedValue ?? ""
    }

    onValuesChange(nextValues.filter(Boolean))
  }

  const setSelectedDateRange = (range: DateRange | undefined) => {
    if (!range?.from) {
      return
    }

    onValuesChange([
      toDateOnlyValue(range.from),
      toDateOnlyValue(range.to ?? range.from),
    ])
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-1.5">
        <DateConditionInput
          label="Start date"
          onChange={setStartDraft}
          onCommit={(value) => commitDateInput(value, "start")}
          value={startDraft ?? startValue}
        />
        <DateConditionInput
          label="End date"
          onChange={setEndDraft}
          onCommit={(value) => commitDateInput(value, "end")}
          value={endDraft ?? endValue}
        />
      </div>
      <Calendar
        className="w-full bg-transparent p-1 [--cell-size:2rem]"
        classNames={dateFilterCalendarClassNames}
        mode="range"
        onSelect={setSelectedDateRange}
        selected={{ from: selectedStartDate, to: selectedEndDate }}
      />
    </div>
  )
}

function DatabaseRelativeDateConditionEditor({
  value,
  onValueChange,
}: {
  value: string | undefined
  onValueChange: (value: string) => void
}) {
  const relativeDateValue = parseRelativeDateFilterValue(value)

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 gap-2">
        <Select
          onValueChange={(direction) =>
            onValueChange(
              createRelativeDateFilterValue(direction, relativeDateValue.unit)
            )
          }
          value={relativeDateValue.direction}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {databaseRelativeDateDirections.map((direction) => (
              <SelectItem key={direction.value} value={direction.value}>
                {direction.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          onValueChange={(unit) =>
            onValueChange(
              createRelativeDateFilterValue(relativeDateValue.direction, unit)
            )
          }
          value={relativeDateValue.unit}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {databaseRelativeDateUnits.map((unit) => (
              <SelectItem key={unit.value} value={unit.value}>
                {unit.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
        Filter will update with the current date
      </div>
    </div>
  )
}

function DatabaseDateConditionValueControl({
  condition,
  onUpdate,
}: {
  condition: DatabaseCondition
  onUpdate: (patch: DatabaseConditionUpdatePatch) => void
}) {
  const updateValues = (values: string[]) => onUpdate({ values })

  if (condition.operator === "is_relative_to_today") {
    return (
      <DatabaseRelativeDateConditionEditor
        onValueChange={(value) => updateValues([value])}
        value={condition.values[0]}
      />
    )
  }

  const isBetweenCondition = condition.operator === "is_between"

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex h-8 w-full items-center gap-1.5 rounded-lg border border-input px-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          type="button"
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {isBetweenCondition
              ? getDateBetweenFilterValueLabel(condition.values)
              : getDateFilterValueLabel(condition.values)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-2 p-2">
        {isBetweenCondition ? (
          <DatabaseDateBetweenConditionEditor
            onValuesChange={updateValues}
            values={condition.values}
          />
        ) : (
          <DatabaseDateConditionEditor
            onValuesChange={updateValues}
            values={condition.values}
          />
        )}
        {condition.values.length > 0 ? (
          <Button
            className="h-8 w-full justify-start px-2 text-xs"
            onClick={() => updateValues([])}
            type="button"
            variant="ghost"
          >
            Clear selection
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function DatabaseConditionValueControl({
  condition,
  onUpdate,
  valueOptions,
}: {
  condition: DatabaseCondition
  onUpdate: (patch: DatabaseConditionUpdatePatch) => void
  valueOptions: DatabaseSearchableMenuOption[]
}) {
  const setValue = (valueIndex: number, value: string) => {
    const nextValues = [...condition.values]
    nextValues[valueIndex] = value

    onUpdate({
      values: nextValues.slice(0, condition.operator === "is_between" ? 2 : 1),
    })
  }

  if (!conditionOperatorNeedsValue(condition.operator)) {
    return (
      <span className="inline-flex h-8 w-full items-center rounded-lg border border-transparent px-2 text-sm text-muted-foreground">
        No value
      </span>
    )
  }

  if (
    condition.operator === "is_relative_to_today" ||
    isDateConditionType(condition.propertyType)
  ) {
    return (
      <DatabaseDateConditionValueControl
        condition={condition}
        onUpdate={onUpdate}
      />
    )
  }

  if (
    valueOptions.length > 0 &&
    condition.operator !== "is_between" &&
    getConditionInputType(condition.propertyType) === "text"
  ) {
    return (
      <Select
        onValueChange={(value) => onUpdate({ values: [value] })}
        value={condition.values[0] ?? ""}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Value" />
        </SelectTrigger>
        <SelectContent align="start">
          {valueOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <div className="flex w-full items-center gap-2">
      <Input
        aria-label={`${condition.label} condition value`}
        className="h-8 min-w-0 flex-1"
        onChange={(event) => setValue(0, event.target.value)}
        placeholder="Value"
        type={getConditionInputType(condition.propertyType)}
        value={condition.values[0] ?? ""}
      />
      {condition.operator === "is_between" ? (
        <Input
          aria-label={`${condition.label} second condition value`}
          className="h-8 min-w-0 flex-1"
          onChange={(event) => setValue(1, event.target.value)}
          placeholder="Value"
          type={getConditionInputType(condition.propertyType)}
          value={condition.values[1] ?? ""}
        />
      ) : null}
    </div>
  )
}

export function DatabaseConditionEditor({
  condition,
  drag,
  fieldOptions,
  footer,
  layout = "inline",
  leadingIcon,
  removeIcon,
  removeLabel,
  valueOptions,
  onFieldChange,
  onRemove,
  onUpdate,
}: {
  condition: DatabaseCondition
  drag?: DatabaseConditionEditorDrag
  fieldOptions: DatabaseSearchableMenuOption[]
  footer?: ReactNode
  layout?: DatabaseConditionEditorLayout
  leadingIcon?: ReactNode
  removeIcon?: ReactNode
  removeLabel?: string
  valueOptions: DatabaseSearchableMenuOption[]
  onFieldChange?: (field: string) => void
  onRemove?: () => void
  onUpdate: (patch: DatabaseConditionUpdatePatch) => void
}) {
  const dragControls = useDragControls()
  const operatorOptions = getDatabaseFilterOperatorsForType(condition.propertyType)
  const isStacked = layout === "stacked"

  const updateField = (field: string) => {
    if (field === condition.propertyId) {
      return
    }

    if (onFieldChange) {
      onFieldChange(field)
      return
    }

    onUpdate({ propertyId: field })
  }

  const updateOperator = (operator: DatabasePropertyFilterOperator) => {
    onUpdate({
      operator,
      values: getNextConditionValuesForOperator(condition, operator),
    })
  }

  const conditionControls = (
    <>
      <Select onValueChange={updateField} value={condition.propertyId}>
        <SelectTrigger className={cn("w-full", isStacked && "h-8 text-xs")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {fieldOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        onValueChange={(operator) =>
          updateOperator(operator as DatabasePropertyFilterOperator)
        }
        value={condition.operator}
      >
        <SelectTrigger className={cn("w-full", isStacked && "h-8 text-xs")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {operatorOptions.map((operator) => (
            <SelectItem key={operator.value} value={operator.value}>
              {operator.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className={cn(isStacked && "text-xs")}>
        <DatabaseConditionValueControl
          condition={condition}
          onUpdate={onUpdate}
          valueOptions={valueOptions}
        />
      </div>
    </>
  )

  const removeButton = onRemove ? (
    <button
      aria-label={removeLabel ?? `Remove ${condition.label} condition`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
        isStacked
          ? "mt-1 size-7 rounded-full hover:bg-background"
          : "size-8 rounded-md hover:bg-muted"
      )}
      onClick={onRemove}
      type="button"
    >
      {removeIcon ?? <X className={isStacked ? "size-3.5" : "size-4"} />}
    </button>
  ) : null

  const content = isStacked ? (
    <>
      <div className="mb-2 flex items-start gap-1.5">
        {drag ? (
          <button
            aria-label={drag.ariaLabel}
            className="mt-2 inline-flex size-5 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              dragControls.start(event)
            }}
            type="button"
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
        {leadingIcon ? (
          <span className="mt-2 inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">
            {leadingIcon}
          </span>
        ) : null}
        <div className="grid min-w-0 flex-1 gap-2">{conditionControls}</div>
        {removeButton}
      </div>
      {footer}
    </>
  ) : (
    <div className="grid max-w-full grid-cols-[1rem_10rem_12rem_16rem_2rem] items-start gap-2">
      <span className="mt-2 inline-flex size-4 text-muted-foreground [&_svg]:size-4">
        {leadingIcon}
      </span>
      {conditionControls}
      {removeButton}
      {footer}
    </div>
  )

  if (!drag) {
    return content
  }

  return (
    <Reorder.Item
      as="div"
      className={cn(
        "rounded-md bg-muted/35 p-2 transition-colors",
        drag.isDragging && "relative z-10 bg-popover shadow-lg ring-1 ring-ring/50"
      )}
      dragControls={dragControls}
      dragListener={false}
      value={drag.value}
      whileDrag={{ scale: 0.995 }}
      onDragEnd={drag.onDragEnd}
      onDragStart={drag.onDragStart}
    >
      {content}
    </Reorder.Item>
  )
}
