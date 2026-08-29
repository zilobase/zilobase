export type DatabaseChangedArea =
  | "dataSource"
  | "database"
  | "views"
  | "properties"
  | "rows"
  | "values";

export type DatabaseDelta = {
  dataSource?: Record<string, unknown>;
  database?: Record<string, unknown>;
  properties?: Array<Record<string, unknown>>;
  removedPagePropertyIds?: string[];
  removedPropertyIds?: string[];
  removedRowIds?: string[];
  removedViewIds?: string[];
  views?: Array<Record<string, unknown>>;
  rows?: Array<Record<string, unknown>>;
  values?: Array<{
    createdAt?: string;
    id?: string;
    propertyId: string;
    updatedAt: string;
    value: unknown;
    pageId: string;
  }>;
};

export type DatabaseMutationResponse = {
  changed: DatabaseChangedArea[];
  committedAt: string;
  databaseId: string;
  delta: DatabaseDelta;
  mutationId: string;
  requiresRefetch?: true;
  version: number;
};

export type DatabaseRealtimeMutationEvent = DatabaseMutationResponse & {
  actorId: string;
  protocolVersion: 1;
  type: "database.mutation";
};
