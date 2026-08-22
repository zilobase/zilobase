export const teamSettingsTabValues = ["team", "guests"] as const

export type TeamSettingsTab = (typeof teamSettingsTabValues)[number]

export function normalizeTeamSettingsTab(value: unknown): TeamSettingsTab {
  return value === "guests" ? "guests" : "team"
}

export function getTeamSettingsTabCounts(input: {
  guests: number
  members: number
  pendingGuestRequests: number
  pendingInvitations: number
}) {
  return {
    guests: input.guests + input.pendingGuestRequests,
    team: input.members + input.pendingInvitations,
  }
}
