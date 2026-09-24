import { describe, it, expect } from "vitest";
import { shiftSeriesTime, splitRecurrence } from "./recurrence";
describe("recurrence boundaries", () => {
  it("splits count and exclusive all-day cutoff", () => {
    expect(splitRecurrence(["RRULE:FREQ=DAILY;COUNT=10"], { date: "2026-09-05" }, 4)).toEqual({
      head: ["RRULE:FREQ=DAILY;UNTIL=20260904"],
      tail: ["RRULE:FREQ=DAILY;COUNT=6"],
    });
    expect(() =>
      splitRecurrence(["RRULE:FREQ=DAILY", "EXDATE:20260904"], { date: "2026-09-05" }, 4),
    ).toThrow();
  });
  it("keeps series wall time across DST", () => {
    const result = shiftSeriesTime(
      { dateTime: "2026-03-01T09:00:00-05:00", timeZone: "America/New_York" },
      { dateTime: "2026-03-15T09:00:00-04:00", timeZone: "America/New_York" },
      { dateTime: "2026-03-15T10:00:00-04:00", timeZone: "America/New_York" },
    );
    expect(result.dateTime).toBe("2026-03-01T15:00:00Z");
  });
});
