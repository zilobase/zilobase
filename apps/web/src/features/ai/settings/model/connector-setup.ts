import type {
  McpApprovedServer,
  McpConnectionSummary,
  McpServerCatalogEntry,
} from "@zilobase/features/ai-chat";

type SetupInput = {
  provider: string;
  scope: string;
  approved?: McpApprovedServer[];
  catalog?: McpServerCatalogEntry[];
  connections?: McpConnectionSummary[];
  gmail?: { status: string; providerConfigured?: boolean };
};

export function describeConnectorSetup(input: SetupInput) {
  const approvedId = input.provider.startsWith("approved:") ? input.provider.slice(9) : null;
  const entry = connectorEntry(input, approvedId);
  const existing = input.connections?.find((connection) =>
    approvedId
      ? connection.endpointUrl === (entry && "endpointUrl" in entry ? entry.endpointUrl : undefined)
      : connection.catalogId === input.provider,
  );
  const status =
    input.provider === "gmail"
      ? gmailStatus(input.scope, input.gmail)
      : mcpStatus(input.provider, entry, existing);
  return { approvedId, existing, ...status };
}

function connectorEntry(input: SetupInput, approvedId: string | null) {
  if (approvedId)
    return availableApprovedEntry(input.approved?.find((entry) => entry.id === approvedId));
  return input.catalog?.find((entry) => entry.id === input.provider);
}

function availableApprovedEntry(entry: McpApprovedServer | undefined) {
  return entry && { ...entry, available: true, availabilityReason: null };
}

function gmailStatus(scope: string, gmail: SetupInput["gmail"]) {
  const connected = gmail?.status === "connected";
  const unavailable = scope !== "personal" || gmail?.providerConfigured === false;
  const reason =
    scope !== "personal"
      ? "Gmail is currently available to personal Ask AI. Delegated Gmail access is not supported."
      : "Connection unavailable on this server.";
  return {
    connected,
    unavailable,
    label: "Gmail",
    description: statusDescription(connected, unavailable, reason),
  };
}

function mcpStatus(
  provider: string,
  entry: { available: boolean; label: string; availabilityReason: string | null } | undefined,
  existing: McpConnectionSummary | undefined,
) {
  const connected = existing?.state === "connected";
  const unavailable = !entry?.available;
  return {
    connected,
    unavailable,
    label: entry?.label ?? provider,
    description: statusDescription(
      connected,
      unavailable,
      entry?.availabilityReason ?? "Connection unavailable on this server.",
    ),
  };
}

function statusDescription(connected: boolean, unavailable: boolean, reason: string) {
  if (connected) return "Connected";
  return unavailable ? reason : "Connect your account to continue.";
}

export function connectorActionState(
  setup: { connected: boolean; unavailable: boolean; label: string },
  scope: string,
  role: string | undefined,
  connecting: boolean,
) {
  return {
    disabled: setup.connected || connecting || setup.unavailable || !mayConnect(scope, role),
    label: setup.connected ? "Connected" : connecting ? "Connecting…" : `Connect ${setup.label}`,
  };
}

function mayConnect(scope: string, role: string | undefined) {
  return scope === "personal" || role === "owner" || role === "editor";
}
