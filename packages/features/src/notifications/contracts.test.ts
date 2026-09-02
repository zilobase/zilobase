import assert from "node:assert/strict"
import test from "node:test"

import { inProductNotificationListSchema } from "./contracts"

test("notification inbox contracts expose only sanitized delivery fields", () => {
  const parsed = inProductNotificationListSchema.parse({
    notifications: [{
      actionId: "action-1",
      automationId: "automation-1",
      createdAt: "2026-09-02T00:00:00.000Z",
      id: "notification-1",
      message: "A task needs review",
      pageId: "page-1",
      readAt: null,
      runId: "run-1",
      workspaceId: "workspace-1",
    }],
    unreadCount: 1,
  })
  assert.equal(parsed.notifications[0]?.message, "A task needs review")
  assert.equal("destinationHash" in parsed.notifications[0]!, false)
})
