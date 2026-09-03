import { and, eq } from "drizzle-orm";
import { type Context } from "hono";
import { type MailActionRequest, type MailBatchModifyRequest, type MailLabelWriteRequest, type MailModifyRequest, type MailView } from "@zilobase/features/mail";
import { db } from "../../infrastructure/database";
import { gmailAccount, gmailWorkspaceConnection, member } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";
import { invalidateDatabaseAutomationDependencies } from "../databases/automations/service";
import { GmailOauthError } from "./google-oauth";
import { clearGmailAccessTokenCache, createGmailGateway, GmailApiError } from "./gmail-gateway";
import { MailComposeError, parseMailComposeRequest } from "./mail-mime";
import { recordMailMetric } from "./mail-metrics";
import { MailConcurrencyError, withMailUserConcurrency } from "./user-concurrency";
import { MailViewServiceError } from "./mail-views";
import { MailPropertyError } from "./mail-properties";


export function oauthError(c: Context<AppBindings>, error: unknown) {
  const status = error instanceof GmailOauthError ? error.status : 500
  return c.json(
    { message: error instanceof Error ? error.message : "Gmail could not be connected." },
    status === 400 ? 400 : 500,
  )
}

export async function requireOwnedConnection(c: Context<AppBindings>) {
  const user = c.get("user")
  if (!user) return c.json({ message: "Authentication required." }, 401)
  const workspaceId = workspaceIdFromContext(c)!
  const membership = await requireWorkspaceMember(c, workspaceId, user.id)
  if (membership instanceof Response) return membership
  const [owned] = await db
    .select({ bindingId: gmailWorkspaceConnection.id, connection: gmailAccount })
    .from(gmailWorkspaceConnection)
    .innerJoin(
      gmailAccount,
      eq(gmailWorkspaceConnection.gmailAccountId, gmailAccount.id),
    )
    .where(and(
      eq(gmailWorkspaceConnection.workspaceId, workspaceId),
      eq(gmailWorkspaceConnection.userId, user.id),
      eq(gmailAccount.userId, user.id),
    ))
    .limit(1)
  if (!owned) return c.json({ message: "Connect Gmail to continue." }, 409)
  if (owned.connection.status !== "connected") {
    return c.json({ message: "Reconnect Gmail to continue." }, 409)
  }
  return {
    bindingId: owned.bindingId,
    connection: owned.connection,
    userId: user.id,
    workspaceId,
  }
}

export async function requireWorkspaceMailBinding(c: Context<AppBindings>) {
  return requireOwnedConnection(c)
}

export function optionalMailViewName(value: unknown) {
  return value === undefined || (
    typeof value === "string" && value.trim().length > 0 && value.trim().length <= 120
  )
}

export function optionalMailViewIcon(value: unknown) {
  return value === undefined || value === null || (
    typeof value === "string" && value.trim().length <= 80
  )
}

export function mailViewError(c: Context<AppBindings>, error: unknown) {
  if (error instanceof MailViewServiceError) {
    return c.json({ message: error.message }, error.status)
  }
  throw error
}

export function mailPropertyError(c: Context<AppBindings>, error: unknown) {
  if (error instanceof MailPropertyError) return c.json({ message: error.message }, error.status)
  throw error
}

export async function runMailOperation(
  c: Context<AppBindings>,
  userId: string,
  connection: typeof gmailAccount.$inferSelect,
  operation: (gateway: Awaited<ReturnType<typeof createGmailGateway>>) => Promise<Response>,
) {
  try {
    return await withMailUserConcurrency(userId, async () => {
      const gateway = await createGmailGateway(c.env, connection)
      return operation(gateway)
    })
  } catch (error) {
    if (error instanceof GmailApiError && error.code === "quota_exceeded") {
      await recordMailMetric("quota_failure", { connectionId: connection.id, code: error.code, status: error.status })
    }
    if (error instanceof GmailApiError && error.code === "authorization_revoked") {
      clearGmailAccessTokenCache(connection.id)
      const update = { lastErrorCode: error.code, status: "reconnect_required", updatedAt: new Date() }
      await db.update(gmailAccount).set(update).where(eq(gmailAccount.id, connection.id))
      await invalidateDatabaseAutomationDependencies({
        dependencyId: connection.id,
        dependencyType: "gmail_connection",
        reason: "Reconnect the automation owner's Gmail account",
      })
    }
    const status = error instanceof GmailApiError || error instanceof MailConcurrencyError
      ? error.status
      : 500
    return c.json(
      { message: error instanceof Error ? error.message : "The Gmail operation failed." },
      statusCode(status),
    )
  }
}

export function workspaceIdFromContext(c: Context<AppBindings>) {
  const workspaceId = c.req.param("workspaceId")
  return workspaceId && /^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)
    ? workspaceId
    : null
}

export async function requireWorkspaceMember(
  c: Context<AppBindings>,
  workspaceId: string,
  userId: string,
) {
  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(
      eq(member.organizationId, workspaceId),
      eq(member.userId, userId),
    ))
    .limit(1)
  return membership ?? c.json({ message: "Workspace membership is required." }, 403)
}

function statusCode(status: number): 400 | 401 | 404 | 409 | 429 | 500 | 502 | 504 {
  return [400, 401, 404, 409, 429, 500, 502, 504].includes(status)
    ? status as 400 | 401 | 404 | 409 | 429 | 500 | 502 | 504
    : 500
}

export function safeGmailId(value: string) {
  return /^[A-Za-z0-9_-]{1,512}$/.test(value) ? value : null
}

export function parseCompose(c: Context<AppBindings>, value: unknown, requireRecipient: boolean) {
  try {
    return parseMailComposeRequest(value, { requireRecipient })
  } catch (error) {
    return c.json({ message: error instanceof MailComposeError ? error.message : "A valid mail composition is required." }, 400)
  }
}

export function optionalCursor(value: unknown) {
  return value === undefined || (typeof value === "string" && value.length > 0 && value.length <= 1024)
}

export function optionalQuery(value: unknown) {
  return value === undefined || (typeof value === "string" && value.length <= 2048)
}

export function optionalIdList(value: unknown) {
  return value === undefined || (
    Array.isArray(value) &&
    value.length <= 5_000 &&
    value.every((id) => typeof id === "string" && safeGmailId(id) !== null)
  )
}

export function parseMailModifyRequest(value: unknown): MailModifyRequest | null {
  if (!value || typeof value !== "object") return null
  const input = value as Record<string, unknown>
  const addLabelIds = parseLabelIds(input.addLabelIds)
  const removeLabelIds = parseLabelIds(input.removeLabelIds)
  if (!addLabelIds || !removeLabelIds || addLabelIds.length + removeLabelIds.length === 0) return null
  if (addLabelIds.some((id) => removeLabelIds.includes(id))) return null
  return {
    ...(addLabelIds.length ? { addLabelIds } : {}),
    ...(removeLabelIds.length ? { removeLabelIds } : {}),
  }
}

export function parseMailBatchModifyRequest(value: unknown, limit: number): MailBatchModifyRequest | null {
  const modification = parseMailModifyRequest(value)
  if (!modification || !value || typeof value !== "object") return null
  const ids = (value as Record<string, unknown>).ids
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > limit) return null
  if (!ids.every((id) => typeof id === "string" && safeGmailId(id))) return null
  const uniqueIds = [...new Set(ids as string[])]
  if (uniqueIds.length !== ids.length) return null
  return { ...modification, ids: uniqueIds }
}

export function parseMailActionRequest(value: unknown): MailActionRequest | null {
  if (!value || typeof value !== "object") return null
  const action = (value as Record<string, unknown>).action
  return action === "restore" || action === "trash" ? { action } : null
}

export function parseMailLabelWriteRequest(value: unknown, creating: boolean): MailLabelWriteRequest | null {
  if (!value || typeof value !== "object") return null
  const input = value as Record<string, unknown>
  const output: MailLabelWriteRequest = {}
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 225 || /[\r\n\0]/.test(input.name)) return null
    output.name = input.name.trim()
  }
  if (input.labelListVisibility !== undefined) {
    if (!["labelHide", "labelShow", "labelShowIfUnread"].includes(input.labelListVisibility as string)) return null
    output.labelListVisibility = input.labelListVisibility as NonNullable<MailLabelWriteRequest["labelListVisibility"]>
  }
  if (input.messageListVisibility !== undefined) {
    if (!["hide", "show"].includes(input.messageListVisibility as string)) return null
    output.messageListVisibility = input.messageListVisibility as NonNullable<MailLabelWriteRequest["messageListVisibility"]>
  }
  if (input.color !== undefined) {
    if (isLabelColor(input.color)) output.color = {
      backgroundColor: input.color.backgroundColor,
      textColor: input.color.textColor,
    }
    else return null
  }
  return (creating ? Boolean(output.name) : Object.keys(output).length > 0) ? output : null
}

export function parseLabelIds(value: unknown) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 100) return null
  if (!value.every((id) => typeof id === "string" && safeGmailId(id))) return null
  const ids = [...new Set(value as string[])]
  return ids.length === value.length ? ids : null
}

export function isLabelColor(value: unknown): value is { backgroundColor: string; textColor: string } {
  if (!value || typeof value !== "object") return false
  const color = value as Record<string, unknown>
  return typeof color.backgroundColor === "string" && GMAIL_LABEL_COLORS.has(color.backgroundColor.toLowerCase()) &&
    typeof color.textColor === "string" && GMAIL_LABEL_COLORS.has(color.textColor.toLowerCase())
}

export function safeUserLabelId(value: string) {
  return /^Label_[A-Za-z0-9_-]{1,500}$/.test(value) ? value : null
}

const GMAIL_LABEL_COLORS = new Set([
  "#000000", "#434343", "#666666", "#999999", "#cccccc", "#efefef", "#f3f3f3", "#ffffff",
  "#fb4c2f", "#ffad47", "#fad165", "#16a766", "#43d692", "#4a86e8", "#a479e2", "#f691b3",
  "#f6c5be", "#ffe6c7", "#fef1d1", "#b9e4d0", "#c6f3de", "#c9daf8", "#e4d7f5", "#fcdee8",
  "#efa093", "#ffd6a2", "#fce8b3", "#89d3b2", "#a0eac9", "#a4c2f4", "#d0bcf1", "#fbc8d9",
  "#e66550", "#ffbc6b", "#fcda83", "#44b984", "#68dfa9", "#6d9eeb", "#b694e8", "#f7a7c0",
  "#cc3a21", "#eaa041", "#f2c960", "#149e60", "#3dc789", "#3c78d8", "#8e63ce", "#e07798",
  "#ac2b16", "#cf8933", "#d5ae49", "#0b804b", "#2a9c68", "#285bac", "#653e9b", "#b65775",
  "#822111", "#a46a21", "#aa8831", "#076239", "#1a764d", "#1c4587", "#41236d", "#83334c",
  "#464646", "#e7e7e7", "#0d3472", "#b6cff5", "#0d3b44", "#98d7e4", "#3d188e", "#e3d7ff",
  "#711a36", "#fbd3e0", "#8a1c0a", "#f2b2a8", "#7a2e0b", "#ffc8af", "#7a4706", "#ffdeb5",
  "#594c05", "#fbe983", "#684e07", "#fdedc1", "#0b4f30", "#b3efd3", "#04502e", "#a2dcc1",
  "#c2c2c2", "#4986e7", "#2da2bb", "#b99aff", "#994a64", "#f691b2", "#ff7537", "#ffad46",
  "#662e37", "#ebdbde", "#cca6ac", "#094228", "#42d692", "#16a765",
])

export function isMailView(value: unknown): value is MailView {
  return ["all_mail", "archive", "bin", "drafts", "inbox", "sent", "spam", "starred", "trash", "unread"].includes(value as string)
}

export function buildDesktopMailReturnUrl(input: {
  apiOrigin: string
  instanceId: string
}) {
  const deepLink = new URL("zilobase://open")
  deepLink.searchParams.set("instance", input.instanceId)
  deepLink.searchParams.set("path", "/mail?connection=success")
  deepLink.searchParams.set("server", input.apiOrigin)
  return deepLink
}

export function renderOauthResult(message: string, deepLink?: string) {
  const escapedMessage = escapeHtml(message)
  const escapedLink = deepLink ? escapeHtml(deepLink) : null
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gmail connection</title></head><body><main><h1>Gmail connection</h1><p>${escapedMessage}</p>${escapedLink ? `<p><a href="${escapedLink}">Open Zilobase Desktop</a></p>` : ""}</main></body></html>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
