import { getDaysInMonth } from "date-fns"

import type { Range, TimelineData } from "./gantt-types"

export function createTimelineYear(year: number): TimelineData[number] {
  return {
    quarters: Array.from({ length: 4 }, (_, quarterIndex) => ({
      months: Array.from({ length: 3 }, (_, monthIndex) => ({
        days: getDaysInMonth(
          new Date(year, quarterIndex * 3 + monthIndex, 1),
        ),
      })),
    })),
    year,
  }
}

export function createInitialTimelineData(today: Date): TimelineData {
  return [-1, 0, 1].map((yearOffset) =>
    createTimelineYear(today.getFullYear() + yearOffset),
  )
}

export function getTimelineColumnCount(
  timelineData: TimelineData,
  range: Range,
): number {
  if (range !== "daily") {
    return timelineData.length * 12
  }

  return timelineData.reduce(
    (yearTotal, year) =>
      yearTotal +
      year.quarters.reduce(
        (quarterTotal, quarter) =>
          quarterTotal +
          quarter.months.reduce(
            (monthTotal, month) => monthTotal + month.days,
            0,
          ),
        0,
      ),
    0,
  )
}
