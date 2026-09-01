import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "vitest"

test("mail reminders are binding scoped, unique per thread, and publish expiry invalidation", async () => {
  const [service, routes, schema] = await Promise.all([
    readFile(new URL("./mail-reminders.ts", import.meta.url), "utf8"),
    readFile(new URL("./routes.ts", import.meta.url), "utf8"),
    readFile(new URL("../../infrastructure/database/schema.ts", import.meta.url), "utf8"),
  ])
  assert.match(schema, /mail_reminder_binding_thread_unique/)
  assert.match(service, /eq\(mailReminder\.bindingId, bindingId\)/)
  assert.match(service, /lte\(mailReminder\.remindAt, new Date\(\)\)/)
  assert.match(service, /addLabelIds: \["INBOX"\]/)
  assert.match(service, /publishMailNotification/)
  for (const route of ['get("/reminders"', 'post("/threads/:threadId/remind"', 'delete("/reminders/:reminderId"', 'post("/reminders/advance"']) assert.ok(routes.includes(route))
})
