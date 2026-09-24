import { useMemo, useState } from "react";
import { useSession } from "@zilobase/features/auth/react";
import { toApiUrl } from "@/platform/network/api";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
  CommandGroup,
} from "@/shared/ui/command";
import { canonicalZone, zoneDescription } from "./time-zone-model";
export function CalendarZonePicker({
  onSelect,
  date = new Date(),
  excluded = [],
  variant = "default",
}: {
  onSelect: (zone: string) => void;
  date?: Date;
  excluded?: string[];
  variant?: "default" | "menu";
}) {
  const { data: session } = useSession();
  const key = JSON.stringify([
    "calendar:recent-zones",
    new URL(toApiUrl("/"), window.location.origin).origin,
    session?.user?.id,
  ]);
  const [query, setQuery] = useState("");
  const recent = useMemo<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
      return Array.isArray(value)
        ? [
            ...new Set(value.filter((v): v is string => typeof v === "string").map(canonicalZone)),
          ].slice(0, 8)
        : [];
    } catch {
      return [];
    }
  }, [key]);
  const zones = useMemo(
    () =>
      [...new Set(["UTC", ...Intl.supportedValuesOf("timeZone")].map(canonicalZone))].map(
        (zone) => ({ zone, ...zoneDescription(zone, date) }),
      ),
    [date.toISOString().slice(0, 10)],
  );
  const selected = new Set(excluded.map(canonicalZone));
  const choose = (zone: string) => {
    if (session?.user?.id) {
      try {
        localStorage.setItem(
          key,
          JSON.stringify([zone, ...recent.filter((v) => v !== zone)].slice(0, 8)),
        );
      } catch {
        /* Storage may be disabled. */
      }
    }
    onSelect(zone);
  };
  const rows = zones.filter(
    (row) =>
      !selected.has(row.zone) &&
      `${row.zone} ${row.name} ${row.city} ${row.offset}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const item = (row: (typeof zones)[number], isRecent = false) => (
    <CommandItem key={row.zone} value={row.zone} onSelect={() => choose(row.zone)}>
      <span className="w-20 shrink-0 text-content-secondary">{row.offset}</span>
      <span>
        {row.name} – {row.city}
      </span>
      {isRecent && (
        <span aria-label="Recently used" className="ml-auto">
          ↶
        </span>
      )}
    </CommandItem>
  );
  return (
    <Command shouldFilter={false} variant={variant}>
      <CommandInput
        autoFocus
        aria-label="Time zone"
        placeholder="Time zone"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No matching time zones.</CommandEmpty>
        {!query && recent.length > 0 && (
          <CommandGroup heading="Recent">
            {recent.flatMap((zone) => {
              const row = rows.find((r) => r.zone === zone);
              return row ? [item(row, true)] : [];
            })}
          </CommandGroup>
        )}
        <CommandGroup>{rows.map((row) => item(row))}</CommandGroup>
      </CommandList>
    </Command>
  );
}
