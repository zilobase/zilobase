export type AgentToolPresentation = {
  progressPhrases: string[];
  title: string;
};

export function resolveAgentToolPresentation(input: {
  part: { title?: string };
  title?: string;
  toolName: string;
}): AgentToolPresentation {
  const title =
    input.part.title?.trim() ||
    input.title?.trim() ||
    humanizeToolName(input.toolName);

  return {
    progressPhrases: [`Running ${title}`],
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
