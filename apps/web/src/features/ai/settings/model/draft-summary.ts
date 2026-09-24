import {
  changedSettingsFields,
  hasAgentConfigurationChanges,
  settingsFieldTab,
  type AgentSettingsState,
} from "@zilobase/features/ai-chat/settings-contract";

export function settingsDraftSummary(state: AgentSettingsState | undefined) {
  const changedFields = state ? changedSettingsFields(state) : [];
  return {
    changedFields,
    changedTabs: [...new Set(changedFields.map(settingsFieldTab))],
    dirty: Boolean(
      state &&
      (hasAgentConfigurationChanges(state.definition, state.saved) || state.review?.fields.length),
    ),
  };
}
