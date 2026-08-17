export function describeRouteError(
  error: unknown,
  options: {
    isDesktop: boolean
    selectedServer: unknown
  },
) {
  const selectedServer = Boolean(options.selectedServer)
  const networkError = isNetworkUnavailableError(error)

  if (options.isDesktop) {
    return {
      description: selectedServer
        ? "Your desktop session is still saved. Check your connection, or connect to a different server."
        : "Your desktop session is still saved. Check your connection and try again.",
      showChangeServer: selectedServer,
      title: "Couldn't connect to Zilobase",
    }
  }

  if (networkError) {
    return {
      description: "Check your connection and try again.",
      showChangeServer: false,
      title: "Couldn't connect to Zilobase",
    }
  }

  return {
    description: "Please try again.",
    showChangeServer: false,
    title: "Something went wrong",
  }
}

function isNetworkUnavailableError(error: unknown) {
  return error instanceof Error && error.name === "NetworkUnavailableError"
}
