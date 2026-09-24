export type AiAgentProfileRole = "owner" | "editor" | "user";
export type McpExecutionMode = "automatic" | "always_ask";
export type McpToolClassification = "read" | "write" | "unknown";
export type McpConnectionState =
  | "connecting"
  | "connected"
  | "degraded"
  | "reconnect_required"
  | "disabled";

export type McpConnectionScopeRef =
  | { type: "personal" }
  | { type: "agent"; agentProfileId: string };

export type AiAgentProfileSummary = {
  id: string;
  name: string;
  description: string;
  icon: unknown | null;
  cover?: string | null;
  iconPosition?: "inline" | "top";
  defaultModel: string;
  role: AiAgentProfileRole;
  status: "active" | "archived";
  version: number;
  ownerUserId: string;
  currentRevisionId?: string | null;
  executionDisabledReason?: string | null;
  lastVisitedAt?: string | null;
  updatedAt: string;
};

export type AiAgentProfileDetail = AiAgentProfileSummary & {
  instructions: string;
  access: Array<{
    id: string;
    principalType: "user" | "team";
    principalId: string;
    role: Exclude<AiAgentProfileRole, "owner">;
  }>;
  connections: McpConnectionSummary[];
};

export type McpServerCatalogEntry = {
  id: "github" | "linear" | "figma";
  label: string;
  endpoint: string;
  documentationUrl: string;
  icon: string;
  authMethods: Array<"oauth" | "headers">;
  available: boolean;
  availabilityReason: string | null;
};

export type McpWorkspacePolicy = {
  workspaceId: string;
  customServersEnabled: boolean;
  externalWritesEnabled: boolean;
  installationPolicy: "approved_and_catalog" | "approved_only";
};

export type McpApprovedServer = {
  id: string;
  endpointUrl: string;
  label: string;
};

export type McpToolPolicy = {
  id: string;
  externalName: string;
  description: string;
  schemaHash: string;
  classification: McpToolClassification;
  executionMode: McpExecutionMode;
  enabled: boolean;
  available: boolean;
};

export type McpConnectionSummary = {
  id: string;
  scope: McpConnectionScopeRef;
  agentProfileId: string | null;
  catalogId: string | null;
  serverLabel: string;
  endpointUrl: string;
  authMethod: "oauth" | "headers";
  authenticatedByUserId: string;
  state: McpConnectionState;
  alwaysAllowEnabled: boolean;
  lastDiscoveredAt: string | null;
  lastErrorCode: string | null;
  tools?: McpToolPolicy[];
};

export type McpActivityEntry = {
  id: string;
  eventType: string;
  outcome: string;
  actorUserId: string | null;
  connectionId: string | null;
  providerLabel: string | null;
  toolName: string | null;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};

export type McpDatasetSummary = {
  id: string;
  toolExecutionId: string | null;
  connectionId: string;
  externalToolName: string;
  schema: unknown;
  sample: Array<Record<string, unknown>>;
  rowCount: number;
  byteSize: number;
  truncated: boolean;
  expiresAt: string;
};

export type McpMaterializationJob = {
  id: string;
  jobId: string;
  status: "queued" | "running" | "succeeded" | "partial" | "failed";
  completedRows: number;
  failedRows: number;
  databaseId: string | null;
  dataSourceId: string | null;
};
