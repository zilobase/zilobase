import { z } from "zod"

export const inProductNotificationSchema = z.object({
  actionId: z.string().nullable(),
  automationId: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().min(1),
  message: z.string().min(1).max(20_000),
  pageId: z.string().nullable(),
  readAt: z.string().datetime({ offset: true }).nullable(),
  runId: z.string().nullable(),
  workspaceId: z.string().min(1),
}).strict()
export type InProductNotification = z.infer<typeof inProductNotificationSchema>

export const inProductNotificationListSchema = z.object({
  notifications: z.array(inProductNotificationSchema),
  unreadCount: z.number().int().min(0),
}).strict()
export type InProductNotificationList = z.infer<typeof inProductNotificationListSchema>
