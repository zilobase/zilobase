import type { UserSettings } from "./contracts";
import { queryOptions } from "@tanstack/react-query"

import type { ApiFetcher } from "../shared/api-fetcher"


import { defaultSidebarConfig, normalizeSidebarConfig } from "./sidebar-config";

export const defaultUserSettings: UserSettings = {
  embeddedItemsOpenAs: "sidepanel",
  pageFullWidth: false,
  sidebarConfig: defaultSidebarConfig,
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

        return {
          ...defaultUserSettings,
          ...result.settings,
          sidebarConfig: normalizeSidebarConfig(result.settings.sidebarConfig),
        }
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
