import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../../../../drizzle/0073_database_automations.sql", import.meta.url);

describe("database automation persistence", () => {
  it("creates every durable table and revision/receipt uniqueness boundary", async () => {
    const migration = await readFile(migrationUrl, "utf8");
    for (const table of [
      "database_automation",
      "database_automation_revision",
      "database_automation_dependency",
      "database_automation_event_window",
      "database_automation_run",
      "database_automation_step_run",
      "database_automation_delivery",
      "automation_secret",
    ]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(migration).toContain("database_automation_create_idempotency_unique");
    expect(migration).toContain("database_automation_revision_version_unique");
    expect(migration).toContain("database_automation_step_run_action_unique");
    expect(migration).toContain("database_automation_delivery_destination_unique");
  });

  it("stores secrets separately and never adds plaintext definition secret columns", async () => {
    const migration = await readFile(migrationUrl, "utf8");
    const automationTable = migration.slice(
      migration.indexOf('CREATE TABLE "database_automation"'),
      migration.indexOf('CREATE TABLE "database_automation_revision"'),
    );
    expect(automationTable).not.toMatch(/ciphertext|refresh_token|header_value/);
    expect(migration).toMatch(/"automation_secret"[\s\S]*"ciphertext" text NOT NULL[\s\S]*"iv" text NOT NULL/);
  });
});
