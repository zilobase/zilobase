import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../context"

export type UserSettings = {
  workspaceFullWidth: boolean
}

export const defaultUserSettings: UserSettings = {
  workspaceFullWidth: false,
}

export const userSettingsQueryKey = ["user-settings"] as const

export const userSettingsQueryOptions = (apiFetch: ApiFetcher) =>
  queryOptions({
    queryKey: userSettingsQueryKey,
    queryFn: async () => {
      try {
        const result = await apiFetch<{ settings: UserSettings }>(
          "/user-settings",
        )

        return result.settings
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          error.status === 401
        ) {
          return defaultUserSettings
        }

        throw error
      }
    },
  })
