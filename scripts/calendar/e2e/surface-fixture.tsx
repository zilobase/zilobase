import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarSurface,
  type CalendarItem,
  type CalendarView,
  type CalendarDisplayPreferences,
} from "@/shared/components/calendar";
import "@/shared/styles/global.css";
import "@/app/styles.css";
const defaults: CalendarDisplayPreferences = {
  timeZone: "Asia/Kolkata",
  timeFormat: "24",
  weekStartsOn: 1,
  showWeekends: true,
  showWeekNumbers: false,
  secondaryTimeZones: [],
};
const sample: CalendarItem[] = [
  {
    id: "meeting",
    title: "Plain meeting",
    start: { dateTime: "2026-09-09T04:30:00Z", timeZone: "Asia/Kolkata" },
    end: { dateTime: "2026-09-09T05:30:00Z", timeZone: "Asia/Kolkata" },
    editable: true,
  },
  {
    id: "holiday",
    title: "Plain holiday",
    start: { date: "2026-09-09" },
    end: { date: "2026-09-11" },
    editable: true,
  },
  {
    id: "readonly",
    title: "Read only",
    start: { date: "2026-09-08" },
    end: { date: "2026-09-09" },
  },
];
function Fixture({ name }: { name: string }) {
  const [preferences, setPreferences] = useState(defaults);
  const [date, setDate] = useState("2026-09-09"),
    [view, setView] = useState<CalendarView>("week");
  const [items, setItems] = useState(sample),
    [action, setAction] = useState("");
  return (
    <section
      aria-label={name}
      className="flex h-screen min-w-0 flex-1 flex-col bg-surface-canvas text-content-primary"
    >
      <nav>
        {(["day", "week", "month"] as const).map((view) => (
          <button key={view} onClick={() => setView(view)}>
            {view}
          </button>
        ))}
      </nav>
      <nav>
        <button
          onClick={() =>
            setPreferences((p) => ({ ...p, hourHeight: p.hourHeight === 96 ? 48 : 96 }))
          }
        >
          Toggle density
        </button>
        <button onClick={() => setPreferences((p) => ({ ...p, showWeekends: !p.showWeekends }))}>
          Toggle weekends
        </button>
        <button
          onClick={() =>
            setPreferences((p) => ({
              ...p,
              timeZone: p.timeZone === "UTC" ? "Asia/Kolkata" : "UTC",
            }))
          }
        >
          Toggle timezone
        </button>
        <button onClick={() => setPreferences((p) => ({ ...p, weekStartsOn: 0 }))}>
          Start Sunday
        </button>
      </nav>
      <output>
        {date} {action}
      </output>
      <CalendarSurface
        date={date}
        view={view}
        preferences={preferences}
        items={items}
        onNavigate={(date, view) => {
          setDate(date);
          setView(view);
        }}
        onSelect={(item) => setAction(`selected:${item.id}`)}
        onCreate={(day, hour, duration) => setAction(`created:${day}:${hour}:${duration}`)}
        onChange={(item) => {
          setItems((items) => items.map((current) => (current.id === item.id ? item : current)));
          setAction(`changed:${item.id}`);
        }}
        onError={(error) => setAction(error.message)}
      />
    </section>
  );
}
createRoot(document.getElementById("root")!).render(
  <main className="flex">
    <Fixture name="First calendar" />
    <Fixture name="Second calendar" />
  </main>,
);
