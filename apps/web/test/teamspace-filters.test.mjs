export function register({ assert, loadModule, test }) {
  test("teamspace administration filters by text, access, and membership", async () => {
    const { filterTeamspaces } = await loadModule(
      "/src/pages/settings/teamspace-filters.ts",
    )
    const teamspaces = [
      {
        accessMode: "open",
        currentUserRole: "member",
        description: "Product delivery",
        id: "engineering",
        name: "Engineering",
        ownerIds: ["owner-1"],
      },
      {
        accessMode: "private",
        currentUserRole: null,
        description: "Roadmap",
        id: "strategy",
        name: "Strategy",
        ownerIds: [],
      },
    ]

    assert.deepEqual(
      filterTeamspaces(teamspaces, {
        accessMode: "all",
        membership: "all",
        query: "delivery",
      }).map((teamspace) => teamspace.id),
      ["engineering"],
    )
    assert.deepEqual(
      filterTeamspaces(teamspaces, {
        accessMode: "private",
        membership: "ownerless",
        query: "",
      }).map((teamspace) => teamspace.id),
      ["strategy"],
    )
    assert.deepEqual(
      filterTeamspaces(teamspaces, {
        accessMode: "all",
        membership: "joined",
        query: "",
      }).map((teamspace) => teamspace.id),
      ["engineering"],
    )
  })
}
