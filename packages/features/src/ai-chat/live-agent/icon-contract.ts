export const AGENT_ICON_NAMES = [
  "rocket",
  "calendar",
  "check-circle",
  "bug",
  "users",
  "target",
  "chart",
  "book",
  "briefcase",
  "database",
  "list",
  "kanban",
  "file",
  "place",
] as const;

export const AGENT_ICON_COLORS = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const;

export type AgentIconName = (typeof AGENT_ICON_NAMES)[number];
export type AgentIconColor = (typeof AGENT_ICON_COLORS)[number];

export type AgentIconSpec = {
  color: AgentIconColor;
  name: AgentIconName;
};
