import { buildDatabaseMarkdown } from "@zilobase/page-context/build-database-markdown";
import { stripDatabasePayload } from "@zilobase/page-context/strip-database-payload";
import type { DatabaseContextPayload } from "@zilobase/page-context/types";

import { canAccessDatabaseRecord } from "../../access";
import { getDatabaseRecord } from "../../databases/access";
import {
  getDatabasePayload,
  getDatabaseSchemaPayload,
} from "../../databases/core";

export type AgentDatabaseDescriptor = {
  id: string;
  name: string;
  dataSources: Array<{
    id: string;
    name: string;
    parentDatabaseId: string;
    rowCount?: number;
    views: Array<{
      id: string;
      name: string;
      type: string;
    }>;
  }>;
};

export type AgentDatabaseContext = {
  descriptor: AgentDatabaseDescriptor;
  markdown: string;
};

export async function loadAgentDatabaseContext(input: {
  databaseId: string;
  userId: string;
  workspaceId: string;
}): Promise<AgentDatabaseContext | null> {
  const state = await loadAgentDatabaseState(input, true);
  if (!state) return null;

  return {
    descriptor: describeDatabase(
      state.hostSchema,
      state.dataSourceSchemas,
      true,
    ),
    markdown: buildDatabaseMarkdown(
      state.hostSchema,
      state.dataSourceSchemas,
    ),
  };
}

export async function loadAgentDatabaseDescriptor(input: {
  databaseId: string;
  userId: string;
  workspaceId: string;
}): Promise<AgentDatabaseDescriptor | null> {
  const state = await loadAgentDatabaseState(input, false);
  return state
    ? describeDatabase(state.hostSchema, state.dataSourceSchemas, false)
    : null;
}

async function loadAgentDatabaseState(
  input: { databaseId: string; userId: string; workspaceId: string },
  includeRows: boolean,
) {
  const record = await getDatabaseRecord(input.databaseId);
  if (
    !record ||
    record.workspaceId !== input.workspaceId ||
    !(await canAccessDatabaseRecord(record, input.userId, "view"))
  ) {
    return null;
  }

  const loadPayload = includeRows
    ? getDatabasePayload
    : getDatabaseSchemaPayload;
  const payload = await loadPayload(
    record.id,
    input.userId,
    record,
  );
  if (!payload) return null;

  const hostSchema = stripDatabasePayload(payload);
  const dataSourceSchemas = await loadDataSourceSchemas(
    hostSchema,
    input.userId,
    input.workspaceId,
    includeRows,
  );

  return {
    dataSourceSchemas,
    hostSchema,
  };
}

async function loadDataSourceSchemas(
  hostSchema: DatabaseContextPayload,
  userId: string,
  workspaceId: string,
  includeRows: boolean,
) {
  const entries = await Promise.all(hostSchema.dataSources.map(async (source) => {
    if (source.id === hostSchema.activeDataSource?.id) {
      return [source.id, hostSchema] as const;
    }

    const parent = await getDatabaseRecord(source.parentDatabaseId);
    if (
      !parent ||
      parent.workspaceId !== workspaceId ||
      !(await canAccessDatabaseRecord(parent, userId, "view"))
    ) {
      return null;
    }

    const loadPayload = includeRows
      ? getDatabasePayload
      : getDatabaseSchemaPayload;
    const payload = await loadPayload(
      parent.id,
      userId,
      parent,
      { dataSourceId: source.id },
    );
    if (payload?.activeDataSource?.id !== source.id) return null;

    return [source.id, stripDatabasePayload(payload)] as const;
  }));

  return Object.fromEntries(
    entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  );
}

function describeDatabase(
  hostSchema: DatabaseContextPayload,
  dataSourceSchemas: Record<string, DatabaseContextPayload>,
  includeRowCount: boolean,
): AgentDatabaseDescriptor {
  return {
    id: hostSchema.database.id,
    name: hostSchema.database.name,
    dataSources: hostSchema.dataSources.flatMap((source) => {
      const schema = dataSourceSchemas[source.id];
      if (!schema) return [];

      return [{
        id: source.id,
        name: source.name,
        parentDatabaseId: source.parentDatabaseId,
        ...(includeRowCount ? { rowCount: schema.rowCount } : {}),
        views: hostSchema.views
          .filter((view) => view.dataSourceId === source.id)
          .sort((left, right) => left.position - right.position)
          .map((view) => ({
            id: view.id,
            name: view.name,
            type: view.type,
          })),
      }];
    }),
  };
}
