import type { SearchResultMetadata } from "./controls";
export type AppSearchResult = Partial<SearchResultMetadata> & {
  emoji: string | null;
  id: string;
  path: string;
  title: string;
  type: "database" | "page";
  excerpt?: string | null;
  match?: SearchMatchProvenance;
};

export type AppSearchResultType = AppSearchResult["type"];
export type SearchMode = "keyword" | "semantic";
export type SearchMatchProvenance = {
  chunkId: string;
  pageId: string;
  kind: "title" | "body" | "property";
  headingPath: string[];
  blockId?: string;
  blockIndex?: number;
  propertyId?: string;
  databaseId?: string;
  dataSourceId?: string;
  recordId?: string;
};
export type SearchMetadata = {
  mode: SearchMode;
  indexAvailability: "disabled" | "unavailable" | "building" | "ready";
  degradationReason?:
    | "configuration"
    | "workspace_disabled"
    | "index_building"
    | "query_empty"
    | "provider_timeout"
    | "provider_unavailable"
    | "capacity"
    | "retrieval_budget";
};

export function searchAvailabilityNotice(metadata?: SearchMetadata): string | undefined {
  if (!metadata || metadata.mode !== "semantic") return;
  if (metadata.degradationReason === "workspace_disabled")
    return "Semantic search is disabled in this workspace. Enable it in workspace settings, or use keyword search.";
  if (metadata.indexAvailability === "disabled")
    return "Semantic search is not configured on this server. Keyword search remains available.";
  if (metadata.indexAvailability === "building")
    return "Semantic search is still indexing this workspace. Try again when indexing finishes, or use keyword search.";
  if (metadata.degradationReason && metadata.degradationReason !== "query_empty")
    return "Semantic search is temporarily unavailable or degraded. These results may be incomplete. Try again or use keyword search.";
  if (metadata.indexAvailability === "unavailable")
    return "Semantic search is currently unavailable. Try again or use keyword search.";
}
export type WorkspaceSearchSettings = {
  workspaceId: string;
  enabled: boolean;
  canManage: boolean;
  capability: { available: boolean; reason: string | null };
  profile: { id: string; model: string; dimensions: number };
  progress: { pending: number; running: number; ready: number; failed: number };
  backfillComplete: boolean;
  lastIndexedAt: string | null;
  lastErrorCode: string | null;
};
