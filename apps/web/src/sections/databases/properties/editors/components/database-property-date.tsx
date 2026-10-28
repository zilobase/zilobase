import {
  parseDatabaseDateValue,
  parseDatabaseDateRange as parseDateRange,
  getDatabaseDateStartValue as getStartValue,
  getDatabaseDateEndValue as getEndValue,
  getDatabaseDateStartTimeValue as getStartTimeValue,
  getDatabaseDateEndTimeValue as getEndTimeValue,
  getDatabaseDatePart as getDateFromValue,
  getDatabaseTimePart as getTimeFromValue,
  toDatabaseDateValue as toDateValue,
  getDatabaseTimeValue as getTimeValueFromDate,
} from "@zilobase/features/databases";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Check, ChevronRight, HelpCircle } from "@/components/icons";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { DateCalendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  dateFormatOptions,
  formatDatabaseDateValueWithFormats,
  getDateFormatConfig,
  getDateFormatLabel,
  getTimeFormatConfig,
  getTimeFormatLabel,
  timeFormatOptions,
  getDateConfigWithFormat,
  type DateFormatValue,
  type TimeFormatValue,
} from "@zilobase/features/databases";

type DatabasePropertyDateProps = {
  inline?: boolean;
  editable?: boolean;
  emptyLabel?: string;
  label: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  onPropertyConfigChange?: (config: unknown) => Promise<unknown> | unknown;
  onSelect: (value: string | string[]) => void;
  propertyConfig?: unknown;
  trigger?: ReactNode;
  value: string | string[];
};

export function DatabasePropertyDate({
  inline = false,
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
  const startDateInputRef = useRef<HTMLInputElement | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [isRange, setIsRange] = useState(Array.isArray(value) && value.length > 1);
  const [draftStartValue, setDraftStartValue] = useState(getStartValue(value));
  const [draftEndValue, setDraftEndValue] = useState(getEndValue(value));
  const [draftStartTimeValue, setDraftStartTimeValue] = useState(getStartTimeValue(value));
  const [draftEndTimeValue, setDraftEndTimeValue] = useState(getEndTimeValue(value));
  const selectedRange = useMemo(() => parseDateRange(value), [value]);
  const dateFormat = getDateFormatConfig(propertyConfig);
  const timeFormat = getTimeFormatConfig(propertyConfig);
  const displayValue = formatDatabaseDateValueWithFormats(value, dateFormat, timeFormat);
  const displayContent =
    displayValue ||
    (emptyLabel ? <span className="text-content-secondary">{emptyLabel}</span> : null);
  const dateFormatLabel = getDateFormatLabel(dateFormat);
  const timeFormatLabel = getTimeFormatLabel(timeFormat);
  const hasTime = timeFormat !== "hidden";
  const isOpen = controlledOpen ?? uncontrolledOpen;

  useEffect(() => {
    if (inline) startDateInputRef.current?.focus({ preventScroll: true });
  }, [inline]);

  const setOpen = (open: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(open);
    onOpenChange?.(open);

    if (open) {
      setIsRange(Boolean(getEndValue(value)));
      setDraftStartValue(getStartValue(value));
      setDraftEndValue(getEndValue(value));
      setDraftStartTimeValue(getStartTimeValue(value));
      setDraftEndTimeValue(getEndTimeValue(value));
    }
  };

  const commitDate = (
    date: Date | undefined,
    nextIsRange = isRange,
    timeValue = hasTime ? draftStartTimeValue : "",
  ) => {
    const nextValue = date ? toDateValue(date, timeValue) : "";

    if (nextIsRange) {
      commitRange(nextValue, "", getTimeFromValue(nextValue), "");
      return;
    }

    onSelect(nextValue);
    setDraftStartValue(nextValue);
    setDraftEndValue("");
    setDraftStartTimeValue(getTimeFromValue(nextValue));
    setDraftEndTimeValue("");
  };

  const commitRange = (
    startValue: string,
    endValue: string,
    startTimeValue = draftStartTimeValue,
    endTimeValue = draftEndTimeValue,
  ) => {
    const nextStartValue = parseDatabaseDateValue(startValue);
    const nextEndValue = parseDatabaseDateValue(endValue);
    const serializedStartValue = nextStartValue
      ? toDateValue(nextStartValue, hasTime ? startTimeValue : "")
      : "";
    const serializedEndValue = nextEndValue
      ? toDateValue(nextEndValue, hasTime ? endTimeValue : "")
      : "";

    if (serializedStartValue && serializedEndValue) {
      onSelect([serializedStartValue, serializedEndValue]);
    } else {
      onSelect(serializedStartValue);
    }

    setDraftStartValue(serializedStartValue);
    setDraftEndValue(serializedEndValue);
    setDraftStartTimeValue(getTimeFromValue(serializedStartValue));
    setDraftEndTimeValue(getTimeFromValue(serializedEndValue));
  };

  const commitCalendarRange = (range: DateRange | undefined) => {
    const startValue = range?.from ? toDateValue(range.from) : "";
    const endValue = range?.to ? toDateValue(range.to) : "";

    commitRange(startValue, endValue);
  };

  const updateDateFormat = async (dateFormat: DateFormatValue) => {
    if (!onPropertyConfigChange) {
      return;
    }

    await onPropertyConfigChange(getDateConfigWithFormat(propertyConfig, { dateFormat }));
  };

  const updateTimeFormat = async (timeFormat: TimeFormatValue) => {
    if (!onPropertyConfigChange) {
      return;
    }

    await onPropertyConfigChange(getDateConfigWithFormat(propertyConfig, { timeFormat }));
  };

  if (!editable) {
    return <span className="database-date-cell-trigger">{displayContent}</span>;
  }

  const panel = (
    <>
      <div className="grid gap-1 px-2 pt-1">
        <DateInput
          inputRef={startDateInputRef}
          action={
            <Button
              className="h-auto shrink-0 self-stretch active:not-aria-[haspopup]:translate-y-0"
              onClick={(event) => {
                event.stopPropagation();
                const today = new Date();

                commitDate(today, isRange, hasTime ? getTimeValueFromDate(today) : "");
              }}
              size="xs"
              type="button"
              variant="secondary"
            >
              Today
            </Button>
          }
          fieldLabel={isRange ? "Start date" : "Date"}
          label={`${label} start date`}
          onCommit={(nextValue) => {
            if (isRange) {
              commitRange(nextValue, draftEndValue);
            } else {
              const date = parseDatabaseDateValue(nextValue);
              const nextValueWithTime = date
                ? toDateValue(date, hasTime ? draftStartTimeValue : "")
                : "";

              onSelect(nextValueWithTime);
              setDraftStartValue(nextValueWithTime);
              setDraftStartTimeValue(getTimeFromValue(nextValueWithTime));
              setDraftEndValue("");
              setDraftEndTimeValue("");
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
                commitRange(draftStartValue, draftEndValue, nextValue);
                return;
              }

              const date = parseDatabaseDateValue(draftStartValue);
              const nextDateValue = date ? toDateValue(date, nextValue) : "";

              onSelect(nextDateValue);
              setDraftStartValue(nextDateValue);
              setDraftStartTimeValue(nextValue);
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
                  commitRange(draftStartValue, draftEndValue, draftStartTimeValue, nextValue)
                }
                onValueChange={setDraftEndTimeValue}
                value={draftEndTimeValue}
              />
            ) : null}
          </>
        ) : null}
      </div>
      <div className="relative px-2 [--cell-size:calc((18rem-1.5rem)/7)]">
        {isRange ? (
          <DateCalendar
            className="w-full bg-transparent py-1"
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
            className="w-full bg-transparent py-1"
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
            const nextIsRange = checked === true;

            setIsRange(nextIsRange);

            if (!nextIsRange) {
              commitRange(draftStartValue, "");
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
        className="w-full justify-start rounded-md border-t"
        onClick={() => {
          onSelect("");
          setDraftStartValue("");
          setDraftEndValue("");
          setDraftStartTimeValue("");
          setDraftEndTimeValue("");
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
    </>
  );
  if (inline)
    return (
      <div className="w-72 gap-1 p-1" data-database-property-editor="date">
        {panel}
      </div>
    );

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            aria-label={`${label} value: ${value || emptyLabel || "Empty"}`}
            className="database-date-cell-trigger"
            type="button"
          >
            {displayContent}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 gap-1 p-1"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const input = startDateInputRef.current;
          input?.focus({ preventScroll: true });
          input?.setSelectionRange(input.value.length, input.value.length);
        }}
        sideOffset={0}
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}

function DateInput({
  action,
  inputRef,
  fieldLabel,
  label,
  onCommit,
  onValueChange,
  placeholder,
  value,
}: {
  action?: ReactNode;
  inputRef?: RefObject<HTMLInputElement | null>;
  fieldLabel: string;
  label: string;
  onCommit: (value: string) => void;
  onValueChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const id = useId();
  const dirty = useRef(false);
  return (
    <div className="grid gap-1 text-xs font-medium text-content-secondary">
      <label className="px-1" htmlFor={id}>
        {fieldLabel}
      </label>
      <div className="flex items-stretch gap-1">
        <Input
          aria-label={label}
          id={id}
          ref={inputRef}
          className="text-content-primary selection:bg-selection-editor selection:text-content-primary"
          onBlur={() => {
            if (!dirty.current) return;
            dirty.current = false;
            onCommit(value);
          }}
          onChange={(event) => {
            dirty.current = true;
            onValueChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }

            if (!dirty.current) return;
            dirty.current = false;
            onCommit(value);
          }}
          placeholder={placeholder}
          value={value}
        />
        {action}
      </div>
    </div>
  );
}

function TimeInput({
  fieldLabel,
  label,
  onCommit,
  onValueChange,
  value,
}: {
  fieldLabel: string;
  label: string;
  onCommit: (value: string) => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const dirty = useRef(false);
  return (
    <label className="grid gap-1 text-xs font-medium text-content-secondary">
      <span className="px-1">{fieldLabel}</span>
      <Input
        aria-label={label}
        className="text-content-primary selection:bg-selection-editor selection:text-content-primary [&::-webkit-calendar-picker-indicator]:hidden"
        onBlur={() => {
          if (!dirty.current) return;
          dirty.current = false;
          onCommit(value);
        }}
        onChange={(event) => {
          dirty.current = true;
          onValueChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") {
            return;
          }

          if (!dirty.current) return;
          dirty.current = false;
          onCommit(value);
        }}
        step={60}
        type="time"
        value={value}
      />
    </label>
  );
}

function DatabaseDateRangeOption({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none hover:bg-action-neutral-hover hover:text-action-on-neutral">
      <span>End date</span>
      <Switch
        aria-label="End date"
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="ml-auto"
        size="sm"
      />
    </label>
  );
}

function DatabaseDateFormatOption<TValue extends string>({
  label,
  onSelect,
  options,
  selectedValue,
  value,
}: {
  label: string;
  onSelect: (value: TValue) => void;
  options: {
    label: string;
    value: TValue;
  }[];
  selectedValue: TValue;
  value: string;
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
      <PopoverContent align="start" className="w-64 p-1" side="right" sideOffset={4}>
        {options.map((option) => (
          <button
            className="flex w-full cursor-default items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm outline-hidden select-none hover:bg-action-neutral-hover hover:text-action-on-neutral"
            key={option.value}
            onClick={() => onSelect(option.value)}
            type="button"
          >
            <span>{option.label}</span>
            {option.value === selectedValue ? <Check className="ml-auto size-4" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function DatabaseDateOption({
  children,
  label,
  value,
}: {
  children?: ReactNode;
  label: string;
  value?: string;
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
  );
}
