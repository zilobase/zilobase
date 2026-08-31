import { and, asc, eq, sql } from "drizzle-orm";

import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import {
  dataSource,
  databaseDataSource,
  databaseView,
} from "../../../infrastructure/database/schema";
import { requireDatabaseEditAccess } from "../access/database-access";
import { commitDatabaseMutation } from "../core/commit";
import { requireDataSourceAccess } from "../access/data-source-access";
import { fetchDatabaseViewDelta } from "../realtime/delta";
import { getDatabasePayload } from "../core/payload";
import { getNextDatabaseViewName } from "../views/naming";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

export async function createDatabaseDataSourceService(input: {
  config?: unknown;
  databaseId: string;
  env?: RuntimeEnv;
  name?: string;
  userId: string;
  viewName?: string;
  viewType?: string;
}) {
  const host = await requireDatabaseEditAccess(input.databaseId, input.userId);
  const existingViews = await db
    .select({ name: databaseView.name, position: databaseView.position })
    .from(databaseView)
    .where(eq(databaseView.databaseId, host.id))
    .orderBy(asc(databaseView.position));
  const [lastLink] = await db
    .select({ position: databaseDataSource.position })
    .from(databaseDataSource)
    .where(eq(databaseDataSource.databaseId, host.id))
    .orderBy(sql`${databaseDataSource.position} desc`)
    .limit(1);
  const dataSourceId = crypto.randomUUID();
  const viewId = crypto.randomUUID();
  const sourceName = input.name?.trim() || "New data source";
  const viewName = getNextDatabaseViewName(
    input.viewName?.trim() || "Table",
    new Set(existingViews.map((view) => view.name)),
  );
  const now = new Date();

  await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["database", "views"],
      databaseId: host.id,
      env: input.env,
      navigationWorkspaceId: host.workspaceId,
    },
    async (tx) => {
      await tx.insert(dataSource).values({
        config: input.config ?? {},
        createdAt: now,
        createdById: input.userId,
        id: dataSourceId,
        name: sourceName,
        parentDatabaseId: host.id,
        updatedAt: now,
        workspaceId: host.workspaceId,
      });
      await tx.insert(databaseDataSource).values({
        databaseId: host.id,
        dataSourceId,
        linkedById: input.userId,
        position: (lastLink?.position ?? -1) + 1,
      });
      await tx.insert(databaseView).values({
        databaseId: host.id,
        dataSourceId,
        id: viewId,
        name: viewName,
        position: existingViews.length,
        type: input.viewType?.trim() || "table",
      });

      return {
        delta: (await fetchDatabaseViewDelta(viewId, tx)) ?? { views: [] },
      };
    },
  );

  const payload = await getDatabasePayload(host.id, input.userId);
  if (!payload) {
    throw new Error("Data source was created but could not be loaded");
  }

  return { dataSourceId, payload, viewId };
}

async function requireCompatibleSource(
  databaseId: string,
  dataSourceId: string,
  userId: string,
) {
  const [host, source] = await Promise.all([
    requireDatabaseEditAccess(databaseId, userId),
    requireDataSourceAccess(dataSourceId, userId, "view"),
  ]);

  if (host.workspaceId !== source.workspaceId) {
    throw new ServiceMutationError("Data source not found", 404);
  }

  return { host, source };
}

export async function linkDatabaseDataSourceService(input: {
  config?: unknown;
  databaseId: string;
  dataSourceId: string;
  env?: RuntimeEnv;
  name?: string;
  type?: string;
  userId: string;
}) {
  const { host, source } = await requireCompatibleSource(
    input.databaseId,
    input.dataSourceId,
    input.userId,
  );
  const existingViews = await db
    .select({ name: databaseView.name, position: databaseView.position })
    .from(databaseView)
    .where(eq(databaseView.databaseId, host.id))
    .orderBy(asc(databaseView.position));
  const [lastLink] = await db
    .select({ position: databaseDataSource.position })
    .from(databaseDataSource)
    .where(eq(databaseDataSource.databaseId, host.id))
    .orderBy(sql`${databaseDataSource.position} desc`)
    .limit(1);
  const viewId = crypto.randomUUID();
  const name = getNextDatabaseViewName(
    input.name?.trim() || source.name || "Table",
    new Set(existingViews.map((view) => view.name)),
  );

  const commit = await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["views"],
      databaseId: host.id,
      env: input.env,
      navigationWorkspaceId: host.workspaceId,
    },
    async (tx) => {
      await tx
        .insert(databaseDataSource)
        .values({
          databaseId: host.id,
          dataSourceId: source.id,
          linkedById: input.userId,
          position: (lastLink?.position ?? -1) + 1,
        })
        .onConflictDoNothing({
          target: [databaseDataSource.databaseId, databaseDataSource.dataSourceId],
        });
      await tx.insert(databaseView).values({
        config: input.config ?? null,
        databaseId: host.id,
        dataSourceId: source.id,
        id: viewId,
        name,
        position: existingViews.length,
        type: input.type?.trim() || "table",
      });

      return {
        delta: (await fetchDatabaseViewDelta(viewId, tx)) ?? { views: [] },
      };
    },
  );

  return { commit, dataSourceId: source.id, viewId };
}

export async function replaceDatabaseViewDataSourceService(input: {
  databaseId: string;
  dataSourceId: string;
  env?: RuntimeEnv;
  userId: string;
  viewId: string;
}) {
  const { host, source } = await requireCompatibleSource(
    input.databaseId,
    input.dataSourceId,
    input.userId,
  );
  const [view, lastLink] = await Promise.all([
    db
      .select({ id: databaseView.id })
      .from(databaseView)
      .where(
        and(
          eq(databaseView.id, input.viewId),
          eq(databaseView.databaseId, host.id),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ position: databaseDataSource.position })
      .from(databaseDataSource)
      .where(eq(databaseDataSource.databaseId, host.id))
      .orderBy(sql`${databaseDataSource.position} desc`)
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  if (!view) throw new ServiceMutationError("Database view not found", 404);

  const commit = await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["views"],
      databaseId: host.id,
      env: input.env,
      navigationWorkspaceId: host.workspaceId,
    },
    async (tx) => {
      await tx
        .insert(databaseDataSource)
        .values({
          databaseId: host.id,
          dataSourceId: source.id,
          linkedById: input.userId,
          position: (lastLink?.position ?? -1) + 1,
        })
        .onConflictDoNothing({
          target: [databaseDataSource.databaseId, databaseDataSource.dataSourceId],
        });
      await tx
        .update(databaseView)
        .set({ dataSourceId: source.id, updatedAt: new Date() })
        .where(eq(databaseView.id, view.id));

      return {
        delta: (await fetchDatabaseViewDelta(view.id, tx)) ?? { views: [] },
      };
    },
  );

  return { commit, dataSourceId: source.id, viewId: view.id };
}

export async function unlinkDatabaseDataSourceService(input: {
  databaseId: string;
  dataSourceId: string;
  env?: RuntimeEnv;
  userId: string;
}) {
  const host = await requireDatabaseEditAccess(input.databaseId, input.userId);
  const [source, links, usingViews] = await Promise.all([
    requireDataSourceAccess(input.dataSourceId, input.userId, "view"),
    db
      .select({ dataSourceId: databaseDataSource.dataSourceId })
      .from(databaseDataSource)
      .where(eq(databaseDataSource.databaseId, host.id)),
    db
      .select({ id: databaseView.id })
      .from(databaseView)
      .where(
        and(
          eq(databaseView.databaseId, host.id),
          eq(databaseView.dataSourceId, input.dataSourceId),
        ),
      ),
  ]);

  if (source.workspaceId !== host.workspaceId) {
    throw new ServiceMutationError("Data source link not found", 404);
  }
  if (!links.some((link) => link.dataSourceId === input.dataSourceId)) {
    throw new ServiceMutationError("Data source link not found", 404);
  }
  if (source.parentDatabaseId === host.id) {
    throw new ServiceMutationError("Owned data sources cannot be unlinked", 409);
  }
  if (usingViews.length > 0) {
    throw new ServiceMutationError(
      "Move or delete views that use this data source before unlinking it",
      409,
    );
  }

  const commit = await commitDatabaseMutation(
    {
      actorId: input.userId,
      changed: ["database"],
      databaseId: host.id,
      env: input.env,
    },
    async (tx) => {
      await tx
        .delete(databaseDataSource)
        .where(
          and(
            eq(databaseDataSource.databaseId, host.id),
            eq(databaseDataSource.dataSourceId, input.dataSourceId),
          ),
        );
      return { delta: {} };
    },
  );

  return { commit, dataSourceId: input.dataSourceId };
}
