export type AgentEffectBase = {
  effectId: string;
  toolCallId: string;
  workspaceId: string;
};

export type AgentLiveEffect =
  | (AgentEffectBase & {
      databaseId: string;
      kind: "database-seed";
      payload: unknown;
    })
  | (AgentEffectBase & {
      delta: unknown;
      kind: "nav-delta";
    })
  | (AgentEffectBase & {
      detail: unknown;
      kind: "page-upsert";
      pageId: string;
    })
  | (AgentEffectBase & {
      afterHeading?: string;
      databaseId: string;
      kind: "page-embed";
      pageId: string;
      showTitle?: boolean;
    });

export function isAgentLiveEffect(value: unknown): value is AgentLiveEffect {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const effect = value as Record<string, unknown>;

  return (
    typeof effect.effectId === "string" &&
    typeof effect.toolCallId === "string" &&
    typeof effect.workspaceId === "string" &&
    (effect.kind === "database-seed" ||
      effect.kind === "nav-delta" ||
      effect.kind === "page-upsert" ||
      effect.kind === "page-embed")
  );
}
