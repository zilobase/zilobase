import { and, eq, isNull, sql } from "drizzle-orm"
import type { CreateClipRequest, CreateClipResponse } from "@zilobase/features/clips"

import {
  canAccessDatabaseInWorkspace,
  canAccessPage,
  getMembership,
} from "../access"
import { createDatabaseRowService } from "../databases/records/service"
import { getDataSourceRecord } from "../databases/access/data-source-access"
import { db } from "../../infrastructure/database"
import { dataSource, page } from "../../infrastructure/database/schema"
import { ServiceMutationError } from "../../shared/errors/service-mutation-error"
import type { RuntimeEnv } from "../../shared/config/config"
import { createPageService } from "../pages/mutations/page-mutations"
import { buildClipContent } from "./build-clip-content"

export async function createClipService(input: {
  request: CreateClipRequest
  userId: string
  env?: RuntimeEnv
}): Promise<CreateClipResponse> {
  const { request, userId, env } = input
  const sourceUrl = request.canonicalUrl?.trim() || request.sourceUrl
  const duplicateStrategy = request.duplicateStrategy ?? "create"

  await authorizeClipDestination(request, userId)

  const existing = await findDuplicateClip({
    sourceUrl,
    userId,
    workspaceId: request.workspaceId,
  })

  const duplicate = duplicateClipResponse(existing, duplicateStrategy)
  if (duplicate) return duplicate

  const content = buildClipContent(request)
  const metadata = {
    cover: request.metadata?.image ?? null,
    clip: {
      capturedAt: new Date().toISOString(),
      captureMode: request.captureMode,
      canonicalUrl: request.canonicalUrl ?? null,
      sourceUrl,
    },
  }

  const created = await createPageService({
    content,
    env,
    metadata,
    name: request.title,
    parentPageId: request.parentPageId ?? undefined,
    userId,
    workspaceId: request.workspaceId,
  })

  let databaseRowId: string | undefined

  if (request.databaseId) {
    const dataSourceId = await resolveDataSourceId(request.databaseId)
    const row = await createDatabaseRowService({
      databaseId: dataSourceId,
      env,
      initialValues: request.propertyValues,
      origin: "api",
      pageId: created.pageId,
      parentRowId: null,
      sourceDataSourceId: null,
      sourcePropertyMode: "match",
      sourceRowId: null,
      title: request.title,
      userId,
    })
    databaseRowId = row.rowId
  }

  return {
    pageId: created.pageId,
    databaseRowId,
    url: `/p/${created.pageId}`,
  }
}

function duplicateClipResponse(existing: { pageId: string } | null, duplicateStrategy: CreateClipRequest["duplicateStrategy"]): CreateClipResponse | null {
  if (existing && duplicateStrategy === "reject") {
    throw new ServiceMutationError("This URL has already been clipped.", 409)
  }

  if (existing && duplicateStrategy === "open-existing") {
    return {
      pageId: existing.pageId,
      url: `/p/${existing.pageId}`,
      duplicateOf: existing.pageId,
    }
  }

  return null
}

async function authorizeClipDestination(request: CreateClipRequest, userId: string) {
  if (request.parentPageId) {
    if (!(await canAccessPage(request.parentPageId, userId, "edit"))) {
      throw new ServiceMutationError("Forbidden", 403)
    }
  } else if (!(await getMembership(request.workspaceId, userId))) {
    throw new ServiceMutationError("Forbidden", 403)
  }

  if (request.databaseId) {
    if (
      !(await canAccessDatabaseInWorkspace(
        request.databaseId,
        request.workspaceId,
        userId,
        "edit",
      ))
    ) {
      throw new ServiceMutationError("Forbidden", 403)
    }
  }

}

async function resolveDataSourceId(databaseOrSourceId: string) {
  const exact = await getDataSourceRecord(databaseOrSourceId)
  if (exact) return exact.id

  const [source] = await db
    .select({ id: dataSource.id })
    .from(dataSource)
    .where(
      and(
        eq(dataSource.parentDatabaseId, databaseOrSourceId),
        isNull(dataSource.deletedAt),
      ),
    )
    .limit(1)

  if (!source) {
    throw new ServiceMutationError("Data source not found", 404)
  }

  return source.id
}

export async function findDuplicateClip(input: {
  sourceUrl: string
  userId: string
  workspaceId: string
}) {
  const matches = await db
    .select({
      id: page.id,
      name: page.name,
      workspaceId: page.workspaceId,
    })
    .from(page)
    .where(
      and(
        eq(page.workspaceId, input.workspaceId),
        isNull(page.deletedAt),
        sql`${page.metadata} -> 'clip' ->> 'sourceUrl' = ${input.sourceUrl}`,
      ),
    )
    .limit(8)

  for (const record of matches) {
    if (await canAccessPage(record.id, input.userId, "view")) {
      return { pageId: record.id, title: record.name }
    }
  }

  return null
}
