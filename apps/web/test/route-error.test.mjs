export function register({ assert, loadModule, test }) {
  test("route errors keep desktop reconnect copy off the web", async () => {
    const { describeRouteError } = await loadModule("/src/lib/route-error.ts")
    const networkError = Object.assign(new Error("Zilobase is offline."), {
      name: "NetworkUnavailableError",
    })

    assert.deepEqual(
      describeRouteError(new Error("boom"), {
        isDesktop: false,
        selectedServer: null,
      }),
      {
        description: "Please try again.",
        showChangeServer: false,
        title: "Something went wrong",
      },
    )

    assert.deepEqual(
      describeRouteError(networkError, {
        isDesktop: false,
        selectedServer: null,
      }),
      {
        description: "Check your connection and try again.",
        showChangeServer: false,
        title: "Couldn't connect to Zilobase",
      },
    )

    assert.deepEqual(
      describeRouteError(networkError, {
        isDesktop: true,
        selectedServer: null,
      }),
      {
        description:
          "Your desktop session is still saved. Check your connection and try again.",
        showChangeServer: false,
        title: "Couldn't connect to Zilobase",
      },
    )

    assert.deepEqual(
      describeRouteError(new Error("boom"), {
        isDesktop: true,
        selectedServer: { apiOrigin: "https://api.zilobase.com" },
      }),
      {
        description:
          "Your desktop session is still saved. Check your connection, or connect to a different server.",
        showChangeServer: true,
        title: "Couldn't connect to Zilobase",
      },
    )
  })
}
