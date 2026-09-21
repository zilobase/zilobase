import type { ReactNode } from "react";
import type { CalendarSpan, CalendarView } from "@zilobase/features/calendar";
export type CalendarItem = CalendarSpan & {
  id: string;
  title: string;
  backgroundClass?: string;
  textClass?: string;
  dashed?: boolean;
  editable?: boolean;
};
export type CalendarDisplayPreferences = {
  prefetchLeadMs?: number;
  bufferBefore?: number;
  bufferAfter?: number;
  timeZoneColumns: { zone: string; label: string }[];
  alignStart?: boolean;
  visibleDayCount?: number;
  hourHeight: number;
  timeZone: string;
  timeFormat: "12" | "24";
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  showWeekends: boolean;
  showWeekNumbers: boolean;
};
export type CalendarRange = { start: string; end: string };
export type CalendarSurfaceProps = {
  /** IDs are unique within this instance. Replace items/arrays when data changes. */
  isRangeReady?: (range: CalendarRange) => boolean;
  onMetric?: (name: "mounted_columns" | "edge_stall" | "layout_duration", value: number) => void;
  onViewportRangeChange?: (range: CalendarRange) => void;
  onRetryRange?: () => void;
  loadingMessage?: string;
  zoneControls?: ReactNode;
  items: CalendarItem[];
  date: string;
  view: CalendarView;
  preferences: CalendarDisplayPreferences;
  onVisibleDateChange?: (date: string) => void;
  /** Live leftmost/visible date while scrolling; must not write the route. */
  onPreviewDate?: (date: string) => void;
  onNavigate: (date: string, view: CalendarView) => void;
  onRangeChange?: (range: CalendarRange) => void;
  onSelect?: (item: CalendarItem) => void;
  onCreate?: (day: string, hour: number, duration: number) => void;
  onChange?: (item: CalendarItem) => void;
  onError?: (error: Error) => void;
  /** Customize card contents; the surface retains the accessible interaction wrapper. */
  renderItem?: (item: CalendarItem) => ReactNode;
};
export const calendarItemKey = (item: CalendarItem) => item.id;
