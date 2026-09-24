import type { AgentCitation } from "@zilobase/features/ai-chat";

export type AgentCitationSidePaneTarget = {
  id: string;
  type: "database" | "page";
};

function readRouteId(url: string, routePrefix: "/d/" | "/p/") {
  if (!url.startsWith(routePrefix)) return null;

  const encodedId = url.slice(routePrefix.length).split(/[?#/]/, 1)[0];
  if (!encodedId) return null;

  try {
    return decodeURIComponent(encodedId);
  } catch {
    return null;
  }
}

export function getAgentCitationSidePaneTarget(
  citation: Pick<AgentCitation, "source" | "url">,
): AgentCitationSidePaneTarget | null {
  if (citation.source === "page" || citation.source === "page-comment") {
    const pageId = readRouteId(citation.url, "/p/");
    return pageId ? { id: pageId, type: "page" } : null;
  }

  if (citation.source === "database") {
    const databaseId = readRouteId(citation.url, "/d/");
    return databaseId ? { id: databaseId, type: "database" } : null;
  }

  return null;
}

export function canOpenCitationInApp(
  target: AgentCitationSidePaneTarget | null,
  event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
): target is AgentCitationSidePaneTarget {
  return Boolean(
    target &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey,
  );
}
