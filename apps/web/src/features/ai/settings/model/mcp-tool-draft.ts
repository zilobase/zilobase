import type { AgentSettingsDefinition, McpToolPolicy } from "@zilobase/features/ai-chat";
type DraftTool = AgentSettingsDefinition["connectors"][number]["tools"][number];

export function changeDraftToolPolicy(
  tools: DraftTool[],
  tool: McpToolPolicy,
  changes: Partial<McpToolPolicy>,
) {
  const current = tools.find((item) => item.toolId === tool.id);
  return [
    ...tools.filter((item) => item.toolId !== tool.id),
    {
      toolId: tool.id,
      classification: current?.classification ?? tool.classification,
      enabled: current?.enabled ?? false,
      executionMode: current?.executionMode ?? "always_ask",
      ...changes,
    },
  ];
}

export function savedToolPolicy(tool: McpToolPolicy, changes: Partial<McpToolPolicy>) {
  return {
    classification: changes.classification ?? tool.classification,
    enabled: changes.enabled ?? tool.enabled,
    executionMode: changes.executionMode ?? tool.executionMode,
    toolId: tool.id,
  };
}

export function canEditMcpToolPolicy(
  hasDraft: boolean,
  isAuthenticator: boolean,
  canDisconnect: boolean,
) {
  return (hasDraft || isAuthenticator) && canDisconnect;
}

export function isConnectorDraftChanged(
  review: import("@zilobase/features/ai-chat").AgentSettingsReview | null | undefined,
  connectionId: string,
  selected: AgentSettingsDefinition["connectors"][number] | undefined,
) {
  if (!review?.fields.includes("connectors")) return undefined;
  return (
    JSON.stringify(review.before.connectors.find((item) => item.connectionId === connectionId)) !==
      JSON.stringify(selected) || undefined
  );
}
