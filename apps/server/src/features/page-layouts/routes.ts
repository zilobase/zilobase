import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"

import {
  createDefaultPageLayout,
  normalizePageLayoutConfig,
  toWorkspacePageLayout,
  type PageLayoutConfig,
  type PageLayoutScope,
} from "@zilobase/features/pages/layouts"
import {
  canAccessDatabaseInWorkspace,
  canAccessPageInWorkspace,
  getMembership,
  isDatabasePublishedInWorkspace,
  isPagePublishedInWorkspace,
  isPrivilegedOrgRole,
} from "../access"
import { db } from "../../infrastructure/database"
import {
  dataSource,
  database,
  databaseRow,
  page,
  pageLayout,
} from "../../infrastructure/database/schema"
import type { AppBindings } from "../../shared/types"

export const pageLayoutRoutes = new Hono<AppBindings>()

const scopeSchema = z.enum(["workspace", "database", "page"])
const saveSchema = z.object({
  clearPageOverrides: z.boolean().optional(),
  config: z.unknown(),
})

type PageLayoutWriteInput = {
  config: PageLayoutConfig
  scope: PageLayoutScope
  scopeId: string
  workspaceId: string
}

type PageLayoutWriter = Pick<typeof db, "delete" | "insert" | "select">

async function upsertPageLayout(
  writer: Pick<PageLayoutWriter, "insert">,
  input: PageLayoutWriteInput,
) {
  return writer
    .insert(pageLayout)
    .values({
      config: input.config,
      id: crypto.randomUUID(),
      scopeId: input.scopeId,
      scopeType: input.scope,
      workspaceId: input.workspaceId,
    })
    .onConflictDoUpdate({
      target: [pageLayout.scopeType, pageLayout.scopeId],
      set: {
        config: input.config,
        updatedAt: new Date(),
        workspaceId: input.workspaceId,
      },
    })
    .returning()
}

async function deleteDatabasePageOverrides(
  writer: Pick<PageLayoutWriter, "delete" | "select">,
  databaseId: string,
) {
  const databasePageIds = writer
    .select({ pageId: databaseRow.pageId })
    .from(databaseRow)
    .where(
      and(
        inArray(
          databaseRow.dataSourceId,
          writer
            .select({ id: dataSource.id })
            .from(dataSource)
            .where(eq(dataSource.parentDatabaseId, databaseId)),
        ),
        isNull(databaseRow.deletedAt),
      ),
    )

  await writer
    .delete(pageLayout)
    .where(
      and(
        eq(pageLayout.scopeType, "page"),
        inArray(pageLayout.scopeId, databasePageIds),
      ),
    )
}

async function getTargetContext(input: {
  databaseId?: string | null
  pageId?: string | null
}) {
  if (input.databaseId) {
    const [record] = await db
      .select()
      .from(database)
      .where(and(eq(database.id, input.databaseId), isNull(database.deletedAt)))
      .limit(1)

    if (!record) return null

    const [firstRow] = await db
      .select({ pageId: databaseRow.pageId })
      .from(databaseRow)
      .innerJoin(dataSource, eq(dataSource.id, databaseRow.dataSourceId))
      .where(
        and(
          eq(dataSource.parentDatabaseId, record.id),
          isNull(databaseRow.deletedAt),
        ),
      )
      .orderBy(asc(databaseRow.position))
      .limit(1)

    return {
      databaseId: record.id,
      pageId: firstRow?.pageId ?? null,
      workspaceId: record.workspaceId,
    }
  }

  if (!input.pageId) return null

  const [record] = await db
    .select()
    .from(page)
    .where(and(eq(page.id, input.pageId), isNull(page.deletedAt)))
    .limit(1)

  if (!record) return null

  const [row] = await db
    .select({ databaseId: dataSource.parentDatabaseId })
    .from(databaseRow)
    .innerJoin(dataSource, eq(dataSource.id, databaseRow.dataSourceId))
    .innerJoin(database, eq(database.id, dataSource.parentDatabaseId))
    .where(
      and(
        eq(databaseRow.pageId, record.id),
        isNull(databaseRow.deletedAt),
        isNull(database.deletedAt),
      ),
    )
    .orderBy(asc(databaseRow.position))
    .limit(1)

  return {
    databaseId: row?.databaseId ?? null,
    pageId: record.id,
    workspaceId: record.workspaceId,
  }
}

async function canViewTarget(
  context: NonNullable<Awaited<ReturnType<typeof getTargetContext>>>,
  userId?: string | null,
) {
  if (userId) {
    return context.pageId
      ? canAccessPageInWorkspace(context.pageId, context.workspaceId, userId, "view")
      : context.databaseId
        ? canAccessDatabaseInWorkspace(context.databaseId, context.workspaceId, userId, "view")
        : false
  }

  return context.pageId
    ? isPagePublishedInWorkspace(context.pageId, context.workspaceId)
    : context.databaseId
      ? isDatabasePublishedInWorkspace(context.databaseId, context.workspaceId)
      : false
}

pageLayoutRoutes.get("/resolve", async (c) => {
  const pageId = c.req.query("pageId")?.trim() || null
  const databaseId = c.req.query("databaseId")?.trim() || null
  const context = await getTargetContext({ pageId, databaseId })

  if (!context) return c.json({ error: "Page or database not found." }, 404)
  if (!(await canViewTarget(context, c.get("user")?.id))) {
    return c.json({ error: "Forbidden" }, 403)
  }

  const scopeIds = [context.workspaceId, context.databaseId, context.pageId].filter(
    (id): id is string => Boolean(id),
  )
  const layouts = await db
    .select()
    .from(pageLayout)
    .where(and(eq(pageLayout.workspaceId, context.workspaceId), inArray(pageLayout.scopeId, scopeIds)))

  const byScope = new Map(layouts.map((layout) => [layout.scopeType, layout]))
  let config = createDefaultPageLayout({ database: Boolean(context.databaseId) })
  const sources: Partial<Record<"generic" | "schema", PageLayoutScope>> = {}

  for (const scope of ["workspace", "database", "page"] as const) {
    const stored = byScope.get(scope)
    if (!stored) continue
    config = normalizePageLayoutConfig(stored.config, { database: Boolean(context.databaseId) })
    sources.generic = scope
    if (scope !== "workspace") sources.schema = scope
  }

  return c.json({ config, databaseId: context.databaseId, pageId: context.pageId, sources, workspaceId: context.workspaceId })
})

async function resolveScopeContext(scope: PageLayoutScope, scopeId: string) {
  if (scope === "workspace") {
    return { workspaceId: scopeId }
  }
  if (scope === "database") {
    const [record] = await db.select().from(database).where(eq(database.id, scopeId)).limit(1)
    return record ? { workspaceId: record.workspaceId } : null
  }
  const [record] = await db.select().from(page).where(eq(page.id, scopeId)).limit(1)
  return record ? { workspaceId: record.workspaceId } : null
}

async function canEditScope(scope: PageLayoutScope, scopeId: string, workspaceId: string, userId: string) {
  if (scope === "workspace") {
    const membership = await getMembership(workspaceId, userId)
    return Boolean(membership && isPrivilegedOrgRole(membership.role))
  }
  return scope === "database"
    ? canAccessDatabaseInWorkspace(scopeId, workspaceId, userId, "edit")
    : canAccessPageInWorkspace(scopeId, workspaceId, userId, "edit")
}

pageLayoutRoutes.put("/:scope/:scopeId", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ error: "Unauthorized" }, 401)
  const scopeResult = scopeSchema.safeParse(c.req.param("scope"))
  const bodyResult = saveSchema.safeParse(await c.req.json().catch(() => null))
  if (!scopeResult.success || !bodyResult.success) return c.json({ error: "Invalid layout." }, 400)

  const scope = scopeResult.data
  const scopeId = c.req.param("scopeId")
  const context = await resolveScopeContext(scope, scopeId)
  if (!context) return c.json({ error: "Layout target not found." }, 404)
  if (!(await canEditScope(scope, scopeId, context.workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403)
  }

  let config: PageLayoutConfig = normalizePageLayoutConfig(bodyResult.data.config, {
    database: scope === "database",
  })
  if (scope === "workspace") config = toWorkspacePageLayout(config)

  const saveInput = {
    config,
    scope,
    scopeId,
    workspaceId: context.workspaceId,
  }
  const shouldClearPageOverrides =
    scope === "database" && bodyResult.data.clearPageOverrides === true

  if (!shouldClearPageOverrides) {
    const [saved] = await upsertPageLayout(db, saveInput)
    return c.json({ layout: saved })
  }

  const [saved] = await db.transaction(async (tx) => {
    const savedLayouts = await upsertPageLayout(tx, saveInput)
    await deleteDatabasePageOverrides(tx, scopeId)

    return savedLayouts
  })

  return c.json({ layout: saved })
})

pageLayoutRoutes.delete("/:scope/:scopeId", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ error: "Unauthorized" }, 401)
  const scopeResult = scopeSchema.safeParse(c.req.param("scope"))
  if (!scopeResult.success) return c.json({ error: "Invalid scope." }, 400)
  const scope = scopeResult.data
  const scopeId = c.req.param("scopeId")
  const context = await resolveScopeContext(scope, scopeId)
  if (!context) return c.json({ error: "Layout target not found." }, 404)
  if (!(await canEditScope(scope, scopeId, context.workspaceId, user.id))) {
    return c.json({ error: "Forbidden" }, 403)
  }

  await db.delete(pageLayout).where(and(eq(pageLayout.scopeType, scope), eq(pageLayout.scopeId, scopeId)))
  return c.json({ ok: true })
})
