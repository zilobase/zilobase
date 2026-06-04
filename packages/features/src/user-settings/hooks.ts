import { useMutation, useQuery } from "@tanstack/react-query"

import { useNotelabFeatures } from "../context"
import {
  defaultUserSettings,
  userSettingsQueryKey,
  userSettingsQueryOptions,
  type UserSettings,
} from "./queries"

type UpdateUserSettingsInput = Partial<UserSettings>

export function useUserSettings() {
  const { apiFetch } = useNotelabFeatures()

  return useQuery(userSettingsQueryOptions(apiFetch))
}

export function useUpdateUserSettings() {
  const { apiFetch, queryClient } = useNotelabFeatures()

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
