export type RetrievalCandidate = {
  excerpt: string | null;
  score: number;
  sourceId: string;
  sourceType: "database" | "page";
};

export interface RetrievalIndex {
  readonly mode: "hybrid" | "lexical" | "unavailable";
  search(input: {
    limit: number;
    query: string;
    userId: string;
    workspaceId: string;
  }): Promise<RetrievalCandidate[]>;
}

export class UnavailableSemanticRetrievalIndex implements RetrievalIndex {
  readonly mode = "unavailable" as const;

  async search(): Promise<RetrievalCandidate[]> {
    return [];
  }
}

export function reciprocalRankFuse(
  rankedLists: RetrievalCandidate[][],
  limit: number,
  rankConstant = 60,
) {
  const merged = new Map<string, RetrievalCandidate>();
  for (const list of rankedLists) {
    list.forEach((candidate, index) => {
      const key = `${candidate.sourceType}:${candidate.sourceId}`;
      const score = 1 / (rankConstant + index + 1);
      const existing = merged.get(key);
      merged.set(key, {
        ...candidate,
        score: (existing?.score ?? 0) + score,
      });
    });
  }
  return [...merged.values()]
    .sort((first, second) => second.score - first.score)
    .slice(0, Math.max(0, limit));
}
