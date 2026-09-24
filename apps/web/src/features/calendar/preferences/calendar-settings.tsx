import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { CalendarPreferences } from "@zilobase/features/calendar";

import { SettingsRow, SettingsSectionLayout } from "@/features/settings";
import { Minus, Plus, RotateCcw } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Spinner } from "@/shared/ui/spinner";
import { Switch } from "@/shared/ui/switch";

import { CalendarBufferSettings } from "./calendar-buffer-preferences";
import { CalendarTimeZones } from "./calendar-time-zones";
import { requestCalendarNotificationPermission } from "../reminders/notification-delivery";

const weekDays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const togglePreferences = [
  [
    "promptTimeZoneChanges",
    "Time zone changes",
    "Ask before updating when the system time zone changes.",
  ],
  ["showWeekends", "Weekends", "Show Saturday and Sunday in calendar views."],
  ["showDeclined", "Declined events", "Keep declined invitations visible."],
  ["showWeekNumbers", "Week numbers", "Show the week number alongside calendar dates."],
  ["remindersEnabled", "Upcoming event reminders", "Show reminders before events begin."],
] as const;

export function CalendarSettings({
  value,
  onSave,
  pending,
}: {
  value: CalendarPreferences;
  onSave: (value: CalendarPreferences) => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [permission, setPermission] = useState("");

  return (
    <SettingsSectionLayout
      action={
        <Button disabled={pending} form="calendar-preferences-form" type="submit">
          {pending ? <Spinner /> : null}
          {pending ? "Saving..." : "Save preferences"}
        </Button>
      }
      description="Choose calendar navigation, density, regional formatting, and reminders."
      title="Calendar preferences"
    >
      <form
        className="grid gap-2"
        id="calendar-preferences-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
        }}
      >
        <SettingsRow title="Today navigation">
          <Select
            value={draft.todayAlignment ?? "week"}
            onValueChange={(todayAlignment) =>
              setDraft({
                ...draft,
                todayAlignment: todayAlignment as "week" | "start",
              })
            }
          >
            <SelectTrigger aria-label="Today navigation" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Go to today&apos;s week</SelectItem>
              <SelectItem value="start">Align today at the start</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          description="How early an upcoming meeting appears in the preview."
          title="Meeting preview"
        >
          <Input
            aria-label="Meeting preview minutes"
            className="w-28"
            max={1440}
            min={0}
            onChange={(event) =>
              setDraft({
                ...draft,
                meetingPreviewMinutes: Number(event.target.value),
              })
            }
            type="number"
            value={draft.meetingPreviewMinutes ?? 15}
          />
        </SettingsRow>

        <SettingsRow title="Open locations in">
          <Select
            value={draft.mapsProvider ?? "google"}
            onValueChange={(mapsProvider) =>
              setDraft({
                ...draft,
                mapsProvider: mapsProvider as "google" | "apple",
              })
            }
          >
            <SelectTrigger aria-label="Maps preference" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="google">Google Maps</SelectItem>
              <SelectItem value="apple">Apple Maps</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow
          description="Controls the vertical density of day and week views."
          title="Hour height"
        >
          <div className="flex items-center gap-1">
            <Button
              aria-label="Decrease hour height"
              disabled={draft.hourHeight <= 32}
              onClick={() => setDraft({ ...draft, hourHeight: Math.max(32, draft.hourHeight - 8) })}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <Minus />
            </Button>
            <Input
              aria-label="Hour height in pixels"
              className="w-20 text-center"
              max={120}
              min={32}
              onChange={(event) => {
                const hourHeight = Number(event.target.value);
                if (Number.isInteger(hourHeight) && hourHeight >= 32 && hourHeight <= 120) {
                  setDraft({ ...draft, hourHeight });
                }
              }}
              type="number"
              value={draft.hourHeight}
            />
            <Button
              aria-label="Increase hour height"
              disabled={draft.hourHeight >= 120}
              onClick={() =>
                setDraft({ ...draft, hourHeight: Math.min(120, draft.hourHeight + 8) })
              }
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <Plus />
            </Button>
            <Button
              aria-label="Reset hour height"
              disabled={draft.hourHeight === 48}
              onClick={() => setDraft({ ...draft, hourHeight: 48 })}
              size="icon-sm"
              title="Reset hour height"
              type="button"
              variant="ghost"
            >
              <RotateCcw />
            </Button>
          </div>
        </SettingsRow>

        <SettingsRow title="Time zones">
          <CalendarTimeZones onChange={setDraft} value={draft} />
        </SettingsRow>

        <SettingsRow title="Week starts on">
          <Select
            value={String(draft.weekStartsOn)}
            onValueChange={(day) =>
              setDraft({
                ...draft,
                weekStartsOn: Number(day) as CalendarPreferences["weekStartsOn"],
              })
            }
          >
            <SelectTrigger aria-label="Week starts on" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weekDays.map((day, index) => (
                <SelectItem key={day} value={String(index)}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow title="Time format">
          <Select
            value={draft.timeFormat}
            onValueChange={(timeFormat) =>
              setDraft({
                ...draft,
                timeFormat: timeFormat as "12" | "24",
              })
            }
          >
            <SelectTrigger aria-label="Time format" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12">12 hour</SelectItem>
              <SelectItem value="24">24 hour</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        {togglePreferences.map(([key, title, description]) => (
          <SettingsRow description={description} key={key} title={title}>
            <Switch
              aria-label={title}
              checked={draft[key]}
              onCheckedChange={(checked) => setDraft({ ...draft, [key]: checked })}
            />
          </SettingsRow>
        ))}

        <ReminderPermissionSettings
          enabled={Boolean(draft.remindersEnabled)}
          onPermission={setPermission}
          permission={permission}
        />
        <CalendarBufferSettings />

        <SettingsRow title="Related settings">
          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/settings/preferences">Appearance</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/settings/profile">Profile</Link>
            </Button>
          </div>
        </SettingsRow>
      </form>
    </SettingsSectionLayout>
  );
}

function ReminderPermissionSettings({
  enabled,
  permission,
  onPermission,
}: {
  enabled: boolean;
  permission: string;
  onPermission: (value: string) => void;
}) {
  if (!enabled) return null;

  return (
    <SettingsRow
      description={
        permission
          ? permission === "granted"
            ? "System notifications are enabled."
            : "In-app reminders remain enabled."
          : "Reminders work in Zilobase; system notifications are optional."
      }
      title="System notifications"
    >
      <Button
        onClick={() => {
          void requestCalendarNotificationPermission()
            .then(onPermission)
            .catch(() => onPermission("denied"));
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        Allow notifications
      </Button>
    </SettingsRow>
  );
}
