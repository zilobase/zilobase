import { useRef, useState } from "react";
import type { CalendarPreferences } from "@zilobase/features/calendar";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";
import { CalendarZonePicker } from "./calendar-zone-picker";
import {
  canonicalZone,
  zoneColumns,
  withZoneColumns,
  zoneCity,
  saveTravelZone,
} from "./time-zone-model";
import { getApiErrorMessage } from "@/platform/network/api";
export function CalendarTimeZones({
  value,
  onChange,
  travelZone,
  onRestore,
  date = new Date(),
}: {
  value: CalendarPreferences;
  onChange: (value: CalendarPreferences) => void | Promise<unknown>;
  travelZone?: string | null;
  onRestore?: () => void;
  date?: Date;
}) {
  const [picker, setPicker] = useState<string | null>(null),
    [menu, setMenu] = useState<string | null>(null),
    [rename, setRename] = useState<string | null>(null),
    [label, setLabel] = useState("");
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const nextDialog = useRef<{ type: "picker" | "rename"; zone: string; label: string } | null>(
    null,
  );
  const drag = useRef<string | null>(null),
    root = useRef<HTMLDivElement>(null);
  const saved = zoneColumns(value);
  const matchesTravel = (zone: string) =>
    Boolean(travelZone && canonicalZone(zone) === canonicalZone(travelZone));
  const columns = travelZone
    ? [
        saved.find((c) => matchesTravel(c.zone)) ?? {
          zone: travelZone,
          label: zoneCity(travelZone),
        },
        ...saved.filter((c) => !matchesTravel(c.zone)),
      ].slice(0, 4)
    : saved;
  const commit = async (update: () => CalendarPreferences, restore = false) => {
    if (pending) return;
    setPending(true);
    try {
      await onChange(update());
      if (restore) onRestore?.();
      setPicker(null);
      setRename(null);
      setError("");
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setPending(false);
    }
  };
  const focus = () =>
    root.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  return (
    <div ref={root} className="flex h-8 items-center" data-calendar-zone-labels>
      <Popover
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setPicker(null);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-7 w-6 shrink-0 p-0"
            aria-label="Add time zone"
            disabled={pending || saved.length >= 4 || !!travelZone}
            onClick={() => setPicker("add")}
          >
            +
          </Button>
        </PopoverTrigger>
        <PopoverContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focus();
          }}
          align="start"
          className="w-[min(36rem,90vw)]"
          padding="none"
          variant="menu"
          viewport="wide"
        >
          <CalendarZonePicker
            date={date}
            excluded={saved.filter((c) => c.zone !== picker).map((c) => c.zone)}
            onSelect={(zone) => {
              if (picker === null) return;
              void commit(() =>
                withZoneColumns(
                  value,
                  picker === "add"
                    ? [...saved, { zone, label: zoneCity(zone) }]
                    : saved.map((c) => (c.zone === picker ? { zone, label: zoneCity(zone) } : c)),
                ),
              );
            }}
            variant="menu"
          />
          {error && <p role="alert">{error}</p>}
        </PopoverContent>
      </Popover>
      {[...columns].reverse().map((column) => (
        <DropdownMenu
          key={column.zone}
          open={menu === column.zone}
          onOpenChange={(open) => setMenu(open ? column.zone : null)}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Time zone ${column.zone}`}
              title={column.zone}
              className="w-14 truncate rounded px-1 py-1 text-xs text-content-secondary hover:bg-surface-muted"
              disabled={pending}
              draggable={!travelZone}
              onDragStart={() => {
                drag.current = column.zone;
              }}
              onDragEnd={() => {
                drag.current = null;
              }}
              onDragOver={(event) => {
                if (drag.current && !travelZone) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const source = drag.current;
                drag.current = null;
                if (!source || source === column.zone || travelZone) return;
                void commit(() => {
                  const next = [...saved],
                    from = next.findIndex((c) => c.zone === source),
                    to = next.findIndex((c) => c.zone === column.zone);
                  if (from < 0 || to < 0) return value;
                  const [entry] = next.splice(from, 1);
                  next.splice(to, 0, entry!);
                  return withZoneColumns(value, next);
                });
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu(column.zone);
              }}
            >
              {column.label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            onCloseAutoFocus={(event) => {
              const next = nextDialog.current;
              if (!next) return;
              event.preventDefault();
              nextDialog.current = null;
              if (next.type === "picker") setPicker(next.zone);
              else {
                setLabel(next.label);
                setRename(next.zone);
              }
            }}
          >
            {matchesTravel(column.zone) ? (
              <>
                <DropdownMenuItem onSelect={onRestore}>Restore saved time zone</DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void commit(() => saveTravelZone(value, column.zone, true), true)}
                >
                  Add as primary time zone
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    void commit(() => saveTravelZone(value, column.zone, false), true)
                  }
                >
                  Add as secondary time zone
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem
                  disabled={!!travelZone}
                  onSelect={() => {
                    nextDialog.current = { type: "picker", ...column };
                  }}
                >
                  Change time zone
                  <span className="ml-4 text-content-secondary">{zoneCity(column.zone)}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!!travelZone}
                  onSelect={() => {
                    nextDialog.current = { type: "rename", ...column };
                  }}
                >
                  Rename
                </DropdownMenuItem>
                {column.zone !== value.timeZone && (
                  <DropdownMenuItem
                    disabled={!!travelZone}
                    onSelect={() => void commit(() => saveTravelZone(value, column.zone, true))}
                  >
                    Make time zone primary
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={column.zone === value.timeZone}
                  onSelect={() =>
                    void commit(() =>
                      withZoneColumns(
                        value,
                        saved.filter((c) => c.zone !== column.zone),
                      ),
                    )
                  }
                >
                  Remove time zone from list
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
      <Dialog
        open={rename !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setRename(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focus();
          }}
        >
          <DialogTitle>Rename time zone</DialogTitle>
          <Input
            aria-label="Time zone label"
            maxLength={32}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <Button
            type="button"
            disabled={pending || !label.trim()}
            onClick={() =>
              void commit(() =>
                withZoneColumns(
                  value,
                  saved.map((c) => (c.zone === rename ? { ...c, label: label.trim() } : c)),
                ),
              )
            }
          >
            Save label
          </Button>
        </DialogContent>
      </Dialog>
      {error && picker === null && (
        <span
          role="alert"
          className="absolute top-8 z-30 max-w-72 rounded bg-surface-overlay p-2 text-xs"
        >
          {error}
          <Button type="button" variant="ghost" onClick={() => setError("")}>
            Dismiss
          </Button>
        </span>
      )}
    </div>
  );
}
