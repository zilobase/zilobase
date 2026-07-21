import { Toolkit, type ConnectedAccount } from "@zilobase/toolkit";
import { vercelProvider } from "@zilobase/toolkit/vercel";
import type { ToolSet } from "ai";

import { getStringEnv, type RuntimeEnv } from "../config";

export const TOOLKIT_CHAT_CONNECTORS = [
  "gmail",
  "github",
  "google-calendar",
  "google-drive",
  "slack",
  "linear",
] as const;

export type ToolkitChatConnector = (typeof TOOLKIT_CHAT_CONNECTORS)[number];

export function isToolkitConfigured(env: RuntimeEnv) {
  return Boolean(getStringEnv(env, "TOOLKIT_API_KEY")?.trim());
}

export function getToolkitUserId(workspaceId: string, userId: string) {
  return `zilobase:${workspaceId}:${userId}`;
}

export function createToolkit(env: RuntimeEnv) {
  const apiKey = getStringEnv(env, "TOOLKIT_API_KEY")?.trim();
  const baseUrl = getStringEnv(env, "TOOLKIT_BASE_URL")?.trim();

  if (!apiKey) {
    throw new ToolkitConfigurationError();
  }

  return new Toolkit({
    apiKey,
    baseUrl: baseUrl || undefined,
    provider: vercelProvider(),
  });
}

export async function buildToolkitTools(input: {
  env: RuntimeEnv;
  signal?: AbortSignal;
  sources: readonly string[];
  userId: string;
  workspaceId: string;
}): Promise<ToolSet> {
  if (!isToolkitConfigured(input.env)) {
    return {};
  }

  const toolkit = createToolkit(input.env);
  const toolkitUserId = getToolkitUserId(input.workspaceId, input.userId);
  const accounts = await toolkit.connectedAccounts.list(toolkitUserId, {
    limit: 100,
    signal: input.signal,
  });
  const selectedConnectors = selectToolkitConnectors(
    accounts.items,
    input.sources,
  );

  if (selectedConnectors.length === 0) {
    return {};
  }

  const tools = await toolkit.tools.get(
    toolkitUserId,
    {
      connectors: [...new Set(selectedConnectors)],
      read: "all",
      write: [],
    },
    { signal: input.signal },
  );

  return tools;
}

function isActiveAccount(account: ConnectedAccount) {
  return account.status === "active";
}

export function selectToolkitConnectors(
  accounts: readonly ConnectedAccount[],
  sources: readonly string[],
) {
  const connectedConnectorIds = new Set(
    accounts.filter(isActiveAccount).map((account) => account.connectorId),
  );

  return [
    ...new Set(
      (sources.length > 0 ? sources : TOOLKIT_CHAT_CONNECTORS).filter(
        (connectorId) => connectedConnectorIds.has(connectorId),
      ),
    ),
  ];
}

export class ToolkitConfigurationError extends Error {
  readonly status = 503;

  constructor() {
    super("Toolkit is not configured for this Zilobase deployment.");
    this.name = "ToolkitConfigurationError";
  }
}
