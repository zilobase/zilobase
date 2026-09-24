import type { AgentSettingsDefinition, AiAgentProfileDetail } from "@zilobase/features/ai-chat";
type Profile = Pick<
  AiAgentProfileDetail,
  "cover" | "icon" | "iconPosition" | "name" | "description"
>;

export function agentMetadata(profile: Profile, definition: AgentSettingsDefinition | undefined) {
  const source = definition
    ? {
        ...definition,
        iconPosition: definition.iconPosition ?? profile.iconPosition,
        name: definition.name ?? profile.name,
        description: definition.description ?? profile.description,
      }
    : profile;
  return {
    cover: source.cover ?? "",
    icon: typeof source.icon === "string" ? String(source.icon) : "",
    iconPosition: source.iconPosition,
    title: source.name,
    description: source.description,
  };
}
