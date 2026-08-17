export function register({ assert, loadModule, test }) {
  test("published share routes stay public when auth is missing or broken", async () => {
    const { decidePublishedShareAccess } = await loadModule(
      "/src/lib/published-share-access.ts",
    )

    assert.deepEqual(
      await decidePublishedShareAccess({
        getSession: async () => ({ user: null }),
        getWorkspaces: async () => {
          throw new Error("should not list workspaces")
        },
        isPublished: async () => true,
      }),
      { type: "public" },
    )

    assert.deepEqual(
      await decidePublishedShareAccess({
        getSession: async () => ({ user: null }),
        getWorkspaces: async () => [],
        isPublished: async () => false,
      }),
      { type: "login" },
    )

    assert.deepEqual(
      await decidePublishedShareAccess({
        getSession: async () => {
          throw new Error("session unavailable")
        },
        getWorkspaces: async () => {
          throw new Error("should not list workspaces")
        },
        isPublished: async () => true,
      }),
      { type: "public" },
    )

    await assert.rejects(
      () =>
        decidePublishedShareAccess({
          getSession: async () => {
            throw new Error("session unavailable")
          },
          getWorkspaces: async () => [],
          isPublished: async () => false,
        }),
      /session unavailable/,
    )
  })

  test("signed-in published share routes fall back to public when workspaces fail", async () => {
    const { decidePublishedShareAccess } = await loadModule(
      "/src/lib/published-share-access.ts",
    )

    assert.deepEqual(
      await decidePublishedShareAccess({
        getSession: async () => ({ user: { id: "user-1" } }),
        getWorkspaces: async () => [{ id: "workspace-1" }],
        isPublished: async () => false,
      }),
      { type: "app" },
    )

    assert.deepEqual(
      await decidePublishedShareAccess({
        getSession: async () => ({ user: { id: "user-1" } }),
        getWorkspaces: async () => [],
        isPublished: async () => true,
      }),
      { type: "onboarding" },
    )

    assert.deepEqual(
      await decidePublishedShareAccess({
        getSession: async () => ({ user: { id: "user-1" } }),
        getWorkspaces: async () => {
          throw new Error("workspaces unavailable")
        },
        isPublished: async () => true,
      }),
      { type: "public" },
    )

    await assert.rejects(
      () =>
        decidePublishedShareAccess({
          getSession: async () => ({ user: { id: "user-1" } }),
          getWorkspaces: async () => {
            throw new Error("workspaces unavailable")
          },
          isPublished: async () => false,
        }),
      /workspaces unavailable/,
    )
  })
}
