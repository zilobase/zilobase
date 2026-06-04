import { queryOptions } from "@tanstack/react-query"

import { ApiError, apiFetch } from "@/lib/api"

export type UserSettings = {
  workspaceFullWidth: boolean
}

export const defaultUserSettings: UserSettings = {
  workspaceFullWidth: false,
}

export const userSettingsQueryKey = ["user-settings"] as const

export const userSettingsQueryOptions = queryOptions({
  queryKey: userSettingsQueryKey,
  queryFn: async () => {
    try {
      const result = await apiFetch<{ settings: UserSettings }>(
        "/user-settings",
      )

      return result.settings
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return defaultUserSettings
      }

      throw error
    }
  },
})
