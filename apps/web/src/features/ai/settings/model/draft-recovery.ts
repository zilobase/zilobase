import type { AgentSettingsState } from "@zilobase/features/ai-chat";

export function settingsDraftVersionChanged(
  current: AgentSettingsState | undefined,
  incoming: AgentSettingsState,
) {
  return Boolean(
    current &&
    (current.draftVersion !== incoming.draftVersion || current.version !== incoming.version),
  );
}

/** Parsing failures are handled by the storage lifecycle; valid local edits survive version conflicts. */
export function recoverSettingsDraft(incoming: AgentSettingsState, serialized: string | null) {
  const local = JSON.parse(serialized ?? "null");
  if (!local?.patch || !Object.keys(local.patch).length) return null;
  return {
    patch: local.patch as Partial<AgentSettingsState["definition"]>,
    state: {
      ...incoming,
      definition: { ...incoming.definition, ...local.patch },
    },
    conflict:
      local.baseVersion !== incoming.baseVersion || local.draftVersion !== incoming.draftVersion,
  };
}
