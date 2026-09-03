import { libraryViewIds } from "@zilobase/features/user-settings";

import { normalizeTeamSettingsTab } from "@/features/teamspaces/model/team-settings-tabs";

export function validateLoginSearch(search: Record<string, unknown>) {
  return typeof search.returnTo === "string" ? { returnTo: search.returnTo } : {};
}

export function validateSignupSearch(search: Record<string, unknown>) {
  return {
    ...(typeof search.invitation === "string"
      ? { invitation: search.invitation }
      : {}),
    ...(typeof search.returnTo === "string"
      ? { returnTo: search.returnTo }
      : {}),
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

export function validateMailSearch(search: Record<string, unknown>): {
  compose?: boolean;
  view: string;
} {
  return {
    ...(search.compose === true || search.compose === "true"
      ? { compose: true }
      : {}),
    view:
      typeof search.view === "string" && search.view.trim() && search.view.length <= 200
        ? search.view.trim()
        : "inbox",
  };
}

export function validateAiSearch(search: Record<string, unknown>) {
  return {
    thread:
      typeof search.thread === "string" && search.thread.trim()
        ? search.thread.trim()
        : undefined,
  };
}

export function validateMeetingSearch(search: Record<string, unknown>): {
  meeting?: string;
} {
  return typeof search.meeting === "string" && search.meeting.trim()
    ? { meeting: search.meeting.trim() }
    : {};
}

export function validateDatabaseSearch(search: Record<string, unknown>) {
  return {
    view:
      typeof search.view === "string" && search.view.trim()
        ? search.view.trim()
        : undefined,
  };
}

export function validateTeamSettingsSearch(search: Record<string, unknown>) {
  return { tab: normalizeTeamSettingsTab(search.tab) };
}

export function validateTeamspaceSettingsSearch(
  search: Record<string, unknown>,
) {
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
