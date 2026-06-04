import { useMutation, useQuery } from "@tanstack/react-query"

import {
  defaultUserSettings,
  userSettingsQueryKey,
  userSettingsQueryOptions,
  type UserSettings,
} from "@/features/user-settings/queries"
import { apiFetch } from "@/lib/api"
import { queryClient } from "@/lib/query-client"

type UpdateUserSettingsInput = Partial<UserSettings>

export function useUserSettings() {
  return useQuery(userSettingsQueryOptions)
}

export function useUpdateUserSettings() {
  return useMutation({
    mutationFn: async (patch: UpdateUserSettingsInput) => {
      const result = await apiFetch<{ settings: UserSettings }>(
        "/user-settings",
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      )

      return result.settings
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: userSettingsQueryKey })

      const previous =
        queryClient.getQueryData<UserSettings>(userSettingsQueryKey)

      queryClient.setQueryData<UserSettings>(
        userSettingsQueryKey,
        (current) => ({
          workspaceFullWidth: false,
          ...(current ?? {}),
          ...patch,
        }),
      )

      return { previous }
    },
    onError: (_error, _patch, context) => {
      queryClient.setQueryData(
        userSettingsQueryKey,
        context?.previous ?? defaultUserSettings,
      )
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(userSettingsQueryKey, settings)
    },
  })
}
