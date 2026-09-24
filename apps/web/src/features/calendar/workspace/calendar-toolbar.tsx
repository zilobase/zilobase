import { useState } from "react";
import { CalendarCommands } from "./calendar-commands";
import { CalendarTravel, useCalendarDisplayPreferences } from "../preferences/calendar-travel";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  normalizeCalendarView,
  todayInZone,
  shiftCalendarPeriod,
  type CalendarPreferences,
  type CalendarView,
} from "@zilobase/features/calendar";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/shared/ui/dropdown-menu";
import {
  SearchIcon,
  SidebarSimpleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SettingsIcon,
  MoreHorizontalIcon,
} from "@/shared/components/icons";
import { chromeCalendarDate } from "./calendar-navigation";
import { useCalendarWorkspace } from "./calendar-workspace";
export function CalendarToolbar({
  preferences: savedPreferences,
  onSettings,
  onPreferences,
}: {
  preferences: CalendarPreferences;
  onSettings: () => void;
  onPreferences?: (preferences: CalendarPreferences) => Promise<unknown>;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const preferences = useCalendarDisplayPreferences(savedPreferences);
  const workspace = useCalendarWorkspace(),
    search = useSearch({ from: "/app/calendar" }),
    navigate = useNavigate();
  const route = (search: import("../workspace/calendar-navigation").CalendarDestination) =>
    workspace.navigateCalendar(search, () => {
      void navigate({ to: "/calendar", search });
    });
  const date = chromeCalendarDate(workspace.visibleDate, search.date, preferences.timeZone),
    view = normalizeCalendarView(search.view ?? preferences.view);
  const period = (date: string, view: CalendarView) =>
    route({ date, view, align: search.align, days: search.days });
  const today = () =>
    route({
      date: todayInZone(preferences.timeZone),
      view,
      days: search.days,
      align: preferences.todayAlignment === "start" || undefined,
    });
  const shift = (direction: number) =>
    period(
      shiftCalendarPeriod(
        date,
        view,
        direction,
        search.days,
        preferences.showWeekends,
        search.align,
      ),
      view,
    );
  const input = (
    <Input
      aria-label="Search calendar"
      placeholder="Search events"
      value={workspace.query}
      onChange={(event) => workspace.setQuery(event.target.value)}
    />
  );
  return (
    <div className="flex min-w-0 items-center gap-1" aria-label="Calendar controls">
      <div className="hidden w-44 lg:block">{input}</div>
      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
        <PopoverTrigger asChild>
          <Button className="lg:hidden" variant="ghost" size="icon" aria-label="Search events">
            <SearchIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-2">
          {input}
        </PopoverContent>
      </Popover>
      <Select value={view} onValueChange={(next) => period(date, next as CalendarView)}>
        <SelectTrigger aria-label="Calendar view" className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(["day", "week", "month"] as const).map((value) => (
            <SelectItem key={value} value={value}>
              {value[0]!.toUpperCase() + value.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {view === "week" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" aria-label="Visible day count">
              {search.days ?? 7} days
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3">
            <label className="text-sm" htmlFor="calendar-day-count">
              Visible days (1–31)
            </label>
            <div className="mt-2 flex items-center gap-2">
              <Button
                variant="outline"
                aria-label="Fewer days"
                disabled={(search.days ?? 7) <= 1}
                onClick={() =>
                  route({ date, view, align: search.align, days: (search.days ?? 7) - 1 })
                }
              >
                −
              </Button>
              <Input
                id="calendar-day-count"
                type="number"
                min={1}
                max={31}
                value={search.days ?? 7}
                onChange={(event) => {
                  const days = Number(event.target.value);
                  if (Number.isInteger(days) && days >= 1 && days <= 31)
                    route({ date, view, align: search.align, days });
                }}
              />
              <Button
                variant="outline"
                aria-label="More days"
                disabled={(search.days ?? 7) >= 31}
                onClick={() =>
                  route({ date, view, align: search.align, days: (search.days ?? 7) + 1 })
                }
              >
                +
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
      <Button
        variant="ghost"
        size="icon"
        data-calendar-panel-toggle
        aria-label="Calendar event panel"
        aria-expanded={workspace.panelOpen}
        onClick={() => (workspace.panelOpen ? workspace.closePanel() : workspace.openPanel())}
      >
        <SidebarSimpleIcon />
      </Button>
      <div className="hidden items-center gap-1 lg:flex">
        <Button variant="ghost" onClick={today}>
          Today
        </Button>
        <Button variant="ghost" size="icon" aria-label="Previous period" onClick={() => shift(-1)}>
          <ChevronLeftIcon />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Next period" onClick={() => shift(1)}>
          <ChevronRightIcon />
        </Button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="lg:hidden"
            variant="ghost"
            size="icon"
            aria-label="Calendar navigation"
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={today}>Today</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => shift(-1)}>
            <ChevronLeftIcon />
            Previous period
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => shift(1)}>
            <ChevronRightIcon />
            Next period
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CalendarCommands
        onSearch={() => {
          requestAnimationFrame(() => {
            const inputs = document.querySelectorAll<HTMLInputElement>(
              '[aria-label="Search calendar"]',
            );
            const visible = [...inputs].find((input) => input.offsetParent !== null);
            if (visible) visible.focus();
            else setSearchOpen(true);
          });
        }}
        preferences={savedPreferences}
        onPreferences={onPreferences}
        onSettings={onSettings}
      />
      <CalendarTravel preferences={savedPreferences} onSave={onPreferences} />
      <Button variant="ghost" size="icon" aria-label="Calendar settings" onClick={onSettings}>
        <SettingsIcon />
      </Button>
    </div>
  );
}
