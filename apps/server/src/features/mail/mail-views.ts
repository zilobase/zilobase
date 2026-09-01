import { and, asc, eq, max } from "drizzle-orm"
import type {
  MailPersistedView,
  MailViewCreateInput,
  MailViewTemplateId,
  MailViewUpdateInput,
} from "@zilobase/features/mail"
import {
  createMailViewFromTemplate,
  normalizeMailViewConfig,
} from "@zilobase/features/mail"

import { db } from "../../infrastructure/database"
import { mailView } from "../../infrastructure/database/schema"
import { prepareMailDatabaseSyncConfig } from "./mail-database-sync"
import { MailViewServiceError } from "./mail-view-errors"

export { MailViewServiceError } from "./mail-view-errors"

const seededTemplateIds = ["inbox", "unread", "starred"] as const

export function seededMailViewId(
  bindingId: string,
  templateId: (typeof seededTemplateIds)[number],
) {
  return `mail-view:${bindingId}:${templateId}`
}

export async function ensureDefaultMailViews(bindingId: string) {
  const now = new Date()
  await db
    .insert(mailView)
    .values(
      seededTemplateIds.map((templateId, position) => {
        const template = createMailViewFromTemplate(templateId)
        return {
          bindingId,
          config: template.config,
          createdAt: now,
          icon: template.icon,
          id: seededMailViewId(bindingId, templateId),
          name: template.name,
          position,
          protected: template.protected,
          templateId,
          updatedAt: now,
        }
      }),
    )
    .onConflictDoNothing()
}

export async function listMailViews(bindingId: string) {
  await ensureDefaultMailViews(bindingId)
  const rows = await db
    .select()
    .from(mailView)
    .where(eq(mailView.bindingId, bindingId))
    .orderBy(asc(mailView.position), asc(mailView.createdAt))
  return rows.map(serializeMailView)
}

export async function createMailView(input: {
  bindingId: string
  userId?: string
  value: MailViewCreateInput
  workspaceId?: string
}) {
  await ensureDefaultMailViews(input.bindingId)
  const template = input.value.templateId
    ? createMailViewFromTemplate(input.value.templateId)
    : null
  const name = cleanName(input.value.name ?? template?.name ?? "New view")
  const [positionRow] = await db
    .select({ value: max(mailView.position) })
    .from(mailView)
    .where(eq(mailView.bindingId, input.bindingId))
  const now = new Date()
  const [created] = await db
    .insert(mailView)
    .values({
      bindingId: input.bindingId,
      config: input.value.config
        ? await prepareMailDatabaseSyncConfig({
            bindingId: input.bindingId,
            config: input.value.config,
            userId: input.userId,
            workspaceId: input.workspaceId,
          })
        : template?.config ?? normalizeMailViewConfig({}),
      createdAt: now,
      icon: cleanIcon(input.value.icon, template?.icon ?? "mail"),
      id: crypto.randomUUID(),
      name,
      position: Number(positionRow?.value ?? -1) + 1,
      protected: false,
      templateId: input.value.templateId ?? null,
      updatedAt: now,
    })
    .returning()
  if (!created) throw new MailViewServiceError("Mail view could not be created.", 409)
  return serializeMailView(created)
}

export async function updateMailView(input: {
  bindingId: string
  userId?: string
  value: MailViewUpdateInput
  viewId: string
  workspaceId?: string
}) {
  const updates: Partial<typeof mailView.$inferInsert> = { updatedAt: new Date() }
  if (input.value.name !== undefined) updates.name = cleanName(input.value.name)
  if (input.value.icon !== undefined) updates.icon = cleanIcon(input.value.icon, null)
  if (input.value.config !== undefined) {
    const existing = await findMailView(input.bindingId, input.viewId)
    updates.config = await prepareMailDatabaseSyncConfig({
      bindingId: input.bindingId,
      config: input.value.config,
      previousConfig: existing.config,
      userId: input.userId,
      workspaceId: input.workspaceId,
    })
  }
  const [updated] = await db
    .update(mailView)
    .set(updates)
    .where(and(eq(mailView.id, input.viewId), eq(mailView.bindingId, input.bindingId)))
    .returning()
  if (!updated) throw new MailViewServiceError("Mail view not found.", 404)
  return serializeMailView(updated)
}

export async function duplicateMailView(input: {
  bindingId: string
  userId?: string
  viewId: string
  workspaceId?: string
}) {
  const source = await findMailView(input.bindingId, input.viewId)
  return createMailView({
    bindingId: input.bindingId,
    userId: input.userId,
    value: {
      icon: source.icon,
      name: `${source.name} copy`,
    },
    workspaceId: input.workspaceId,
  }).then(async (created) =>
    updateMailView({
      bindingId: input.bindingId,
      value: { config: {
        ...source.config,
        databaseSync: { ...source.config.databaseSync, activatedAt: null, enabled: false },
      } },
      viewId: created.id,
      userId: input.userId,
      workspaceId: input.workspaceId,
    }),
  )
}

export async function deleteMailView(input: {
  bindingId: string
  viewId: string
}) {
  const existing = await findMailView(input.bindingId, input.viewId)
  if (existing.protected) {
    throw new MailViewServiceError("Inbox cannot be deleted.", 409)
  }
  await db
    .delete(mailView)
    .where(and(eq(mailView.id, input.viewId), eq(mailView.bindingId, input.bindingId)))
  return { success: true as const }
}

export async function reorderMailViews(input: {
  bindingId: string
  viewIds: string[]
}) {
  const views = await listMailViews(input.bindingId)
  const currentIds = new Set(views.map((view) => view.id))
  if (
    input.viewIds.length !== views.length ||
    new Set(input.viewIds).size !== input.viewIds.length ||
    input.viewIds.some((id) => !currentIds.has(id))
  ) {
    throw new MailViewServiceError("Reorder every mail view exactly once.", 400)
  }
  const now = new Date()
  await db.transaction(async (tx) => {
    for (const [position, viewId] of input.viewIds.entries()) {
      await tx
        .update(mailView)
        .set({ position, updatedAt: now })
        .where(and(eq(mailView.id, viewId), eq(mailView.bindingId, input.bindingId)))
    }
  })
  return listMailViews(input.bindingId)
}

async function findMailView(bindingId: string, viewId: string) {
  const [row] = await db
    .select()
    .from(mailView)
    .where(and(eq(mailView.id, viewId), eq(mailView.bindingId, bindingId)))
    .limit(1)
  if (!row) throw new MailViewServiceError("Mail view not found.", 404)
  return serializeMailView(row)
}

function cleanName(value: string) {
  const name = value.trim()
  if (!name || name.length > 120) {
    throw new MailViewServiceError("Mail view names must be 1–120 characters.", 400)
  }
  return name
}

function cleanIcon(value: string | null | undefined, fallback: string | null) {
  if (value === null) return null
  if (value === undefined) return fallback
  const icon = value.trim()
  if (icon.length > 80) {
    throw new MailViewServiceError("Mail view icons must be 80 characters or fewer.", 400)
  }
  return icon || null
}

function serializeMailView(row: typeof mailView.$inferSelect): MailPersistedView {
  return {
    bindingId: row.bindingId,
    config: normalizeMailViewConfig(row.config),
    createdAt: row.createdAt.toISOString(),
    icon: row.icon,
    id: row.id,
    name: row.name,
    position: row.position,
    protected: row.protected,
    templateId: row.templateId as MailViewTemplateId | null,
    updatedAt: row.updatedAt.toISOString(),
  }
}
