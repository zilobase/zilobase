export function register({ assert, loadModule, test }) {
  test("teamspace creation requires a workspace and normalizes the shared draft", async () => {
    const { getTeamspaceCreationInput } = await loadModule(
      "/src/features/teamspaces/model/teamspace-creation.ts",
    );
    const draft = {
      accessMode: "closed",
      description: " Project team ",
      name: " Team ",
      workspaceId: "workspace",
    };
    assert.deepEqual(getTeamspaceCreationInput(draft), {
      accessMode: "closed",
      description: "Project team",
      name: "Team",
      workspaceId: "workspace",
    });
    assert.equal(getTeamspaceCreationInput({ ...draft, workspaceId: null }), null);
    assert.equal(getTeamspaceCreationInput({ ...draft, name: " " }), null);
    assert.equal(getTeamspaceCreationInput({ ...draft, description: " " }).description, null);
  });
  test("teamspace management distinguishes owner rights from workspace recovery rights", async () => {
    const { getTeamspaceManagementPermissions } = await loadModule(
      "/src/features/teamspaces/model/teamspace-settings.ts",
    );
    const space = { currentUserRole: "owner", isDefault: false, ownerIds: [] };
    assert.deepEqual(getTeamspaceManagementPermissions(space, false), {
      canManage: true,
      canSetDefault: false,
      canRecoverOwner: false,
    });
    assert.deepEqual(getTeamspaceManagementPermissions(space, true), {
      canManage: true,
      canSetDefault: true,
      canRecoverOwner: true,
    });
    assert.deepEqual(
      getTeamspaceManagementPermissions({ ...space, isDefault: true, ownerIds: undefined }, true),
      { canManage: true, canSetDefault: false, canRecoverOwner: false },
    );
    assert.equal(
      getTeamspaceManagementPermissions({ ...space, currentUserRole: "member" }, false).canManage,
      false,
    );
  });
}
