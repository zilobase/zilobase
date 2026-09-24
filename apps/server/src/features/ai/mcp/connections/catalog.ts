import type { McpServerCatalogEntry } from "@zilobase/features/ai-chat/mcp-contract";

export const MCP_SERVER_CATALOG: readonly McpServerCatalogEntry[] = [
  {
    authMethods: ["oauth", "headers"],
    available: true,
    availabilityReason: null,
    documentationUrl:
      "https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/set-up-the-github-mcp-server",
    endpoint: "https://api.githubcopilot.com/mcp/",
    icon: "/icons/integrations/github.svg",
    id: "github",
    label: "GitHub",
  },
  {
    authMethods: ["oauth", "headers"],
    available: true,
    availabilityReason: null,
    documentationUrl: "https://linear.app/docs/mcp",
    endpoint: "https://mcp.linear.app/mcp",
    icon: "/icons/integrations/linear.svg",
    id: "linear",
    label: "Linear",
  },
  {
    authMethods: ["oauth", "headers"],
    available: false,
    availabilityReason:
      "Figma must approve Zilobase as a supported remote MCP client before this connection can be used.",
    documentationUrl:
      "https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/",
    endpoint: "https://mcp.figma.com/mcp",
    icon: "/icons/integrations/figma.svg",
    id: "figma",
    label: "Figma",
  },
] as const;

export function getMcpCatalogEntry(id: string | null | undefined) {
  return MCP_SERVER_CATALOG.find((entry) => entry.id === id) ?? null;
}
