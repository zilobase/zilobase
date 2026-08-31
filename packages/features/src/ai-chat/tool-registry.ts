export type AgentToolEffect = "analysis" | "artifact" | "read" | "write";
export type AgentToolRisk = "forbidden" | "none" | "review";

export type AgentToolDescriptor = {
  capability: string;
  effect: AgentToolEffect;
  name: string;
  risk: AgentToolRisk;
  title: string;
  version: number;
};

export const AGENT_TOOL_DESCRIPTORS = [
  descriptor("searchWorkspace", "workspace.search", "read", "none", "Search Zilobase"),
  descriptor("readWorkspacePage", "page.read", "read", "none", "Read Zilobase page"),
  descriptor("queryWorkspaceDatabase", "database.query", "read", "none", "Query Zilobase database"),
  descriptor("readPageComments", "page.comments.read", "read", "none", "Read page comments"),
  descriptor("analyzeDataTable", "data.analyze", "analysis", "none", "Analyze data table"),
  descriptor("createDownloadableArtifact", "artifact.create", "artifact", "none", "Create downloadable file"),
  descriptor("proposePageContentUpdate", "page.content.update", "write", "review", "Update page content"),
  descriptor("updateWorkspacePage", "page.content.update", "write", "review", "Update Zilobase page", 2),
  descriptor("buildDatabaseFromBlueprint", "page-database.configure", "write", "none", "Build database", 4),
  descriptor("createPage", "page-database.configure", "write", "none", "Create page", 2),
  descriptor("createDatabase", "page-database.configure", "write", "none", "Create database", 3),
  descriptor("embedDatabaseInPage", "page-database.configure", "write", "none", "Embed database in page", 2),
  descriptor("linkDatabaseInPage", "page-database.configure", "write", "none", "Link database in sidebar"),
  descriptor("createDatabaseProperty", "page-database.configure", "write", "none", "Add database property"),
  descriptor("updateDatabaseProperty", "page-database.configure", "write", "review", "Update database property"),
  descriptor("createDatabaseView", "page-database.configure", "write", "none", "Create database view"),
  descriptor("updateDatabaseView", "page-database.configure", "write", "review", "Update database view"),
  descriptor("updateDataSource", "page-database.configure", "write", "review", "Update data source"),
  descriptor("createDatabaseRow", "page-database.configure", "write", "none", "Add database row", 2),
  descriptor("setDatabaseCellValue", "page-database.configure", "write", "none", "Set cell value"),
] as const satisfies readonly AgentToolDescriptor[];

export const AGENT_TOOL_REGISTRY_VERSION = Math.max(
  ...AGENT_TOOL_DESCRIPTORS.map((descriptor) => descriptor.version),
);

export type RegisteredAgentToolName = (typeof AGENT_TOOL_DESCRIPTORS)[number]["name"];

export function getAgentToolDescriptor(name: string) {
  return AGENT_TOOL_DESCRIPTORS.find((descriptor) => descriptor.name === name) ?? null;
}

function descriptor(
  name: string,
  capability: string,
  effect: AgentToolEffect,
  risk: AgentToolRisk,
  title: string,
  version = 1,
): AgentToolDescriptor {
  return { capability, effect, name, risk, title, version };
}
