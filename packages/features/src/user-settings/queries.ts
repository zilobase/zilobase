import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../context"

import type { EmbeddedItemsOpenAs } from "../pages/queries"

export type UserSettings = {
  embeddedItemsOpenAs: EmbeddedItemsOpenAs
  pageFullWidth: boolean
}

export const defaultUserSettings: UserSettings = {
  embeddedItemsOpenAs: "sidepanel",
  pageFullWidth: false,
}

export const userSettingsQueryKey = ["user-settings"] as const

export const userSettingsQueryOptions = (apiFetch: ApiFetcher) =>
  queryOptions({
    queryKey: userSettingsQueryKey,
    queryFn: async ({ signal }) => {
      try {
        const result = await apiFetch<{ settings: UserSettings }>(
          "/user-settings",
          { signal },
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
