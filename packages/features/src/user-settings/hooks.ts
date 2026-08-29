import { useMutation, useQuery } from "@tanstack/react-query"

import { useZilobaseFeatures } from "../shared/context"
import {
  defaultUserSettings,
  userSettingsQueryKey,
  userSettingsQueryOptions,
  type UserSettings,
} from "./queries"

type UpdateUserSettingsInput = Partial<UserSettings>

export function useUserSettings() {
  const { apiFetch } = useZilobaseFeatures()

  return useQuery(userSettingsQueryOptions(apiFetch))
}

export function useUpdateUserSettings() {
  const { apiFetch, queryClient } = useZilobaseFeatures()

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
          ...defaultUserSettings,
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
