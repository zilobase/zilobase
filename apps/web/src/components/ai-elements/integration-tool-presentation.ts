import { integrationIcons } from "@/lib/integration-icons";

export type IntegrationToolSource = keyof typeof integrationIcons;

export type IntegrationToolPresentation = {
  progressPhrases: string[];
  source?: IntegrationToolSource;
  title: string;
};

export function resolveIntegrationToolPresentation(input: {
  part: { title?: string };
  source?: IntegrationToolSource;
  title?: string;
  toolName: string;
}): IntegrationToolPresentation {
  const title =
    input.part.title?.trim() ||
    input.title?.trim() ||
    humanizeToolName(input.toolName);

  return {
    progressPhrases: [`Running ${title}`],
    source: input.source,
    title,
  };
}

function humanizeToolName(toolName: string) {
  const value = toolName
    .replace(/[._-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim();

  return value
    ? `${value.charAt(0).toUpperCase()}${value.slice(1)}`
    : "Tool call";
}
