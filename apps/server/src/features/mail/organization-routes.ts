import { Hono } from "hono";
import { mailSystemFolderIds, mailViewTemplateIds, type MailViewConfig, type MailViewTemplateId } from "@zilobase/features/mail";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { createMailView, deleteMailView, duplicateMailView, listMailViews, reorderMailViews, updateMailView } from "./mail-views";
import { getMailIndexProgress } from "./mail-index";
import { createMailProperty, deleteMailProperty, listMailProperties, listMailThreadPropertyValues, setMailThreadPropertyValue, updateMailProperty } from "./mail-properties";
import { advanceMailReminders, cancelMailReminder, listMailReminders, MailReminderError, scheduleMailReminder } from "./mail-reminders";
import { getMailDatabaseSyncViewStatus, MailDatabaseSyncPausedError } from "./mail-database-sync-worker";
import { requireWorkspaceMailBinding, optionalMailViewName, optionalMailViewIcon, mailViewError, mailPropertyError, runMailOperation, safeGmailId } from "./route-support";

export const mailViewStatusRoutes = new Hono<AppBindings>();
export const mailOrganizationRoutes = new Hono<AppBindings>();

mailViewStatusRoutes.get("/views", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    const [views, index] = await Promise.all([
      listMailViews(owned.bindingId),
      getMailIndexProgress(owned.connection.id),
    ])
    return c.json({
      index,
      systemFolders: mailSystemFolderIds,
      views,
    })
  } catch (error) {
    return mailViewError(c, error)
  }
})

mailViewStatusRoutes.get("/views/:viewId/database-sync-status", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    return c.json(await getMailDatabaseSyncViewStatus(owned.bindingId, c.req.param("viewId")))
  } catch (error) {
    if (error instanceof MailDatabaseSyncPausedError) return c.json({ message: error.message }, 404)
    throw error
  }
})

mailViewStatusRoutes.get("/reminders", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  return c.json({ reminders: await listMailReminders(owned.bindingId) })
})

mailViewStatusRoutes.post("/threads/:threadId/remind", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const threadId = safeGmailId(c.req.param("threadId"))
  const body = (await readJsonBody(c.req)) as { remindAt?: unknown } | null
  if (!threadId || !body || typeof body.remindAt !== "string") return c.json({ message: "A valid mail reminder is required." }, 400)
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => {
    try {
      return c.json({ reminder: await scheduleMailReminder({ bindingId: owned.bindingId, gateway, remindAt: new Date(body.remindAt as string), threadId }) }, 201)
    } catch (error) {
      if (error instanceof MailReminderError) return c.json({ message: error.message }, error.status)
      throw error
    }
  })
})

mailViewStatusRoutes.delete("/reminders/:reminderId", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try { return c.json(await cancelMailReminder(owned.bindingId, c.req.param("reminderId"))) }
  catch (error) { if (error instanceof MailReminderError) return c.json({ message: error.message }, error.status); throw error }
})

mailViewStatusRoutes.post("/reminders/advance", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  return runMailOperation(c, owned.userId, owned.connection, async (gateway) => c.json(await advanceMailReminders({
    bindingId: owned.bindingId,
    connectionId: owned.connection.id,
    env: c.env,
    gateway,
    userId: owned.userId,
    workspaceId: owned.workspaceId,
  })))
})


mailOrganizationRoutes.get("/properties", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  return c.json(await listMailProperties(owned.bindingId, owned.workspaceId))
})

mailOrganizationRoutes.post("/properties", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    const property = await createMailProperty({
      bindingId: owned.bindingId,
      value: await readJsonBody(c.req),
    })
    return c.json({ property }, 201)
  } catch (error) {
    return mailPropertyError(c, error)
  }
})

mailOrganizationRoutes.patch("/properties/:propertyId", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    return c.json({ property: await updateMailProperty({
      bindingId: owned.bindingId,
      propertyId: c.req.param("propertyId"),
      value: await readJsonBody(c.req),
    }) })
  } catch (error) {
    return mailPropertyError(c, error)
  }
})

mailOrganizationRoutes.delete("/properties/:propertyId", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    return c.json(await deleteMailProperty({ bindingId: owned.bindingId, propertyId: c.req.param("propertyId") }))
  } catch (error) {
    return mailPropertyError(c, error)
  }
})

mailOrganizationRoutes.get("/threads/:threadId/properties", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    return c.json({ values: await listMailThreadPropertyValues({
      bindingId: owned.bindingId,
      gmailAccountId: owned.connection.id,
      threadId: c.req.param("threadId"),
    }) })
  } catch (error) {
    return mailPropertyError(c, error)
  }
})

mailOrganizationRoutes.put("/threads/:threadId/properties/:propertyId", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const body = (await readJsonBody(c.req)) as Record<string, unknown> | null
  if (!body || !Object.hasOwn(body, "value")) return c.json({ message: "A property value is required." }, 400)
  try {
    return c.json({ value: await setMailThreadPropertyValue({
      bindingId: owned.bindingId,
      gmailAccountId: owned.connection.id,
      propertyId: c.req.param("propertyId"),
      threadId: c.req.param("threadId"),
      value: body.value,
      workspaceId: owned.workspaceId,
    }) })
  } catch (error) {
    return mailPropertyError(c, error)
  }
})

mailOrganizationRoutes.post("/views", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const body = (await readJsonBody(c.req)) as Record<string, unknown> | null
  if (
    !body ||
    !optionalMailViewName(body.name) ||
    !optionalMailViewIcon(body.icon) ||
    (body.config !== undefined && (!body.config || typeof body.config !== "object"))
  ) {
    return c.json({ message: "A valid mail view is required." }, 400)
  }
  const templateId = body.templateId === undefined
    ? undefined
    : mailViewTemplateIds.includes(body.templateId as MailViewTemplateId)
      ? body.templateId as MailViewTemplateId
      : null
  if (templateId === null) return c.json({ message: "Unknown mail view template." }, 400)
  try {
    const view = await createMailView({
      bindingId: owned.bindingId,
      userId: owned.userId,
      value: {
        ...(body.config !== undefined ? { config: body.config as MailViewConfig } : {}),
        ...(body.icon !== undefined ? { icon: body.icon as string | null } : {}),
        ...(body.name !== undefined ? { name: body.name as string } : {}),
        ...(templateId ? { templateId } : {}),
      },
      workspaceId: owned.workspaceId,
    })
    return c.json({ view }, 201)
  } catch (error) {
    return mailViewError(c, error)
  }
})

mailOrganizationRoutes.put("/views/reorder", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const body = (await readJsonBody(c.req)) as { viewIds?: unknown } | null
  if (
    !body ||
    !Array.isArray(body.viewIds) ||
    body.viewIds.length > 100 ||
    !body.viewIds.every((id): id is string => typeof id === "string" && Boolean(id))
  ) {
    return c.json({ message: "A valid mail view order is required." }, 400)
  }
  try {
    return c.json({
      views: await reorderMailViews({
        bindingId: owned.bindingId,
        viewIds: body.viewIds,
      }),
    })
  } catch (error) {
    return mailViewError(c, error)
  }
})

mailOrganizationRoutes.post("/views/:viewId/duplicate", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    const view = await duplicateMailView({
      bindingId: owned.bindingId,
      userId: owned.userId,
      viewId: c.req.param("viewId"),
      workspaceId: owned.workspaceId,
    })
    return c.json({ view }, 201)
  } catch (error) {
    return mailViewError(c, error)
  }
})

mailOrganizationRoutes.patch("/views/:viewId", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  const body = (await readJsonBody(c.req)) as Record<string, unknown> | null
  if (
    !body ||
    !optionalMailViewName(body.name) ||
    !optionalMailViewIcon(body.icon) ||
    (body.config !== undefined && (!body.config || typeof body.config !== "object"))
  ) {
    return c.json({ message: "A valid mail view update is required." }, 400)
  }
  try {
    const view = await updateMailView({
      bindingId: owned.bindingId,
      userId: owned.userId,
      value: {
        ...(body.config !== undefined ? { config: body.config as MailViewConfig } : {}),
        ...(body.icon !== undefined ? { icon: body.icon as string | null } : {}),
        ...(body.name !== undefined ? { name: body.name as string } : {}),
      },
      viewId: c.req.param("viewId"),
      workspaceId: owned.workspaceId,
    })
    return c.json({ view })
  } catch (error) {
    return mailViewError(c, error)
  }
})

mailOrganizationRoutes.delete("/views/:viewId", async (c) => {
  const owned = await requireWorkspaceMailBinding(c)
  if (owned instanceof Response) return owned
  try {
    return c.json(await deleteMailView({
      bindingId: owned.bindingId,
      viewId: c.req.param("viewId"),
    }))
  } catch (error) {
    return mailViewError(c, error)
  }
})

