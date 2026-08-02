import { and, asc, eq } from "drizzle-orm";

import type { RuntimeEnv } from "../config";
import { db } from "../db";
import { databaseView } from "../db/schema";
import { requireDatabaseEditAccess } from "./database-access";
import { commitDatabaseMutation } from "./database-commit";
import { fetchDatabaseViewDelta } from "./database-delta";
import { getNextDatabaseViewName } from "./database-view-naming";
import { ServiceMutationError } from "./mutation-error";

export async function createDatabaseViewService(input: {
  config?: unknown;
  databaseId: string;
  env?: RuntimeEnv;
  name?: string;
  type?: string;
  userId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );
  const type = input.type?.trim() || "table";
  const baseName = input.name?.trim() || "Table";
  const config = input.config ?? null;

  const existingViews = await db
    .select({ name: databaseView.name, position: databaseView.position })
    .from(databaseView)
    .where(eq(databaseView.databaseId, existing.id))
    .orderBy(asc(databaseView.position));

  const viewId = crypto.randomUUID();
  const nextName = getNextDatabaseViewName(
    baseName,
    new Set(existingViews.map((view) => view.name)),
  );

  const commit = await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["views"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      const now = new Date();

      await tx.insert(databaseView).values({
        id: viewId,
        databaseId: existing.id,
        name: nextName,
        type,
        config,
        position: existingViews.length,
        createdAt: now,
        updatedAt: now,
      });

      const delta = await fetchDatabaseViewDelta(viewId, tx);

      return {
        delta: delta ?? { views: [] },
      };
    },
  );

  return {
    commit,
    databaseId: existing.id,
    name: nextName,
    type,
    viewId,
  };
}

export async function updateDatabaseViewService(input: {
  config?: unknown;
  databaseId: string;
  env?: RuntimeEnv;
  name?: string;
  type?: string;
  userId: string;
  viewId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );

  const [existingView] = await db
    .select({ id: databaseView.id })
    .from(databaseView)
    .where(
      and(
        eq(databaseView.id, input.viewId),
        eq(databaseView.databaseId, existing.id),
      ),
    )
    .limit(1);

  if (!existingView) {
    throw new ServiceMutationError("Database view not found", 404);
  }

  const values: Partial<typeof databaseView.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    values.name = input.name;
  }

  if (input.config !== undefined) {
    values.config = input.config;
  }

  if (input.type !== undefined) {
    values.type = input.type;
  }

  const commit = await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["views"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      await tx
        .update(databaseView)
        .set(values)
        .where(eq(databaseView.id, existingView.id));

      const delta = await fetchDatabaseViewDelta(existingView.id, tx);

      return {
        delta: delta ?? { views: [] },
      };
    },
  );

  return { commit, databaseId: existing.id, viewId: existingView.id };
}

export async function deleteDatabaseViewService(input: {
  databaseId: string;
  env?: RuntimeEnv;
  userId: string;
  viewId: string;
}) {
  const existing = await requireDatabaseEditAccess(
    input.databaseId,
    input.userId,
  );
  const views = await db
    .select({ id: databaseView.id })
    .from(databaseView)
    .where(eq(databaseView.databaseId, existing.id));
  const existingView = views.find((view) => view.id === input.viewId);

  if (!existingView) {
    throw new ServiceMutationError("Database view not found", 404);
  }

  if (views.length <= 1) {
    throw new ServiceMutationError(
      "A database must have at least one view",
      400,
    );
  }

  const commit = await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["views"],
      databaseId: existing.id,
      env: input.env,
    },
    async (tx) => {
      await tx.delete(databaseView).where(eq(databaseView.id, existingView.id));

      return { delta: { removedViewIds: [existingView.id] } };
    },
  );

  return { commit, databaseId: existing.id, viewId: existingView.id };
}
