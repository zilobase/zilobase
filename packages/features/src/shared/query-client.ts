import { QueryClient } from "@tanstack/react-query"

function getErrorStatus(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status
  }

  return null
}

export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 1) {
    return false
  }

  const status = getErrorStatus(error)

  if (status && status >= 400 && status < 500) {
    return false
  }

  return true
}

export function createZilobaseQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Persisted desktop queries may be restored for as long as a session is
        // valid. Browser clients still release the data when the tab closes.
        gcTime: 24 * 24 * 60 * 60_000,
        refetchOnWindowFocus: false,
        retry: shouldRetryQuery,
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  })
}
