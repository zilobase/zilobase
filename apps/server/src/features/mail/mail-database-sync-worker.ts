import { and, asc, eq, inArray, isNull, lt, lte, max, or } from "drizzle-orm"
import { evaluateMailFilterExpression, normalizeMailViewConfig, type MailAddress, type MailFilterRecord } from "@zilobase/features/mail"

import { requireDatabaseEditAccess } from "../databases/access/database-access"
import { requireDataSourceEditAccess } from "../databases/access/data-source-access"
import { commitDataSourceMutation } from "../databases/core/commit"
import { validateCellValue } from "../databases/properties/config"
import { fetchDatabaseRowDelta, fetchDatabaseValuesForPage } from "../databases/realtime/delta"
import { upsertPageItemPlacement } from "../pages/placements"
import { encodePageContentAsYjs } from "../collaboration/service"
import { db } from "../../infrastructure/database"
import {
  databaseDataSource,
  databaseProperty,
  databaseRow,
  gmailAccount,
  gmailWorkspaceConnection,
  imageAsset,
  mailDatabaseSyncOutbox,
  mailDatabaseSyncRecord,
  mailProperty,
  mailThreadIndex,
  mailThreadPropertyValue,
  mailView,
  page,
  pageCollaborationDocument,
  pageProperty,
  pagePropertyValue,
} from "../../infrastructure/database/schema"
import { createImageStorage } from "../../infrastructure/storage/image-storage"
import type { RuntimeEnv } from "../../shared/config/config"
import { createGmailGateway, type GmailGateway } from "./gmail-gateway"
import { normalizeGmailThread } from "./mail-normalize"

const LEASE_MS = 2 * 60 * 1_000
const MAX_ATTEMPTS = 8
const MAX_SYNC_ATTACHMENTS = 25

type IndexedRow = typeof mailThreadIndex.$inferSelect
type SyncRecord = typeof mailDatabaseSyncRecord.$inferSelect
type SourceProperty = { options: Array<{ id: string; name: string }> }

export async function enqueueMailDatabaseSyncForThread(gmailAccountId: string, gmailThreadId: string) {
  const [row] = await db.select().from(mailThreadIndex).where(and(
    eq(mailThreadIndex.gmailAccountId, gmailAccountId),
    eq(mailThreadIndex.gmailThreadId, gmailThreadId),
  )).limit(1)
  if (row) await enqueueMailDatabaseSyncForIndexedThread(row)
}

export async function enqueueMailDatabaseSyncForIndexedThread(row: IndexedRow) {
  const candidates = await db.select({
    bindingId: gmailWorkspaceConnection.id,
    config: mailView.config,
    viewId: mailView.id,
  }).from(mailView)
    .innerJoin(gmailWorkspaceConnection, eq(mailView.bindingId, gmailWorkspaceConnection.id))
    .where(eq(gmailWorkspaceConnection.gmailAccountId, row.gmailAccountId))
  if (!candidates.length) return 0
  const existingRecords = await db.select({ viewId: mailDatabaseSyncRecord.viewId })
    .from(mailDatabaseSyncRecord)
    .where(and(
      eq(mailDatabaseSyncRecord.gmailThreadId, row.gmailThreadId),
      inArray(mailDatabaseSyncRecord.viewId, candidates.map((candidate) => candidate.viewId)),
    ))
  const existingViewIds = new Set(existingRecords.map((record) => record.viewId))
  let enqueued = 0
  for (const candidate of candidates) {
    const config = normalizeMailViewConfig(candidate.config)
    const activatedAt = config.databaseSync.activatedAt ? Date.parse(config.databaseSync.activatedAt) : Number.NaN
    if (!config.databaseSync.enabled || !Number.isFinite(activatedAt)) continue
    const existing = existingViewIds.has(candidate.viewId)
    if (!existing && row.internalDate <= activatedAt) continue
    if (!existing) {
      const customValues = await loadCustomValues(candidate.bindingId, row.gmailThreadId)
      if (!evaluateMailFilterExpression(filterRecord(row, customValues), config.filter)) continue
    }
    const now = new Date()
    await db.insert(mailDatabaseSyncOutbox).values({
      attempts: 0,
      bindingId: candidate.bindingId,
      createdAt: now,
      gmailThreadId: row.gmailThreadId,
      id: crypto.randomUUID(),
      nextAttemptAt: now,
      sourceUpdatedAt: row.updatedAt,
      status: "pending",
      updatedAt: now,
      viewId: candidate.viewId,
    }).onConflictDoUpdate({
      target: [mailDatabaseSyncOutbox.viewId, mailDatabaseSyncOutbox.gmailThreadId],
      set: {
        attempts: 0,
        completedAt: null,
        lastError: null,
        leaseExpiresAt: null,
        nextAttemptAt: now,
        sourceUpdatedAt: row.updatedAt,
        status: "pending",
        updatedAt: now,
        workerId: null,
      },
    })
    enqueued += 1
  }
  return enqueued
}

export async function getMailDatabaseSyncViewStatus(bindingId: string, viewId: string) {
  const [view] = await db.select({ id: mailView.id }).from(mailView).where(and(eq(mailView.id, viewId), eq(mailView.bindingId, bindingId))).limit(1)
  if (!view) throw new MailDatabaseSyncPausedError("Mail view not found.")
  const [outbox, records] = await Promise.all([
    db.select({ lastError: mailDatabaseSyncOutbox.lastError, status: mailDatabaseSyncOutbox.status }).from(mailDatabaseSyncOutbox).where(and(eq(mailDatabaseSyncOutbox.bindingId, bindingId), eq(mailDatabaseSyncOutbox.viewId, viewId))),
    db.select({ status: mailDatabaseSyncRecord.status }).from(mailDatabaseSyncRecord).where(and(eq(mailDatabaseSyncRecord.bindingId, bindingId), eq(mailDatabaseSyncRecord.viewId, viewId))),
  ])
  const paused = outbox.filter((item) => item.status === "paused").length
  return {
    lastError: outbox.find((item) => item.status === "paused" && item.lastError)?.lastError ?? null,
    paused,
    pending: outbox.filter((item) => ["pending", "processing", "retry"].includes(item.status)).length,
    synced: records.length,
    viewId,
  }
}

export async function drainMailDatabaseSyncOutbox(env: RuntimeEnv, options: { bindingId?: string; limit?: number; workerId?: string } = {}) {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100))
  const workerId = options.workerId ?? `mail-sync:${crypto.randomUUID()}`
  const now = new Date()
  const candidates = await db.select().from(mailDatabaseSyncOutbox).where(and(
    ...(options.bindingId ? [eq(mailDatabaseSyncOutbox.bindingId, options.bindingId)] : []),
    lte(mailDatabaseSyncOutbox.nextAttemptAt, now),
    or(
      inArray(mailDatabaseSyncOutbox.status, ["pending", "retry"]),
      and(eq(mailDatabaseSyncOutbox.status, "processing"), or(isNull(mailDatabaseSyncOutbox.leaseExpiresAt), lt(mailDatabaseSyncOutbox.leaseExpiresAt, now))),
    ),
  )).orderBy(asc(mailDatabaseSyncOutbox.nextAttemptAt), asc(mailDatabaseSyncOutbox.createdAt)).limit(limit * 2)
  let completed = 0
  let paused = 0
  let retried = 0
  for (const candidate of candidates) {
    if (completed + paused + retried >= limit) break
    const [claimed] = await db.update(mailDatabaseSyncOutbox).set({
      leaseExpiresAt: new Date(Date.now() + LEASE_MS),
      status: "processing",
      updatedAt: new Date(),
      workerId,
    }).where(and(
      eq(mailDatabaseSyncOutbox.id, candidate.id),
      or(
        inArray(mailDatabaseSyncOutbox.status, ["pending", "retry"]),
        and(eq(mailDatabaseSyncOutbox.status, "processing"), or(isNull(mailDatabaseSyncOutbox.leaseExpiresAt), lt(mailDatabaseSyncOutbox.leaseExpiresAt, now))),
      ),
    )).returning()
    if (!claimed) continue
    try {
      await processClaimedMailDatabaseSync(env, claimed)
      await db.update(mailDatabaseSyncOutbox).set({
        completedAt: new Date(),
        lastError: null,
        leaseExpiresAt: null,
        status: "completed",
        updatedAt: new Date(),
        workerId: null,
      }).where(and(
        eq(mailDatabaseSyncOutbox.id, claimed.id),
        eq(mailDatabaseSyncOutbox.status, "processing"),
        eq(mailDatabaseSyncOutbox.workerId, workerId),
        eq(mailDatabaseSyncOutbox.sourceUpdatedAt, claimed.sourceUpdatedAt),
      ))
      completed += 1
    } catch (error) {
      if (isPermanentSyncError(error)) {
        await pauseSync(claimed, error)
        paused += 1
      } else {
        const attempts = claimed.attempts + 1
        if (attempts >= MAX_ATTEMPTS) {
          await pauseSync(claimed, error)
          paused += 1
        } else {
          await db.update(mailDatabaseSyncOutbox).set({
            attempts,
            lastError: errorMessage(error),
            leaseExpiresAt: null,
            nextAttemptAt: new Date(Date.now() + mailDatabaseSyncBackoffMs(attempts)),
            status: "retry",
            updatedAt: new Date(),
            workerId: null,
          }).where(and(eq(mailDatabaseSyncOutbox.id, claimed.id), eq(mailDatabaseSyncOutbox.workerId, workerId)))
          retried += 1
        }
      }
    }
  }
  return { completed, paused, retried }
}

async function processClaimedMailDatabaseSync(env: RuntimeEnv, claimed: typeof mailDatabaseSyncOutbox.$inferSelect) {
  const [job] = await db.select({
    account: gmailAccount,
    binding: gmailWorkspaceConnection,
    config: mailView.config,
  }).from(mailView)
    .innerJoin(gmailWorkspaceConnection, eq(mailView.bindingId, gmailWorkspaceConnection.id))
    .innerJoin(gmailAccount, eq(gmailWorkspaceConnection.gmailAccountId, gmailAccount.id))
    .where(and(eq(mailView.id, claimed.viewId), eq(gmailWorkspaceConnection.id, claimed.bindingId)))
    .limit(1)
  if (!job) throw new MailDatabaseSyncPausedError("Mail view or connection no longer exists.")
  const config = normalizeMailViewConfig(job.config)
  if (!config.databaseSync.enabled) return
  const databaseId = config.databaseSync.destinationDatabaseId
  const dataSourceId = config.databaseSync.destinationDataSourceId
  if (!databaseId || !dataSourceId || config.databaseSync.workspaceId !== job.binding.workspaceId) {
    throw new MailDatabaseSyncPausedError("Database sync configuration is incomplete.")
  }
  try {
    const [databaseRecord, sourceRecord] = await Promise.all([
      requireDatabaseEditAccess(databaseId, job.binding.userId),
      requireDataSourceEditAccess(dataSourceId, job.binding.userId),
    ])
    if (databaseRecord.workspaceId !== job.binding.workspaceId || sourceRecord.workspaceId !== job.binding.workspaceId) throw new Error()
    const [link] = await db.select({ id: databaseDataSource.dataSourceId }).from(databaseDataSource).where(and(eq(databaseDataSource.databaseId, databaseId), eq(databaseDataSource.dataSourceId, dataSourceId))).limit(1)
    if (!link) throw new Error()
  } catch {
    throw new MailDatabaseSyncPausedError("The destination is no longer accessible.")
  }
  if (job.account.status !== "connected") throw new Error("Gmail must be reconnected before synchronization can continue.")
  const [indexed] = await db.select().from(mailThreadIndex).where(and(eq(mailThreadIndex.gmailAccountId, job.account.id), eq(mailThreadIndex.gmailThreadId, claimed.gmailThreadId))).limit(1)
  if (!indexed) throw new MailDatabaseSyncPausedError("The indexed mail thread no longer exists.")
  const record = await ensureSyncRecord({
    bindingId: claimed.bindingId,
    dataSourceId,
    threadId: claimed.gmailThreadId,
    viewId: claimed.viewId,
  })
  const gateway = await createGmailGateway(env, job.account)
  const normalized = normalizeGmailThread(await gateway.getThread(claimed.gmailThreadId, "full"), true)
  await ensureSyncPage(env, record, dataSourceId, databaseId, job.binding.workspaceId, job.binding.userId, normalized.summary.subject)
  const [customValues, customProperties, destinationProperties] = await Promise.all([
    loadCustomValues(claimed.bindingId, claimed.gmailThreadId),
    loadMailProperties(claimed.bindingId),
    loadDestinationProperties(dataSourceId),
  ])
  const attachmentFiles = config.databaseSync.mappings.some((mapping) => mapping.sourcePropertyId === "attachments")
    ? await copyMappedAttachments(env, gateway, normalized.messages.flatMap((message) => message.attachments), record, databaseId, job.binding.userId, job.binding.workspaceId)
    : []
  const values = config.databaseSync.mappings.flatMap((mapping) => {
    if (mapping.destinationPropertyId === "title") return []
    const destination = destinationProperties.get(mapping.destinationPropertyId)
    if (!destination) throw new MailDatabaseSyncPausedError("A mapped destination property no longer exists.")
    const raw = sourceValue(mapping.sourcePropertyId, indexed, normalized, customValues, attachmentFiles)
    const value = coerceDestinationValue(raw, destination, customProperties.get(mapping.sourcePropertyId))
    try { validateCellValue(destination.type, destination.config, value) }
    catch { throw new MailDatabaseSyncPausedError(`The ${destination.name} mapping is no longer compatible.`) }
    return [{ propertyId: destination.id, value }]
  })
  await writeMappedValues({
    dataSourceId,
    env,
    record,
    title: normalized.summary.subject,
    userId: job.binding.userId,
    values,
  })
  await db.update(mailDatabaseSyncRecord).set({
    lastError: null,
    lastSourceUpdatedAt: claimed.sourceUpdatedAt,
    status: "active",
    updatedAt: new Date(),
  }).where(eq(mailDatabaseSyncRecord.id, record.id))
}

async function ensureSyncRecord(input: { bindingId: string; dataSourceId: string; threadId: string; viewId: string }) {
  const now = new Date()
  const id = crypto.randomUUID()
  await db.insert(mailDatabaseSyncRecord).values({
    bindingId: input.bindingId,
    createdAt: now,
    databaseRowId: `mail-sync-row:${id}`,
    destinationDataSourceId: input.dataSourceId,
    gmailThreadId: input.threadId,
    id,
    pageId: `mail-sync-page:${id}`,
    status: "active",
    updatedAt: now,
    viewId: input.viewId,
  }).onConflictDoNothing({ target: [mailDatabaseSyncRecord.viewId, mailDatabaseSyncRecord.gmailThreadId] })
  const [record] = await db.select().from(mailDatabaseSyncRecord).where(and(eq(mailDatabaseSyncRecord.viewId, input.viewId), eq(mailDatabaseSyncRecord.gmailThreadId, input.threadId))).limit(1)
  if (!record) throw new Error("Mail database sync record could not be created.")
  if (record.destinationDataSourceId !== input.dataSourceId) throw new MailDatabaseSyncPausedError("This thread is already synced to another destination.")
  return record
}

async function ensureSyncPage(env: RuntimeEnv, record: SyncRecord, dataSourceId: string, databaseId: string, workspaceId: string, userId: string, title: string) {
  await db.transaction(async (tx) => {
    const now = new Date()
    await tx.insert(page).values({
      content: null,
      createdAt: now,
      createdById: userId,
      hasContent: false,
      id: record.pageId,
      metadata: null,
      name: title || "Untitled",
      type: "pageblock",
      updatedAt: now,
      url: "#",
      workspaceId,
    }).onConflictDoNothing()
    await tx.insert(pageCollaborationDocument).values({ pageId: record.pageId, state: Buffer.from(encodePageContentAsYjs(null)), updatedAt: now }).onConflictDoNothing()
  })
  const [existing] = await db.select({ deletedAt: databaseRow.deletedAt, id: databaseRow.id }).from(databaseRow).where(eq(databaseRow.id, record.databaseRowId)).limit(1)
  if (existing?.deletedAt) throw new MailDatabaseSyncPausedError("The synced database row was deleted.")
  if (!existing) {
    await commitDataSourceMutation({ actorId: userId, changed: ["rows"], dataSourceId, env }, async (tx) => {
      const [position] = await tx.select({ value: max(databaseRow.position) }).from(databaseRow).where(and(eq(databaseRow.dataSourceId, dataSourceId), isNull(databaseRow.deletedAt)))
      const now = new Date()
      await tx.insert(databaseRow).values({
        createdAt: now,
        createdById: userId,
        dataSourceId,
        id: record.databaseRowId,
        lastEditedById: userId,
        pageId: record.pageId,
        position: Number(position?.value ?? -1) + 1,
        updatedAt: now,
      }).onConflictDoNothing()
      await upsertPageItemPlacement(tx, {
        id: `mail-sync-placement:${record.id}`,
        itemId: record.pageId,
        itemKind: "page",
        parentId: databaseId,
        parentKind: "database",
        placementKind: "database_row",
        position: Number(position?.value ?? -1) + 1,
        sourceRowId: record.databaseRowId,
        workspaceId,
      })
      return { delta: await fetchDatabaseRowDelta(record.databaseRowId, tx) ?? { rows: [] } }
    })
  }
}

async function writeMappedValues(input: { dataSourceId: string; env: RuntimeEnv; record: SyncRecord; title: string; userId: string; values: Array<{ propertyId: string; value: unknown }> }) {
  await commitDataSourceMutation({ actorId: input.userId, changed: ["rows", "values"], dataSourceId: input.dataSourceId, env: input.env }, async (tx) => {
    const now = new Date()
    const [activeRow] = await tx.select({ id: databaseRow.id }).from(databaseRow).where(and(eq(databaseRow.id, input.record.databaseRowId), eq(databaseRow.dataSourceId, input.dataSourceId), isNull(databaseRow.deletedAt))).limit(1)
    if (!activeRow) throw new MailDatabaseSyncPausedError("The synced database row is unavailable.")
    await tx.update(page).set({ name: input.title || "Untitled", updatedAt: now }).where(and(eq(page.id, input.record.pageId), isNull(page.deletedAt)))
    for (const mapped of input.values) {
      await tx.insert(pagePropertyValue).values({ id: crypto.randomUUID(), pageId: input.record.pageId, propertyId: mapped.propertyId, value: mapped.value })
        .onConflictDoUpdate({ target: [pagePropertyValue.pageId, pagePropertyValue.propertyId], set: { updatedAt: now, value: mapped.value } })
    }
    await tx.update(databaseRow).set({ lastEditedById: input.userId, updatedAt: now }).where(eq(databaseRow.id, input.record.databaseRowId))
    const [rowDelta, values] = await Promise.all([
      fetchDatabaseRowDelta(input.record.databaseRowId, tx),
      fetchDatabaseValuesForPage(input.record.pageId, input.values.map((value) => value.propertyId), tx),
    ])
    return { delta: { ...(rowDelta ?? {}), values: values.map((value) => ({
      ...value,
      createdAt: value.createdAt.toISOString(),
      updatedAt: value.updatedAt.toISOString(),
    })) } }
  })
}

async function copyMappedAttachments(env: RuntimeEnv, gateway: GmailGateway, attachments: Array<{ attachmentId: string; filename: string; messageId: string; mimeType: string; size: number }>, record: SyncRecord, databaseId: string, userId: string, workspaceId: string) {
  if (attachments.length > MAX_SYNC_ATTACHMENTS) throw new MailDatabaseSyncPausedError(`A thread can sync at most ${MAX_SYNC_ATTACHMENTS} attachments.`)
  const storage = createImageStorage(env)
  const files: Array<{ id: string; name: string; url: string }> = []
  for (const attachment of attachments) {
    const id = `mail-sync-asset:${record.id}:${attachment.messageId}:${attachment.attachmentId}`
    const filename = safeFilename(attachment.filename)
    const objectKey = `org/${encodeURIComponent(workspaceId)}/page/${encodeURIComponent(record.pageId)}/mail/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`
    const [existing] = await db.select().from(imageAsset).where(eq(imageAsset.id, id)).limit(1)
    if (existing?.status !== "uploaded") {
      const response = await gateway.getAttachment(attachment.messageId, attachment.attachmentId)
      const body = await response.arrayBuffer()
      const now = new Date()
      await db.insert(imageAsset).values({
        byteSize: body.byteLength,
        contentType: attachment.mimeType,
        createdAt: now,
        createdById: userId,
        databaseId,
        filename,
        id,
        objectKey,
        pageId: record.pageId,
        status: "pending",
        workspaceId,
      }).onConflictDoUpdate({ target: imageAsset.id, set: { byteSize: body.byteLength, contentType: attachment.mimeType, filename, status: "pending" } })
      if (storage.mode === "s3") {
        const upload = await storage.createUploadUrl({ byteSize: body.byteLength, contentType: attachment.mimeType, expiresInSeconds: 600, objectKey })
        const uploaded = await fetch(upload.url, { body, headers: upload.headers, method: upload.method })
        if (!uploaded.ok) throw new Error(`Attachment storage rejected upload ${uploaded.status}.`)
      } else {
        await storage.putObject({ body, contentType: attachment.mimeType, objectKey })
      }
      await db.update(imageAsset).set({ status: "uploaded", uploadedAt: new Date() }).where(eq(imageAsset.id, id))
    }
    files.push({ id, name: filename, url: `/images/${encodeURIComponent(id)}` })
  }
  return files
}

async function loadDestinationProperties(dataSourceId: string) {
  const rows = await db.select({ config: pageProperty.config, id: pageProperty.id, name: pageProperty.name, type: pageProperty.type })
    .from(databaseProperty)
    .innerJoin(pageProperty, eq(databaseProperty.propertyId, pageProperty.id))
    .where(and(eq(databaseProperty.dataSourceId, dataSourceId), isNull(pageProperty.deletedAt)))
  return new Map(rows.map((row) => [row.id, row]))
}

async function loadMailProperties(bindingId: string) {
  const rows = await db.select().from(mailProperty).where(eq(mailProperty.bindingId, bindingId))
  return new Map(rows.map((row) => [row.id, {
    options: Array.isArray(row.options) ? row.options.flatMap((option): Array<{ id: string; name: string }> => {
      if (!option || typeof option !== "object") return []
      const id = (option as { id?: unknown }).id
      const name = (option as { name?: unknown }).name
      return typeof id === "string" && typeof name === "string" ? [{ id, name }] : []
    }) : [],
  } satisfies SourceProperty]))
}

async function loadCustomValues(bindingId: string, threadId: string) {
  const rows = await db.select({ propertyId: mailThreadPropertyValue.propertyId, value: mailThreadPropertyValue.value })
    .from(mailThreadPropertyValue)
    .innerJoin(mailProperty, eq(mailProperty.id, mailThreadPropertyValue.propertyId))
    .where(and(eq(mailProperty.bindingId, bindingId), eq(mailThreadPropertyValue.gmailThreadId, threadId)))
  return Object.fromEntries(rows.map((row) => [row.propertyId, row.value]))
}

function sourceValue(propertyId: string, indexed: IndexedRow, normalized: ReturnType<typeof normalizeGmailThread>, customValues: Record<string, unknown>, attachmentFiles: Array<{ id: string; name: string; url: string }>) {
  const latest = normalized.messages.at(-1)!
  switch (propertyId) {
    case "from": return indexed.fromAddresses
    case "to": return indexed.toAddresses
    case "cc": return indexed.ccAddresses
    case "bcc": return indexed.bccAddresses
    case "subject": return indexed.subject
    case "body": return latest.bodyText ?? latest.bodyHtml ?? ""
    case "date":
    case "received_date": return new Date(indexed.internalDate).toISOString()
    case "attachments": return attachmentFiles
    case "calendar_event": return indexed.hasCalendarEvent
    case "unread": return indexed.unread
    case "sent": return indexed.labelIds.includes("SENT")
    case "archived": return !indexed.labelIds.some((label) => ["INBOX", "SENT", "DRAFT", "SPAM", "TRASH"].includes(label))
    case "starred": return indexed.starred
    case "important": return indexed.important
    case "labels": return indexed.labelIds
    case "categories": return indexed.labelIds.filter((label) => label.startsWith("CATEGORY_")).map((label) => label.slice(9).toLowerCase())
    case "priority": return indexed.important ? "Important" : "Normal"
    case "mailbox": return mailboxValues(indexed.labelIds)
    case "email_domain": return addressValues(indexed.fromAddresses).map((address) => address.split("@")[1]).filter(Boolean)
    default: return customValues[propertyId] ?? null
  }
}

function coerceDestinationValue(raw: unknown, destination: { config: unknown; type: string }, sourceProperty?: SourceProperty) {
  if (destination.type === "files") return raw
  const values = Array.isArray(raw) ? raw.map(plainValue) : [plainValue(raw)]
  const mappedValues = values.map((value) => sourceOptionName(value, sourceProperty))
  if (destination.type === "multi_select") return mappedValues.filter((value): value is string => typeof value === "string").map((value) => destinationOptionName(value, destination.config) ?? value)
  if (destination.type === "select" || destination.type === "status") {
    const value = mappedValues.find((item): item is string => typeof item === "string")
    return value ? destinationOptionName(value, destination.config) ?? value : ""
  }
  if (destination.type === "checkbox") return Boolean(values[0])
  if (destination.type === "number") {
    if (values[0] === null || values[0] === undefined || values[0] === "") return null
    const number = Number(values[0])
    return Number.isFinite(number) ? number : null
  }
  if (destination.type === "person") return Array.isArray(raw) ? raw : raw === null ? [] : [raw]
  if (destination.type === "date") return typeof values[0] === "string" ? values[0] : null
  return values.filter((value) => value !== null && value !== undefined).join(", ")
}

function sourceOptionName(value: unknown, property?: SourceProperty) {
  if (typeof value !== "string" || !property) return value
  return property.options.find((option) => option.id === value)?.name ?? value
}

function destinationOptionName(value: string, config: unknown) {
  const options = config && typeof config === "object" && "options" in config ? (config as { options?: unknown }).options : null
  if (!Array.isArray(options)) return null
  const match = options.find((option) => option && typeof option === "object" && (
    String((option as { id?: unknown }).id ?? "").toLowerCase() === value.toLowerCase() ||
    String((option as { name?: unknown }).name ?? "").toLowerCase() === value.toLowerCase()
  )) as { name?: unknown } | undefined
  return typeof match?.name === "string" ? match.name : null
}

function filterRecord(row: IndexedRow, customValues: Record<string, unknown>): MailFilterRecord {
  return {
    attachmentCount: row.attachmentCount,
    bcc: addresses(row.bccAddresses),
    cc: addresses(row.ccAddresses),
    customValues,
    from: addresses(row.fromAddresses),
    hasCalendarEvent: row.hasCalendarEvent,
    important: row.important,
    internalDate: row.internalDate,
    labelIds: row.labelIds,
    starred: row.starred,
    subject: row.subject,
    to: addresses(row.toAddresses),
    unread: row.unread,
  }
}

function addresses(value: unknown): MailAddress[] {
  return Array.isArray(value) ? value.flatMap((item) => item && typeof item === "object" && typeof (item as { address?: unknown }).address === "string" ? [{ address: (item as { address: string }).address, name: typeof (item as { name?: unknown }).name === "string" ? (item as { name: string }).name : null }] : []) : []
}

function addressValues(value: unknown) { return addresses(value).map((item) => item.address) }
function plainValue(value: unknown) { return value && typeof value === "object" && "address" in value ? String((value as { address: unknown }).address) : value }
function mailboxValues(labels: string[]) {
  const values = [labels.includes("INBOX") ? "inbox" : null, labels.includes("SENT") ? "sent" : null, labels.includes("DRAFT") ? "drafts" : null, labels.includes("SPAM") ? "spam" : null, labels.includes("TRASH") ? "bin" : null].filter((value): value is string => Boolean(value))
  if (!values.length) values.push("archive")
  values.push("all_mail")
  return values
}
function safeFilename(value: string) { return value.split(/[\\/]/).pop()?.replace(/[^\w.-]+/g, "-").slice(0, 120) || "attachment" }
function errorMessage(error: unknown) { return (error instanceof Error ? error.message : String(error)).slice(0, 1_000) }
function isPermanentSyncError(error: unknown) { return error instanceof MailDatabaseSyncPausedError }

async function pauseSync(claimed: typeof mailDatabaseSyncOutbox.$inferSelect, error: unknown) {
  const message = errorMessage(error)
  const [paused] = await db.update(mailDatabaseSyncOutbox).set({ lastError: message, leaseExpiresAt: null, status: "paused", updatedAt: new Date(), workerId: null }).where(and(
    eq(mailDatabaseSyncOutbox.id, claimed.id),
    eq(mailDatabaseSyncOutbox.sourceUpdatedAt, claimed.sourceUpdatedAt),
    eq(mailDatabaseSyncOutbox.status, "processing"),
    ...(claimed.workerId ? [eq(mailDatabaseSyncOutbox.workerId, claimed.workerId)] : []),
  )).returning({ id: mailDatabaseSyncOutbox.id })
  if (paused) await db.update(mailDatabaseSyncRecord).set({ lastError: message, status: "paused", updatedAt: new Date() }).where(and(eq(mailDatabaseSyncRecord.viewId, claimed.viewId), eq(mailDatabaseSyncRecord.gmailThreadId, claimed.gmailThreadId)))
}

export function mailDatabaseSyncBackoffMs(attempts: number) {
  return Math.min(60 * 60 * 1_000, 5_000 * 2 ** Math.max(0, attempts - 1))
}

export class MailDatabaseSyncPausedError extends Error {
  constructor(message: string) { super(message); this.name = "MailDatabaseSyncPausedError" }
}
