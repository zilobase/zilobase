import { eq } from "drizzle-orm";

import type { RuntimeEnv } from "../shared/config/config";
import { dataSource } from "../infrastructure/database/schema";
import { commitDataSourceMutation } from "./database-commit";
import { requireDataSourceEditAccess } from "./data-source-access";

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
      changed: ["dataSource"],
      dataSourceId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const [updated] = await tx
        .update(dataSource)
        .set(values)
        .where(eq(dataSource.id, existing.id))
        .returning();

      return { delta: { dataSource: updated ?? { id: existing.id, ...values } } };
    },
  );

  return { commit, dataSourceId: existing.id };
}
