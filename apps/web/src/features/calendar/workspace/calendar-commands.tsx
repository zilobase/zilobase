import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { calendarTravelPreferences, normalizeCalendarView, shiftCalendarPeriod, todayInZone, type CalendarPreferences, type CalendarView } from "@zilobase/features/calendar";
import { useAppShortcut } from "@/shared/shortcuts";
import { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandItem, CommandShortcut } from "@/shared/ui/command";
import { Button } from "@/shared/ui/button";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/platform/network/api";
import { chromeCalendarDate } from "./calendar-navigation";
import { useCalendarWorkspace, type CalendarCommand } from "./calendar-workspace";
export function CalendarCommands({ preferences, onPreferences, onSettings, onSearch }: { onSearch: () => void; preferences: CalendarPreferences; onPreferences?: (value: CalendarPreferences) => Promise<unknown>; onSettings: () => void }) {
  const workspace = useCalendarWorkspace(), navigate = useNavigate(), search = useSearch({ from: "/app/calendar" });
  const [mode, setMode] = useState<"commands" | "help" | null>(null), [pending, setPending] = useState(false);
  const view = normalizeCalendarView(search.view ?? preferences.view), date = chromeCalendarDate(workspace.visibleDate, search.date, workspace.travelZone ?? preferences.timeZone);
  const route = (search: import("./calendar-navigation").CalendarDestination) => workspace.navigateCalendar(search, () => { void navigate({ to: "/calendar", search }); });
  const period = (date: string, nextView: CalendarView = view, align = search.align) => route({ date, view: nextView, days: search.days, align });
  const save = async (value: CalendarPreferences) => { if (!onPreferences || pending) return; setPending(true); try { await onPreferences(value); } catch (error) { toast.error(getApiErrorMessage(error)); } finally { setPending(false); } };
  const commands = calendarCommandItems({ workspace, preferences, pending, onPreferences, onSearch, onSettings, view, date, search, period, route, save, setMode });
  const invoke = (id: string, event: KeyboardEvent) => invokeCalendarCommand(commands, id, event);
  useAppShortcut("openSearch", () => { setMode(current => current ? null : "commands"); return true; }, { allowInEditable: true, priority: 50 });
  useAppShortcut("calendarHelp", () => { setMode("help"); return true; }, { priority: 50 });
  useAppShortcut("calendarTravel", event => invoke("travel", event), { priority: 50 });
  useAppShortcut("calendarToday", event => invoke("today", event), { priority: 50 });
  useAppShortcut("calendarPrevious", event => invoke("previous", event), { priority: 50 });
  useAppShortcut("calendarNext", event => invoke("next", event), { priority: 50 });
  useAppShortcut("calendarCreate", event => invoke("create", event), { priority: 50 });
  useAppShortcut("calendarNextEvent", event => invoke("next-event", event), { priority: 50 });
  useAppShortcut("calendarPreviousEvent", event => invoke("previous-event", event), { priority: 50 });
  return <><Button variant="ghost" aria-label="Calendar commands" onClick={() => setMode("commands")}>Commands</Button><CommandDialog open={mode !== null} onOpenChange={open => { if (!open) setMode(null); }} title={mode === "help" ? "Calendar shortcuts" : "Calendar commands"} description="Search Calendar actions. Letter shortcuts are ignored while typing."><Command><CommandInput placeholder={mode === "help" ? "Search shortcuts and actions…" : "Search Calendar commands…"} /><CommandList><CommandEmpty>No matching actions.</CommandEmpty>{commands.map(command => <CommandItem key={command.id} value={`${command.label} ${command.shortcut ?? ""}`} disabled={command.disabled} onSelect={() => { if (command.disabled) return; setMode(null); command.run(); }}>{command.label}{command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}</CommandItem>)}</CommandList></Command></CommandDialog></>;
}
function calendarCommandItems(input: {
  workspace: ReturnType<typeof useCalendarWorkspace>; preferences: CalendarPreferences; pending: boolean;
  onPreferences?: (value: CalendarPreferences) => Promise<unknown>; onSearch: () => void; onSettings: () => void;
  view: CalendarView; date: string; search: { days?: number; align?: boolean }; period: (date: string, view?: CalendarView, align?: boolean) => void;
  route: (search: import("./calendar-navigation").CalendarDestination) => void; save: (value: CalendarPreferences) => Promise<void>; setMode: (mode: "commands" | "help" | null) => void;
}): CalendarCommand[] {
  return [
    { id: "today", label: "Go to today", shortcut: "T", run: () => input.period(todayInZone(input.workspace.travelZone ?? input.preferences.timeZone), input.view, input.preferences.todayAlignment === "start" || undefined) },
    { id: "previous", label: "Previous period", shortcut: "←", run: () => input.period(shiftCalendarPeriod(input.date, input.view, -1, input.search.days, input.preferences.showWeekends, input.search.align)) },
    { id: "next", label: "Next period", shortcut: "→", run: () => input.period(shiftCalendarPeriod(input.date, input.view, 1, input.search.days, input.preferences.showWeekends, input.search.align)) },
    ...input.workspace.featureCommands,
    ...(["day", "week", "month"] as const).map(next => ({ id: `view:${next}`, label: `Switch to ${next} view`, run: () => input.period(input.date, next) })),
    { id: "search", label: "Search calendar events", run: input.onSearch },
    { id: "panel", label: input.workspace.panelOpen ? "Close event panel" : "Open event panel", run: () => input.workspace.panelOpen ? input.workspace.closePanel() : input.workspace.openPanel() },
    { id: "settings", label: "Calendar settings", run: input.onSettings },
    ...dayCountCommands(input),
    ...hourHeightCommands(input),
    ...visibilityCommands(input),
    ...zoneCommands(input),
    { id: "travel", label: "Travel to a time zone", shortcut: "Z", run: () => input.workspace.setTravelPickerOpen(true) },
    { id: "restore-travel", label: "Restore saved time zone", disabled: !input.workspace.travelZone, run: () => input.workspace.setTravelZone(null) },
    { id: "help", label: "Calendar shortcut help", shortcut: "?", run: () => input.setMode("help") },
  ];
}
function dayCountCommands(input: { view: CalendarView; date: string; search: { days?: number; align?: boolean }; route: (search: import("./calendar-navigation").CalendarDestination) => void }): CalendarCommand[] {
  return ([-1, 1] as const).map(direction => ({ id: `days:${direction}`, label: direction > 0 ? "Show more days" : "Show fewer days", disabled: input.view !== "week" || (input.search.days ?? 7) + direction < 1 || (input.search.days ?? 7) + direction > 31, run: () => input.route({ date: input.date, view: input.view, align: input.search.align, days: (input.search.days ?? 7) + direction }) }));
}
function hourHeightCommands(input: { preferences: CalendarPreferences; pending: boolean; onPreferences?: (value: CalendarPreferences) => Promise<unknown>; save: (value: CalendarPreferences) => Promise<void> }): CalendarCommand[] {
  return [{ label: "Taller hours", height: Math.min(120, input.preferences.hourHeight + 8) }, { label: "Denser hours", height: Math.max(32, input.preferences.hourHeight - 8) }, { label: "Reset hour height", height: 48 }].map(({ label, height }) => ({ id: label, label, disabled: !input.onPreferences || input.pending, run: () => void input.save({ ...input.preferences, hourHeight: height }) }));
}
function visibilityCommands(input: { preferences: CalendarPreferences; pending: boolean; onPreferences?: (value: CalendarPreferences) => Promise<unknown>; save: (value: CalendarPreferences) => Promise<void> }): CalendarCommand[] {
  return (["showWeekends", "showDeclined", "showWeekNumbers"] as const).map(key => ({ id: key, label: `${input.preferences[key] ? "Hide" : "Show"} ${key === "showWeekends" ? "weekends" : key === "showDeclined" ? "declined events" : "week numbers"}`, disabled: !input.onPreferences || input.pending, run: () => void input.save({ ...input.preferences, [key]: !input.preferences[key] }) }));
}
function zoneCommands(input: { preferences: CalendarPreferences; pending: boolean; onPreferences?: (value: CalendarPreferences) => Promise<unknown>; save: (value: CalendarPreferences) => Promise<void> }): CalendarCommand[] {
  const columns = input.preferences.timeZoneColumns;
  return columns.map(column => ({ id: `zone:${column.zone}`, label: `Make ${column.label} the primary time zone`, disabled: !input.onPreferences || input.pending || input.preferences.timeZone === column.zone, run: () => void input.save(calendarTravelPreferences(input.preferences, column.zone)) }));
}
function invokeCalendarCommand(commands: CalendarCommand[], id: string, event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.closest('[role="dialog"],[role="alertdialog"],[role="menu"]')) return false;
  const command = commands.find(command => command.id === id);
  if (!command || command.disabled) return false;
  command.run(); return true;
}
