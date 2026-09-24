import { useState } from "react";
import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
export function RecurrenceScope({
  value,
  onChange,
  allowFollowing = true,
}: {
  allowFollowing?: boolean;
  value: "occurrence" | "following" | "series";
  onChange: (value: "occurrence" | "following" | "series") => void;
}) {
  return (
    <Label className="grid min-w-0 gap-2">
      Apply to
      <Select value={value} onValueChange={(v) => onChange(v as typeof value)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="occurrence">This event</SelectItem>
          <SelectItem value="following" disabled={!allowFollowing}>
            This and following events
          </SelectItem>
          <SelectItem value="series">Entire series</SelectItem>
        </SelectContent>
      </Select>
    </Label>
  );
}
export function RecurrenceControls({
  initial,
  onChange,
}: {
  initial?: string[];
  onChange: (rules: string[] | undefined) => void;
}) {
  const [frequency, setFrequency] = useState(initial?.length ? "preserve" : "none"),
    [interval, setInterval] = useState(1),
    [end, setEnd] = useState("never"),
    [count, setCount] = useState(10),
    [until, setUntil] = useState("");
  function update(f = frequency, i = interval, e = end, c = count, u = until) {
    onChange(
      f === "preserve"
        ? undefined
        : f === "none"
          ? []
          : [
              `RRULE:FREQ=${f};INTERVAL=${Math.max(1, i)}${e === "count" ? `;COUNT=${Math.max(1, c)}` : e === "date" && u ? `;UNTIL=${u.replaceAll("-", "")}T235959Z` : ""}`,
            ],
    );
  }
  return (
    <div className="grid gap-2">
      <Label className="grid min-w-0 gap-2">
        Repeat
        <Select
          value={frequency}
          onValueChange={(v) => {
            setFrequency(v);
            update(v);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {initial?.length ? (
              <SelectItem value="preserve">Keep existing recurrence</SelectItem>
            ) : null}
            <SelectItem value="none">Does not repeat</SelectItem>
            {["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].map((f) => (
              <SelectItem key={f} value={f}>
                {f[0] + f.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
      {frequency === "preserve" && (
        <p className="text-xs text-content-secondary">
          Imported rules are preserved. Following-event changes reset later exceptions.
        </p>
      )}
      {!["none", "preserve"].includes(frequency) && (
        <>
          <Label className="grid min-w-0 gap-2">
            Repeat every
            <Input
              type="number"
              min={1}
              max={365}
              value={interval}
              onChange={(e) => {
                const v = Number(e.target.value);
                setInterval(v);
                update(frequency, v);
              }}
            />
          </Label>
          <Label className="grid min-w-0 gap-2">
            Ends
            <Select
              value={end}
              onValueChange={(v) => {
                setEnd(v);
                update(frequency, interval, v);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="count">After occurrences</SelectItem>
                <SelectItem value="date">On date</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          {end === "count" && (
            <Input
              aria-label="Occurrence count"
              type="number"
              min={1}
              max={10000}
              value={count}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCount(v);
                update(frequency, interval, end, v);
              }}
            />
          )}
          {end === "date" && (
            <Input
              aria-label="Recurrence end date"
              type="date"
              required
              value={until}
              onChange={(e) => {
                setUntil(e.target.value);
                update(frequency, interval, end, count, e.target.value);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
