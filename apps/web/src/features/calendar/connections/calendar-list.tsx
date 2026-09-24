import { useCalendarWorkspace } from "../workspace/calendar-workspace";
import { useRef, useState } from "react";
import {
  orderCalendarSources,
  moveCalendarSource,
  type CalendarRecord,
  type CalendarPreferences,
  type CalendarColor,
} from "@zilobase/features/calendar";
import {
  EyeIcon,
  EyeOffIcon,
  MoreHorizontalIcon,
  CalendarIcon,
  CheckIcon,
  ArrowUpRightIcon,
  TrashIcon,
} from "@/shared/components/icons";
import { GoogleIcon } from "@/shared/components/google-icon";
import { PALETTE } from "@/shared/lib/color-tokens";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/shared/ui/sidebar";
import {
  SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME,
  SidebarNavItemAction,
} from "@/shared/ui/sidebar-nav-item-action";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/shared/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/shared/ui/alert-dialog";
import { getApiErrorMessage } from "@/platform/network/api";
import { calendarSelectionKey } from "./calendar-selection";
const colors: CalendarColor[] = ["red", "orange", "yellow", "green", "blue", "purple", "gray"];
const colorName = (color: CalendarColor) => (color === "gray" ? "Grey" : PALETTE[color].name);
type Props = {
  calendars: CalendarRecord[];
  allCalendars: CalendarRecord[];
  preferences: CalendarPreferences;
  onPreferences: (preferences: CalendarPreferences) => Promise<unknown>;
  disabled: boolean;
};

export function CalendarList(props: Props) {
  return (
    <SidebarMenu>
      {orderCalendarSources(props.calendars, props.preferences.calendarOrder ?? [], (calendar) =>
        calendarSelectionKey(calendar.bindingId, calendar.id),
      )
        .filter(
          (calendar) =>
            !props.preferences.removedCalendarKeys?.includes(
              calendarSelectionKey(calendar.bindingId, calendar.id),
            ),
        )
        .map((calendar) => (
          <CalendarRow
            key={calendarSelectionKey(calendar.bindingId, calendar.id)}
            {...props}
            calendar={calendar}
          />
        ))}
    </SidebarMenu>
  );
}

function CalendarRow({
  calendar,
  calendars,
  allCalendars,
  preferences,
  onPreferences,
  disabled,
}: Props & { calendar: CalendarRecord }) {
  const workspace = useCalendarWorkspace();
  const key = calendarSelectionKey(calendar.bindingId, calendar.id),
    hidden = preferences.hiddenCalendarKeys.includes(key);
  const siblings = calendarRowSiblings(calendars, preferences);
  const position = siblings.indexOf(key);
  const color = preferences.calendarColors?.[key] ?? "blue";
  const [menuOpen, setMenuOpen] = useState(false);
  const [removing, setRemoving] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const row = useRef<HTMLButtonElement>(null),
    completed = useRef(false);
  const save = (next: CalendarPreferences) => {
    void onPreferences(next).catch(() => {});
  };
  const toggle = () => save(toggleHiddenCalendar(preferences, key, hidden));
  return (
    <SidebarMenuItem>
      <div
        data-calendar-row
        data-menu-open={menuOpen || undefined}
        className="group/nav-row relative flex items-center rounded-md pr-1.5 hover:bg-action-neutral-hover focus-within:bg-action-neutral-hover data-[menu-open]:bg-action-neutral-hover active:bg-action-neutral-pressed! has-[>button:active]:bg-action-neutral-pressed!"
      >
        <SidebarMenuButton
          ref={row}
          disabled={disabled}
          onClick={() =>
            workspace.showSource({ bindingId: calendar.bindingId, calendarId: calendar.id })
          }
          title={calendar.name}
          className={`${SIDEBAR_NAV_ROW_INTERACTION_CLASS_NAME} min-w-0 flex-1 bg-transparent! pr-1!`}
        >
          <CalendarIcon className={PALETTE[color].textClass} />
          <span
            className={`min-w-0 flex-1 truncate ${hidden ? "text-content-secondary!" : "text-content-primary"}`}
          >
            {calendar.name}
          </span>
          {preferences.defaultCalendarKey === key ? (
            <span className="shrink-0 overflow-visible! whitespace-nowrap text-xs text-content-secondary">
              Default
            </span>
          ) : null}
        </SidebarMenuButton>
        <CalendarRowMenu
          calendar={calendar}
          color={color}
          disabled={disabled}
          keyName={key}
          position={position}
          siblings={siblings}
          preferences={preferences}
          allCalendars={allCalendars}
          save={save}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          removing={removing}
          setError={setError}
          setRemoving={setRemoving}
        />
        <SidebarNavItemAction
          variant="menu"
          disabled={disabled}
          style={{ position: "relative", top: "auto", right: "auto", translate: "none" }}
          className="shrink-0 opacity-100 after:hidden!"
          aria-pressed={!hidden}
          aria-label={hidden ? `Show ${calendar.name}` : `Hide ${calendar.name}`}
          onClick={toggle}
        >
          {hidden ? <EyeOffIcon /> : <EyeIcon />}
        </SidebarNavItemAction>
      </div>
      <CalendarRowRemoveDialog
        calendar={calendar}
        removing={removing}
        pending={pending}
        disabled={disabled}
        error={error}
        preferences={preferences}
        calendarKey={key}
        completed={completed}
        row={row}
        onPreferences={onPreferences}
        setRemoving={setRemoving}
        setPending={setPending}
        setError={setError}
      />
    </SidebarMenuItem>
  );
}
function CalendarRowRemoveDialog({
  calendar,
  removing,
  pending,
  disabled,
  error,
  preferences,
  calendarKey,
  completed,
  row,
  onPreferences,
  setRemoving,
  setPending,
  setError,
}: {
  calendar: CalendarRecord;
  removing: boolean;
  pending: boolean;
  disabled: boolean;
  error: unknown;
  preferences: CalendarPreferences;
  calendarKey: string;
  completed: { current: boolean };
  row: { current: HTMLButtonElement | null };
  onPreferences: (preferences: CalendarPreferences) => Promise<unknown>;
  setRemoving: (open: boolean) => void;
  setPending: (value: boolean) => void;
  setError: (error: unknown) => void;
}) {
  return (
    <AlertDialog
      open={removing}
      onOpenChange={(open) => {
        if (!pending) setRemoving(open);
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusAfterCalendarRemove(completed.current, row.current, calendar.bindingId);
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this calendar from Zilobase?</AlertDialogTitle>
          <AlertDialogDescription>
            You can restore ‘{calendar.name}’ in Calendar settings. This won’t delete it or its
            events from Google Calendar. To temporarily hide it, use the eye icon next to the
            calendar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-feedback-error-text">
            {getApiErrorMessage(error)}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending || disabled}
            onClick={(event) => {
              event.preventDefault();
              void removeCalendarFromList({
                pending,
                preferences,
                calendarKey,
                completed,
                calendar,
                onPreferences,
                setRemoving,
                setPending,
                setError,
              });
            }}
          >
            {pending ? "Removing…" : "Remove calendar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
function focusAfterCalendarRemove(
  completed: boolean,
  row: HTMLButtonElement | null,
  bindingId: string,
) {
  if (!completed) row?.focus();
  else document.getElementById(`calendar-account-${bindingId}`)?.focus();
}
async function removeCalendarFromList(input: {
  pending: boolean;
  preferences: CalendarPreferences;
  calendarKey: string;
  completed: { current: boolean };
  calendar: CalendarRecord;
  onPreferences: (preferences: CalendarPreferences) => Promise<unknown>;
  setRemoving: (open: boolean) => void;
  setPending: (value: boolean) => void;
  setError: (error: unknown) => void;
}) {
  if (input.pending) return;
  input.setPending(true);
  input.setError(undefined);
  try {
    await input.onPreferences({
      ...input.preferences,
      removedCalendarKeys: [
        ...new Set([...(input.preferences.removedCalendarKeys ?? []), input.calendarKey]),
      ],
    });
    input.completed.current = true;
    input.setRemoving(false);
    requestAnimationFrame(() =>
      document.getElementById(`calendar-account-${input.calendar.bindingId}`)?.focus(),
    );
  } catch (error) {
    input.setError(error);
  } finally {
    input.setPending(false);
  }
}
function calendarRowSiblings(calendars: CalendarRecord[], preferences: CalendarPreferences) {
  return orderCalendarSources(calendars, preferences.calendarOrder ?? [], (item) =>
    calendarSelectionKey(item.bindingId, item.id),
  )
    .filter(
      (item) =>
        !preferences.removedCalendarKeys?.includes(calendarSelectionKey(item.bindingId, item.id)),
    )
    .map((item) => calendarSelectionKey(item.bindingId, item.id));
}
function toggleHiddenCalendar(preferences: CalendarPreferences, key: string, hidden: boolean) {
  return {
    ...preferences,
    hiddenCalendarKeys: hidden
      ? preferences.hiddenCalendarKeys.filter((id) => id !== key)
      : [...preferences.hiddenCalendarKeys, key],
  };
}
function CalendarRowMenu({
  calendar,
  color,
  disabled,
  keyName,
  position,
  siblings,
  preferences,
  allCalendars,
  save,
  menuOpen,
  setMenuOpen,
  removing,
  setError,
  setRemoving,
}: {
  calendar: CalendarRecord;
  color: CalendarColor;
  disabled: boolean;
  keyName: string;
  position: number;
  siblings: string[];
  preferences: CalendarPreferences;
  allCalendars: CalendarRecord[];
  save: (next: CalendarPreferences) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  removing: boolean;
  setError: (error: unknown) => void;
  setRemoving: (open: boolean) => void;
}) {
  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} defaultSubDisplayMode="inline">
      <DropdownMenuTrigger asChild>
        <SidebarNavItemAction
          variant="menu"
          style={{ position: "relative", top: "auto", right: "auto", translate: "none" }}
          className="w-0 shrink-0 overflow-hidden opacity-0 transition-[width,opacity] group-hover/nav-row:w-5 group-focus-within/nav-row:w-5 group-focus-within/nav-row:opacity-100 group-data-[menu-open]/nav-row:w-5 after:hidden!"
          aria-label={`Options for ${calendar.name}`}
        >
          <MoreHorizontalIcon />
        </SidebarNavItemAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        className="w-64"
        onCloseAutoFocus={(event) => {
          if (removing) event.preventDefault();
        }}
      >
        <DropdownMenuSub title="Color">
          <DropdownMenuSubTrigger disabled={disabled}>
            <span className={`size-4 rounded-sm ${PALETTE[color].swatchClass}`} />
            <span className="flex-1">Color</span>
            <span className="text-content-secondary">{colorName(color)}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {colors.map((option) => (
              <DropdownMenuItem
                key={option}
                disabled={disabled}
                onSelect={() =>
                  save({
                    ...preferences,
                    calendarColors: { ...preferences.calendarColors, [keyName]: option },
                  })
                }
              >
                <span className={`size-4 rounded-sm ${PALETTE[option].swatchClass}`} />
                <span className="flex-1">{colorName(option)}</span>
                {option === color && <CheckIcon />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={disabled || position <= 0}
          onSelect={() =>
            save({
              ...preferences,
              calendarOrder: moveCalendarSource(
                preferences.calendarOrder ?? [],
                siblings,
                keyName,
                -1,
              ),
            })
          }
        >
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={disabled || position === siblings.length - 1}
          onSelect={() =>
            save({
              ...preferences,
              calendarOrder: moveCalendarSource(
                preferences.calendarOrder ?? [],
                siblings,
                keyName,
                1,
              ),
            })
          }
        >
          Move down
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={
            disabled || !calendar.permissions.write || preferences.defaultCalendarKey === keyName
          }
          onSelect={() => save({ ...preferences, defaultCalendarKey: keyName })}
        >
          <CalendarIcon />
          Make default calendar
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={disabled}
          onSelect={() =>
            save({
              ...preferences,
              hiddenCalendarKeys: allCalendars
                .map((c) => calendarSelectionKey(c.bindingId, c.id))
                .filter((id) => id !== keyName),
            })
          }
        >
          <EyeIcon />
          Show only this calendar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a
            href="https://calendar.google.com/calendar/u/0/r/settings"
            target="_blank"
            rel="noopener noreferrer"
          >
            <GoogleIcon />
            <span className="flex-1">Google Calendar settings</span>
            <ArrowUpRightIcon />
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={disabled}
          onSelect={() => {
            setError(undefined);
            setRemoving(true);
          }}
        >
          <TrashIcon />
          Remove calendar from list
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
