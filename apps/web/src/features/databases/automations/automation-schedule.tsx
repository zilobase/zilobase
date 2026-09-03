import type { DatabaseAutomationSchedule } from "@zilobase/features/databases/automations"
import { Button } from "@/shared/ui/button"
import { DatePicker } from "@/shared/ui/date-picker"
import { Input } from "@/shared/ui/input"
import { TimePicker } from "@/shared/ui/time-picker"
import { AutomationSelect } from "./automation-select"

export type ScheduleDraft = {
  customPattern: "daily" | "monthly" | "weekly" | "yearly";
  dayOfMonth: string;
  endDate: string;
  frequency: DatabaseAutomationSchedule["frequency"];
  interval: number;
  localTime: string;
  months: number[];
  startDate: string;
  weekdays: number[];
};

export function scheduleTriggerLabel(schedule: ScheduleDraft) {
  const unit = schedule.frequency === "custom" ? schedule.customPattern : schedule.frequency;
  const labels = { daily: "day", monthly: "month", weekly: "week", yearly: "year" } as const;
  return schedule.interval === 1 ? `Every ${labels[unit]}` : `Every ${schedule.interval} ${labels[unit]}s`;
}

export function ScheduleEditor({ onChange, schedule }: {
  onChange: (schedule: ScheduleDraft) => void;
  schedule: ScheduleDraft;
}) {
  const patch = (value: Partial<ScheduleDraft>) => onChange({ ...schedule, ...value });
  const pattern = schedule.frequency === "custom" ? schedule.customPattern : schedule.frequency;
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-xs font-medium text-content-secondary">
        Frequency
        <AutomationSelect
          ariaLabel="Schedule frequency"
          className="h-8 text-sm text-content-primary"
          onValueChange={(frequency) => patch({ frequency: frequency as ScheduleDraft["frequency"] })}
          options={[
            { label: "Daily", value: "daily" },
            { label: "Weekly", value: "weekly" },
            { label: "Monthly", value: "monthly" },
            { label: "Yearly", value: "yearly" },
            { label: "Custom", value: "custom" },
          ]}
          value={schedule.frequency}
        />
      </label>
      {schedule.frequency === "custom" ? (
        <label className="grid gap-1 text-xs font-medium text-content-secondary">
          Repeat unit
          <AutomationSelect
            ariaLabel="Custom schedule unit"
            className="h-8 text-sm text-content-primary"
            onValueChange={(customPattern) => patch({ customPattern: customPattern as ScheduleDraft["customPattern"] })}
            options={[
              { label: "Days", value: "daily" },
              { label: "Weeks", value: "weekly" },
              { label: "Months", value: "monthly" },
              { label: "Years", value: "yearly" },
            ]}
            value={schedule.customPattern}
          />
        </label>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs font-medium text-content-secondary">
          Every
          <Input aria-label="Schedule interval" inputMode="numeric" onChange={(event) => patch({ interval: Math.max(1, Math.min(365, Number(event.target.value.replace(/\D/g, "")) || 1)) })} pattern="[0-9]*" value={schedule.interval} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-content-secondary">
          Local time
          <TimePicker aria-label="Schedule local time" onValueChange={(localTime) => patch({ localTime })} value={schedule.localTime} />
        </label>
      </div>
      {pattern === "weekly" ? (
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-content-secondary">Weekdays</legend>
          <div className="flex flex-wrap gap-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, day) => (
              <Button
                aria-pressed={schedule.weekdays.includes(day)}
                key={label}
                onClick={() => patch({ weekdays: toggleNumber(schedule.weekdays, day) })}
                size="sm"
                type="button"
                variant={schedule.weekdays.includes(day) ? "secondary" : "outline"}
              >{label}</Button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {pattern === "monthly" || pattern === "yearly" ? (
        <label className="grid gap-1 text-xs font-medium text-content-secondary">
          Day of month
          <AutomationSelect
            ariaLabel="Schedule day of month"
            className="h-8 text-sm text-content-primary"
            onValueChange={(dayOfMonth) => patch({ dayOfMonth })}
            options={[
              ...Array.from({ length: 31 }, (_, index) => ({ label: String(index + 1), value: String(index + 1) })),
              { label: "Last day", value: "last" },
            ]}
            value={schedule.dayOfMonth}
          />
        </label>
      ) : null}
      {pattern === "yearly" ? (
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-content-secondary">Months</legend>
          <div className="grid grid-cols-6 gap-1">
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <Button aria-label={`Month ${month}`} aria-pressed={schedule.months.includes(month)} key={month} onClick={() => patch({ months: toggleNumber(schedule.months, month) })} size="sm" type="button" variant={schedule.months.includes(month) ? "secondary" : "outline"}>{month}</Button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs font-medium text-content-secondary">
          Start date
          <DatePicker aria-label="Schedule start date" onValueChange={(startDate) => patch({ startDate, ...(schedule.endDate && schedule.endDate < startDate ? { endDate: "" } : {}) })} value={schedule.startDate} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-content-secondary">
          End date (optional)
          <DatePicker aria-label="Schedule end date" clearable minValue={schedule.startDate} onValueChange={(endDate) => patch({ endDate })} placeholder="No end date" value={schedule.endDate} />
        </label>
      </div>
    </div>
  );
}

export function scheduleDefinition(draft: ScheduleDraft, timezone: string): DatabaseAutomationSchedule {
  const pattern = draft.frequency === "custom" ? draft.customPattern : draft.frequency;
  return {
    frequency: draft.frequency,
    interval: draft.interval,
    localTime: draft.localTime,
    startDate: draft.startDate,
    timezone,
    ...(draft.endDate ? { endDate: draft.endDate } : {}),
    ...(pattern === "weekly" ? { weekdays: draft.weekdays } : {}),
    ...(pattern === "monthly" || pattern === "yearly" ? { dayOfMonth: draft.dayOfMonth === "last" ? "last" : Number(draft.dayOfMonth) } : {}),
    ...(pattern === "yearly" ? { months: draft.months } : {}),
  };
}

export function scheduleDraft(schedule: DatabaseAutomationSchedule): ScheduleDraft {
  const customPattern = schedule.months?.length ? "yearly" : schedule.dayOfMonth !== undefined ? "monthly" : schedule.weekdays?.length ? "weekly" : "daily";
  return {
    customPattern,
    dayOfMonth: String(schedule.dayOfMonth ?? 1),
    endDate: schedule.endDate ?? "",
    frequency: schedule.frequency,
    interval: schedule.interval,
    localTime: schedule.localTime,
    months: schedule.months ?? [1],
    startDate: schedule.startDate,
    weekdays: schedule.weekdays ?? [1],
  };
}

function toggleNumber(values: number[], value: number) {
  if (values.includes(value)) return values.length === 1 ? values : values.filter((item) => item !== value);
  return [...values, value].sort((left, right) => left - right);
}

