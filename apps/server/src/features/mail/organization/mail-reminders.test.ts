import { getTableConfig } from "drizzle-orm/pg-core";
import { mailReminder } from "../../../infrastructure/database/schema";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

const readMailRouteSources = async () => readFile(new URL("./routes.ts", import.meta.url), "utf8");

test("mail reminders are binding scoped, unique per thread, and publish expiry invalidation", async () => {
  const [service, routes] = await Promise.all([
    readFile(new URL("./mail-reminders.ts", import.meta.url), "utf8"),
    readMailRouteSources(),
  ]);
  assert.ok(
    getTableConfig(mailReminder).indexes.some(
      (index) => index.config.name === "mail_reminder_binding_thread_unique",
    ),
  );
  assert.match(service, /eq\(mailReminder\.bindingId, bindingId\)/);
  assert.match(service, /lte\(mailReminder\.remindAt, new Date\(\)\)/);
  assert.match(service, /addLabelIds: \["INBOX"\]/);
  assert.match(service, /publishMailNotification/);
  for (const route of [
    'get("/reminders"',
    'post("/threads/:threadId/remind"',
    'delete("/reminders/:reminderId"',
    'post("/reminders/advance"',
  ])
    assert.ok(routes.includes(route));
});
