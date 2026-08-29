export function register({ assert, loadModule, test }) {
  test("teamspace sidebar permissions follow role and invite policy", async () => {
    const { getTeamspaceSidebarPermissions } = await loadModule(
      "/src/features/teamspaces/model/teamspace-sidebar-permissions.ts",
    )

    assert.deepEqual(
      getTeamspaceSidebarPermissions(
        {
          currentUserRole: "owner",
          invitePolicy: "owners",
          isDefault: false,
        },
        false,
      ),
      {
        canArchive: true,
        canInvite: true,
        canLeave: true,
        canManage: true,
      },
    )

    assert.deepEqual(
      getTeamspaceSidebarPermissions(
        {
          currentUserRole: "member",
          invitePolicy: "owners",
          isDefault: false,
        },
        false,
      ),
      {
        canArchive: false,
        canInvite: false,
        canLeave: true,
        canManage: false,
      },
    )

    assert.equal(
      getTeamspaceSidebarPermissions(
        {
          currentUserRole: "member",
          invitePolicy: "owners_and_members",
          isDefault: false,
        },
        false,
      ).canInvite,
      true,
    )
  })

  test("default teamspaces cannot be left or archived from the sidebar", async () => {
    const { getTeamspaceSidebarPermissions } = await loadModule(
      "/src/features/teamspaces/model/teamspace-sidebar-permissions.ts",
    )
    const permissions = getTeamspaceSidebarPermissions(
      {
        currentUserRole: "owner",
        invitePolicy: "owners",
        isDefault: true,
      },
      true,
    )

    assert.equal(permissions.canArchive, false)
    assert.equal(permissions.canLeave, false)
  })
}
