export type AppSearchResult = {
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
