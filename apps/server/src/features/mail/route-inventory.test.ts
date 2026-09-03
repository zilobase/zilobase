import { describe, expect, it } from "vitest"

import { mailProviderRoutes, mailRoutes } from "./routes"

const inventory = (routes: typeof mailRoutes) =>
  routes.routes.map(({ method, path }) => `${method} ${path}`)

describe("mail route composition", () => {
  it("preserves workspace route order and middleware", () => {
    expect(inventory(mailRoutes)).toEqual([
      "ALL /*",
      "GET /connection",
      "POST /oauth/start",
      "DELETE /connection",
      "GET /views",
      "GET /views/:viewId/database-sync-status",
      "GET /reminders",
      "POST /threads/:threadId/remind",
      "DELETE /reminders/:reminderId",
      "POST /reminders/advance",
      "POST /threads/:threadId/unsubscribe",
      "GET /index/status",
      "POST /index/advance",
      "POST /query",
      "POST /query/groups",
      "GET /properties",
      "POST /properties",
      "PATCH /properties/:propertyId",
      "DELETE /properties/:propertyId",
      "GET /threads/:threadId/properties",
      "PUT /threads/:threadId/properties/:propertyId",
      "POST /views",
      "PUT /views/reorder",
      "POST /views/:viewId/duplicate",
      "PATCH /views/:viewId",
      "DELETE /views/:viewId",
      "POST /sync",
      "GET /threads/:threadId",
      "GET /messages/:messageId",
      "GET /messages/:messageId/attachments/:attachmentId",
      "GET /labels",
      "POST /labels",
      "PATCH /labels/:labelId",
      "DELETE /labels/:labelId",
      "POST /threads/batch-modify",
      "POST /messages/batch-modify",
      "POST /threads/:threadId/modify",
      "POST /messages/:messageId/modify",
      "POST /threads/:threadId/action",
      "POST /messages/:messageId/action",
      "POST /drafts",
      "PUT /drafts/:draftId",
      "DELETE /drafts/:draftId",
      "POST /drafts/:draftId/send",
      "POST /send",
      "POST /realtime-ticket",
    ])
  })

  it("preserves public provider callbacks and middleware", () => {
    expect(inventory(mailProviderRoutes)).toEqual([
      "ALL /*",
      "GET /oauth/google/callback",
      "POST /google/pubsub",
    ])
  })
})
