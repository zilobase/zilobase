import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import { beginClientWrite, clientMutation, runClientMutation } from "../shared/operation-mutation";

import type { UserSettings } from "./contracts";
import { defaultUserSettings, userSettingsQueryKey } from "./queries";

export type UpdateUserSettingsOperationInput = Partial<UserSettings>;
export type UpdateUserSettingsOperationResult = UserSettings;

export function updateUserSettings(
  context: ClientOperationContext,
  input: UpdateUserSettingsOperationInput,
): Promise<UpdateUserSettingsOperationResult> {
  return runClientMutation(context, input, (context) => {
    const { apiFetch, queryClient } = context;
    const operationScope = captureClientOperation(context);
    const write = beginClientWrite(context, userSettingsQueryKey);

    return clientMutation({
      mutationFn: async (patch: UpdateUserSettingsOperationInput) => {
        const result = await apiFetch<{ settings: UserSettings }>("/user-settings", {
          method: "PATCH",
          body: JSON.stringify(patch),
        });

        return result.settings;
      },
      onMutate: async (patch) => {
        await queryClient.cancelQueries({ queryKey: userSettingsQueryKey });
        operationScope.assertCurrent();

        const previous = queryClient.getQueryData<UserSettings>(userSettingsQueryKey);

        queryClient.setQueryData<UserSettings>(userSettingsQueryKey, (current) => ({
          ...defaultUserSettings,
          ...current,
          ...patch,
        }));

        return { previous };
      },
      onError: (_error, _patch, context) => {
        if (!write.isCurrent()) return;
        queryClient.setQueryData(userSettingsQueryKey, context?.previous ?? defaultUserSettings);
      },
      onSettled: () =>
        write.isCurrent()
          ? queryClient.invalidateQueries({ queryKey: userSettingsQueryKey })
          : undefined,
      onSuccess: (settings) => {
        if (!write.isCurrent()) return;
        queryClient.setQueryData(userSettingsQueryKey, settings);
      },
    });
  });
}
