import type { DatabaseAutomationSchedule } from "@zilobase/features/automations";

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
  const unit =
    schedule.frequency === "custom"
      ? schedule.customPattern
      : schedule.frequency;
  const labels = {
    daily: "day",
    monthly: "month",
    weekly: "week",
    yearly: "year",
  } as const;
  return schedule.interval === 1
    ? `Every ${labels[unit]}`
    : `Every ${schedule.interval} ${labels[unit]}s`;
}

export function scheduleDefinition(
  draft: ScheduleDraft,
  timezone: string,
): DatabaseAutomationSchedule {
  const pattern =
    draft.frequency === "custom" ? draft.customPattern : draft.frequency;
  return {
    frequency: draft.frequency,
    interval: draft.interval,
    localTime: draft.localTime,
    startDate: draft.startDate,
    timezone,
    ...(draft.endDate ? { endDate: draft.endDate } : {}),
    ...(pattern === "weekly" ? { weekdays: draft.weekdays } : {}),
    ...(pattern === "monthly" || pattern === "yearly"
      ? {
          dayOfMonth:
            draft.dayOfMonth === "last" ? "last" : Number(draft.dayOfMonth),
        }
      : {}),
    ...(pattern === "yearly" ? { months: draft.months } : {}),
  };
}

export function scheduleDraft(
  schedule: DatabaseAutomationSchedule,
): ScheduleDraft {
  const customPattern = schedule.months?.length
    ? "yearly"
    : schedule.dayOfMonth !== undefined
      ? "monthly"
      : schedule.weekdays?.length
        ? "weekly"
        : "daily";
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
