import type { Teamspace, TeamspaceAccessMode } from "@zilobase/features/teamspaces"

export type TeamspaceFilter = {
  accessMode: "all" | TeamspaceAccessMode
  membership: "all" | "joined" | "available" | "ownerless"
  query: string
}

export function filterTeamspaces(
  teamspaces: Teamspace[],
  filter: TeamspaceFilter,
) {
  const query = filter.query.trim().toLocaleLowerCase()

  return teamspaces.filter((teamspace) => {
    if (filter.accessMode !== "all" && teamspace.accessMode !== filter.accessMode) {
      return false
    }
    if (filter.membership === "joined" && !teamspace.currentUserRole) return false
    if (filter.membership === "available" && teamspace.currentUserRole) return false
    if (filter.membership === "ownerless" && teamspace.ownerIds?.length !== 0) {
      return false
    }
    if (!query) return true

    return `${teamspace.name} ${teamspace.description ?? ""}`
      .toLocaleLowerCase()
      .includes(query)
  })
}
