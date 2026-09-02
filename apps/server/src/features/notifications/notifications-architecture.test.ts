import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("notifications use a durable inbox, delivery receipt, and polling-safe outbox", async () => {
  const [migration, service, outbox, routes] = await Promise.all([
    readFile(new URL("../../../drizzle/0074_in_product_notifications.sql", import.meta.url), "utf8"),
    readFile(new URL("./service.ts", import.meta.url), "utf8"),
    readFile(new URL("./outbox.ts", import.meta.url), "utf8"),
    readFile(new URL("./routes.ts", import.meta.url), "utf8"),
  ]);
  expect(migration).toContain('CREATE UNIQUE INDEX "in_product_notification_run_recipient_unique"');
  expect(migration).toContain('CREATE TABLE "in_product_notification_outbox"');
  expect(service).toContain("databaseAutomationDelivery");
  expect(service).toContain("onConflictDoNothing()");
  expect(outbox).toContain("publishInProductNotification");
  expect(outbox).toContain("nextAttemptAt");
  expect(routes).toContain('notifications/:notificationId/read');
});

test("notification actions deduplicate, bound, and access-filter recipients", async () => {
  const engine = await readFile(new URL("../databases/automations/run-engine.ts", import.meta.url), "utf8");
  expect(engine).toContain("new Set(candidates)");
  expect(engine).toContain("uniqueCandidates.length > 20");
  expect(engine).toContain("activeNotificationRecipientIds");
  expect(engine).toContain("getEffectivePageAccessForUsers");
  expect(engine).toContain("AUTOMATION_NOTIFICATION_NO_RECIPIENTS");
});
