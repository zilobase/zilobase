import { eq } from "drizzle-orm";

import type { RuntimeEnv } from "../../../shared/config/config";
import { dataSource } from "../../../infrastructure/database/schema";
import { commitDataSourceMutation } from "../core/commit";
import { requireDataSourceEditAccess } from "../access/data-source-access";
import { getDataSourceEntity } from "../commands/metadata-entities";

export async function updateDataSourceService(input: {
  config?: unknown;
  dataSourceId: string;
  env?: RuntimeEnv;
  name?: string;
  userId: string;
}) {
  const existing = await requireDataSourceEditAccess(
    input.dataSourceId,
    input.userId,
  );
  const values: Partial<typeof dataSource.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) values.name = input.name;
  if (input.config !== undefined) values.config = input.config;

  const commit = await commitDataSourceMutation(
    {
      actorId: input.userId,
      areas: ["dataSources"],
      dataSourceId: existing.id,
      env: input.env,
    },
    async (tx) => {
      await tx
        .update(dataSource)
        .set(values)
        .where(eq(dataSource.id, existing.id))
      return {
        changes: (databaseId: string) => getDataSourceEntity(
          { transaction: tx },
          databaseId,
          existing.id,
        ).then((source) => ({ dataSources: [source] })),
      };
    },
  );

  return { commit, dataSourceId: existing.id };
}
