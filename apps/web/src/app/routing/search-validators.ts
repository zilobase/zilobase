import { libraryViewIds } from "@zilobase/features/user-settings";

export function validateLoginSearch(search: Record<string, unknown>) {
  return {
    ...(typeof search.error === "string" && search.error.length <= 500
      ? { error: search.error }
      : {}),
    ...(typeof search.returnTo === "string" ? { returnTo: search.returnTo } : {}),
    ...pickOAuthLoginSearch(search),
  };
}

function pickOAuthLoginSearch(search: Record<string, unknown>) {
  const keys = [
    "client_id",
    "scope",
    "redirect_uri",
    "state",
    "code_challenge",
    "code_challenge_method",
    "resource",
    "response_type",
    "nonce",
    "prompt",
    "claims",
    "oauth_query",
    "sig",
    "exp",
  ] as const;
  const next: Record<string, string> = {};

  for (const key of keys) {
    const value = search[key];
    if (typeof value === "string" && value.length > 0 && value.length < 4000) {
      next[key] = value;
    }
  }

  return next;
}

export function validateOAuthConsentSearch(search: Record<string, unknown>) {
  return pickOAuthLoginSearch(search);
}

export function validateSignupSearch(search: Record<string, unknown>) {
  return {
    ...(typeof search.invitation === "string" ? { invitation: search.invitation } : {}),
    ...(typeof search.returnTo === "string" ? { returnTo: search.returnTo } : {}),
  };
}

export function validateLibrarySearch(search: Record<string, unknown>): {
  view?: (typeof libraryViewIds)[number];
} {
  return typeof search.view === "string" &&
    libraryViewIds.includes(search.view as (typeof libraryViewIds)[number])
    ? { view: search.view as (typeof libraryViewIds)[number] }
    : {};
}

/** Page links may focus a meeting block or, from AI citations, any block by its ID. */
export function validatePageSearch(search: Record<string, unknown>): {
  meeting?: string;
  block?: string;
} {
  const value = (key: string) =>
    typeof search[key] === "string" && search[key].trim() ? search[key].trim() : undefined;
  const meeting = value("meeting");
  const block = value("block");
  return { ...(meeting ? { meeting } : {}), ...(block ? { block } : {}) };
}

export function validateDatabaseSearch(search: Record<string, unknown>) {
  return {
    view: typeof search.view === "string" && search.view.trim() ? search.view.trim() : undefined,
  };
}

export function validateTeamSettingsSearch(search: Record<string, unknown>) {
  return { tab: normalizeTeamSettingsTab(search.tab) };
}

export function validateTeamspaceSettingsSearch(search: Record<string, unknown>) {
  return {
    tab:
      search.tab === "general" ||
      search.tab === "members" ||
      search.tab === "permissions" ||
      search.tab === "security"
        ? search.tab
        : undefined,
    teamspace:
      typeof search.teamspace === "string" && search.teamspace.trim()
        ? search.teamspace
        : undefined,
  };
}

function calendarSearchString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
function calendarSearchDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}
export function validateCalendarSearch(search: Record<string, unknown>): {
  align?: boolean;
  days?: number;
  view?: "day" | "week" | "month" | "agenda";
  date?: string;
  binding?: string;
  calendar?: string;
  event?: string;
  workspace?: string;
  connection?: "success" | "cancelled";
} {
  const views = ["day", "week", "month", "agenda"] as const;
  return {
    align: search.align === true || search.align === "true" ? true : undefined,
    days:
      Number.isInteger(Number(search.days)) && Number(search.days) >= 1 && Number(search.days) <= 31
        ? Number(search.days)
        : undefined,
    workspace: calendarSearchString(search.workspace),
    connection:
      search.connection === "success" || search.connection === "cancelled"
        ? search.connection
        : undefined,
    view: views.find((view) => view === search.view),
    date: calendarSearchDate(search.date),
    binding: calendarSearchString(search.binding),
    calendar: calendarSearchString(search.calendar),
    event: calendarSearchString(search.event),
  };
}

export const teamSettingsTabValues = ["team", "guests"] as const;

export type TeamSettingsTab = (typeof teamSettingsTabValues)[number];

export function normalizeTeamSettingsTab(value: unknown): TeamSettingsTab {
  return value === "guests" ? "guests" : "team";
}

export type TeamspaceSettingsTab = "general" | "members" | "permissions" | "security";

export function isTeamspaceSettingsTab(value: unknown): value is TeamspaceSettingsTab {
  return (
    value === "general" || value === "members" || value === "permissions" || value === "security"
  );
}

export function validateAiSearch(search: Record<string, unknown>): { thread?: string } {
  return typeof search.thread === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.thread)
    ? { thread: search.thread }
    : {};
}
