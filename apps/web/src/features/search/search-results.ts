import type { AppSearchResult } from "@zilobase/features/search";

export type SearchResult =
  | AppSearchResult
  | { emoji: null; id: string; path: string; title: string; type: "agent" };

export function combineSearchResults(
  agents: readonly { id: string; name: string }[],
  results: readonly AppSearchResult[],
  query: string,
): SearchResult[] {
  return [
    ...agents
      .filter((agent) => !query || agent.name.toLowerCase().includes(query.toLowerCase()))
      .map((agent) => ({
        emoji: null,
        id: agent.id,
        path: "Agents",
        title: agent.name,
        type: "agent" as const,
      })),
    ...results,
  ];
}

export function getSearchResultDestination(result: Pick<SearchResult, "type" | "id">) {
  if (result.type === "database")
    return {
      to: "/d/$databaseId" as const,
      params: { databaseId: result.id },
      search: { view: undefined },
    };
  if (result.type === "agent")
    return { to: "/agents/$agentId" as const, params: { agentId: result.id } };
  return { to: "/p/$pageId" as const, params: { pageId: result.id } };
}
