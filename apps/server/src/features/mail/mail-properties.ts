import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm"
import {
  mailCustomPropertyTypes,
  type MailCustomPropertyType,
  type MailPropertiesBootstrap,
  type MailPropertyDefinition,
  type MailPropertyOption,
  type MailPropertyWriteInput,
  type MailThreadPropertyValue,
} from "@zilobase/features/mail"

import { db } from "../../infrastructure/database"
import { mailProperty, mailThreadIndex, mailThreadPropertyValue, member, user } from "../../infrastructure/database/schema"

export class MailPropertyError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message)
    this.name = "MailPropertyError"
  }
}

export async function listMailProperties(bindingId: string, workspaceId: string): Promise<MailPropertiesBootstrap> {
  const [properties, members] = await Promise.all([
    db.select().from(mailProperty).where(eq(mailProperty.bindingId, bindingId)).orderBy(asc(mailProperty.createdAt), asc(mailProperty.id)),
    db
      .select({ email: user.email, id: user.id, image: user.image, name: user.name })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(
        eq(member.organizationId, workspaceId),
        or(isNull(member.accessExpiresAt), gt(member.accessExpiresAt, new Date())),
      ))
      .orderBy(asc(user.name), asc(user.email)),
  ])
  return { members, properties: properties.map(serializeProperty) }
}

export async function createMailProperty(input: { bindingId: string; value: unknown }) {
  const value = normalizePropertyWrite(input.value)
  const now = new Date()
  const [created] = await db.insert(mailProperty).values({
    bindingId: input.bindingId,
    createdAt: now,
    id: crypto.randomUUID(),
    name: value.name,
    options: value.options ?? [],
    type: value.type,
    updatedAt: now,
  }).returning()
  if (!created) throw new MailPropertyError("Mail property could not be created.", 409)
  return serializeProperty(created)
}

export async function updateMailProperty(input: { bindingId: string; propertyId: string; value: unknown }) {
  const value = normalizePropertyWrite(input.value)
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(mailProperty).where(and(
      eq(mailProperty.bindingId, input.bindingId),
      eq(mailProperty.id, input.propertyId),
    )).limit(1)
    if (!existing) throw new MailPropertyError("Mail property not found.", 404)
    const [updated] = await tx.update(mailProperty).set({
      name: value.name,
      options: value.options ?? [],
      type: value.type,
      updatedAt: new Date(),
    }).where(eq(mailProperty.id, existing.id)).returning()
    if (existing.type !== value.type) {
      await tx.delete(mailThreadPropertyValue).where(eq(mailThreadPropertyValue.propertyId, existing.id))
    }
    if (!updated) throw new MailPropertyError("Mail property not found.", 404)
    return serializeProperty(updated)
  })
}

export async function deleteMailProperty(input: { bindingId: string; propertyId: string }) {
  const deleted = await db.delete(mailProperty).where(and(
    eq(mailProperty.bindingId, input.bindingId),
    eq(mailProperty.id, input.propertyId),
  )).returning({ id: mailProperty.id })
  if (!deleted.length) throw new MailPropertyError("Mail property not found.", 404)
  return { success: true as const }
}

export async function listMailThreadPropertyValues(input: {
  bindingId: string
  gmailAccountId: string
  threadId: string
}) {
  await requireIndexedThread(input.gmailAccountId, input.threadId)
  const rows = await db
    .select({ propertyId: mailThreadPropertyValue.propertyId, value: mailThreadPropertyValue.value })
    .from(mailThreadPropertyValue)
    .innerJoin(mailProperty, eq(mailProperty.id, mailThreadPropertyValue.propertyId))
    .where(and(
      eq(mailProperty.bindingId, input.bindingId),
      eq(mailThreadPropertyValue.gmailThreadId, input.threadId),
    ))
  return rows.map((row): MailThreadPropertyValue => ({ propertyId: row.propertyId, value: row.value as MailThreadPropertyValue["value"] }))
}

export async function setMailThreadPropertyValue(input: {
  bindingId: string
  gmailAccountId: string
  propertyId: string
  threadId: string
  value: unknown
  workspaceId: string
}) {
  const [property] = await Promise.all([
    findProperty(input.bindingId, input.propertyId),
    requireIndexedThread(input.gmailAccountId, input.threadId),
  ])
  const value = await normalizeThreadValue(property, input.value, input.workspaceId)
  const now = new Date()
  const id = `${property.id}:${input.threadId}`
  await db.insert(mailThreadPropertyValue).values({
    createdAt: now,
    gmailThreadId: input.threadId,
    id,
    propertyId: property.id,
    updatedAt: now,
    value,
  }).onConflictDoUpdate({
    set: { updatedAt: now, value },
    target: [mailThreadPropertyValue.propertyId, mailThreadPropertyValue.gmailThreadId],
  })
  return { propertyId: property.id, value } satisfies MailThreadPropertyValue
}

function normalizePropertyWrite(value: unknown): MailPropertyWriteInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MailPropertyError("A valid mail property is required.", 400)
  const record = value as Record<string, unknown>
  const name = typeof record.name === "string" ? record.name.trim() : ""
  if (!name || name.length > 100 || !mailCustomPropertyTypes.includes(record.type as MailCustomPropertyType)) {
    throw new MailPropertyError("A valid mail property is required.", 400)
  }
  const type = record.type as MailCustomPropertyType
  const options = ["select", "multi_select", "status"].includes(type)
    ? normalizeOptions(record.options)
    : []
  return { name, options, type }
}

function normalizeOptions(value: unknown): MailPropertyOption[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) throw new MailPropertyError("Property options are invalid.", 400)
  const seen = new Set<string>()
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new MailPropertyError("Property options are invalid.", 400)
    const record = item as Record<string, unknown>
    const id = typeof record.id === "string" ? record.id.trim() : ""
    const name = typeof record.name === "string" ? record.name.trim() : ""
    const color = typeof record.color === "string" ? record.color.trim() : ""
    if (!id || id.length > 100 || seen.has(id) || !name || name.length > 100 || !color || color.length > 50) {
      throw new MailPropertyError("Property options are invalid.", 400)
    }
    seen.add(id)
    return { color, id, name }
  })
}

async function normalizeThreadValue(property: MailPropertyDefinition, value: unknown, workspaceId: string) {
  if (value === null) return null
  if (property.type === "text") return boundedString(value, 10_000)
  if (property.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw invalidValue()
    return value
  }
  if (property.type === "checkbox") {
    if (typeof value !== "boolean") throw invalidValue()
    return value
  }
  if (property.type === "url") {
    const url = boundedString(value, 2_000)
    let parsed: URL
    try { parsed = new URL(url) } catch { throw invalidValue() }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw invalidValue()
    return url
  }
  if (property.type === "date") {
    const date = boundedString(value, 100)
    if (!Number.isFinite(Date.parse(date))) throw invalidValue()
    return date
  }
  if (property.type === "select" || property.type === "status") {
    const optionId = boundedString(value, 100)
    if (!property.options.some((option) => option.id === optionId)) throw invalidValue()
    return optionId
  }
  if (property.type === "multi_select") {
    const optionIds = stringArray(value, 100)
    if (!optionIds.every((id) => property.options.some((option) => option.id === id))) throw invalidValue()
    return optionIds
  }
  if (property.type === "person") {
    const userIds = stringArray(value, 100)
    if (userIds.length) {
      const active = await db.select({ userId: member.userId }).from(member).where(and(
        eq(member.organizationId, workspaceId),
        inArray(member.userId, userIds),
        or(isNull(member.accessExpiresAt), gt(member.accessExpiresAt, new Date())),
      ))
      if (new Set(active.map(({ userId }) => userId)).size !== new Set(userIds).size) throw invalidValue()
    }
    return userIds
  }
  if (property.type === "files") {
    if (!Array.isArray(value) || value.length > 25) throw invalidValue()
    return value.map((file) => {
      if (!file || typeof file !== "object" || Array.isArray(file)) throw invalidValue()
      const record = file as Record<string, unknown>
      return {
        id: boundedString(record.id, 200),
        name: boundedString(record.name, 500),
        url: boundedString(record.url, 2_000),
      }
    })
  }
  throw invalidValue()
}

function boundedString(value: unknown, max: number) {
  if (typeof value !== "string" || value.length > max) throw invalidValue()
  return value
}
function stringArray(value: unknown, max: number) {
  if (!Array.isArray(value) || value.length > max || !value.every((item) => typeof item === "string" && item.length <= 200)) throw invalidValue()
  return [...new Set(value)] as string[]
}
function invalidValue() { return new MailPropertyError("Property value is invalid.", 400) }

async function findProperty(bindingId: string, propertyId: string) {
  const [property] = await db.select().from(mailProperty).where(and(eq(mailProperty.bindingId, bindingId), eq(mailProperty.id, propertyId))).limit(1)
  if (!property) throw new MailPropertyError("Mail property not found.", 404)
  return serializeProperty(property)
}

async function requireIndexedThread(gmailAccountId: string, threadId: string) {
  const [thread] = await db.select({ id: mailThreadIndex.id }).from(mailThreadIndex).where(and(
    eq(mailThreadIndex.gmailAccountId, gmailAccountId),
    eq(mailThreadIndex.gmailThreadId, threadId),
  )).limit(1)
  if (!thread) throw new MailPropertyError("Mail thread not found.", 404)
}

function serializeProperty(row: typeof mailProperty.$inferSelect): MailPropertyDefinition {
  return {
    bindingId: row.bindingId,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    name: row.name,
    options: normalizeStoredOptions(row.options),
    type: row.type as MailCustomPropertyType,
    updatedAt: row.updatedAt.toISOString(),
  }
}

function normalizeStoredOptions(value: unknown): MailPropertyOption[] {
  try { return normalizeOptions(value) } catch { return [] }
}
