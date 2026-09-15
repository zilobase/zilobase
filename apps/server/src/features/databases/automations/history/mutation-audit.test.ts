import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const featuresRoot = new URL("../../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, featuresRoot), "utf8");

describe("database automation mutation-path audit", () => {
  it("captures every current eligible row/title/property mutation boundary", async () => {
    const [cell, rows, commands, template, mail, pages, ai] = await Promise.all([
      read("databases/properties/cell-service.ts"),
      read("databases/rows/service.ts"),
      read("databases/commands/row-handlers.ts"),
      read("databases/commands/template-apply-handler.ts"),
      read("mail/database-sync/mail-database-sync-worker.ts"),
      read("pages/page-content-routes.ts"),
      read("ai/tools/ask-ai-database-tools.ts"),
    ]);

    expect(cell).toMatch(/automationFacts:[\s\S]*before: previous\?\.value/);
    expect(rows).toMatch(/rowAdded: true/);
    expect(commands).toMatch(/if \(command\.group\)[\s\S]*writeValues/);
    expect(template).toMatch(/origin: "import" as const/);
    expect(mail).toMatch(/origin: "integration" as const/);
    expect(pages).toMatch(/propertyId: "name"/);
    expect(pages).toMatch(/c\.get\("authMethod"\) === "apiKey"/);
    expect(ai).toMatch(/origin: "ai"/);
  });

  it("keeps every remaining direct write under an explicit system suppression", async () => {
    const files = await Promise.all([
      read("pages/properties/upsert.ts"),
      read("databases/properties/service.ts"),
      read("demo/seed.ts"),
      read("meetings/lifecycle/meeting-operations.ts"),
    ]);

    for (const source of files) {
      expect(source).toContain("automation-origin: system");
    }
  });

  it("captures facts within the canonical transaction and keeps realtime independent", async () => {
    const [commit, capture] = await Promise.all([
      read("databases/core/commit.ts"),
      read("databases/automations/triggers/event-capture.ts"),
    ]);

    expect(commit).toMatch(
      /await captureDatabaseAutomationMutationFacts\([\s\S]*mutationResult\.automationFacts/,
    );
    expect(capture).toContain("pg_advisory_xact_lock");
    expect(capture).toContain("DATABASE_AUTOMATION_EVENT_WINDOW_MS = 3_000");
    expect(commit).not.toContain("buildLegacyDatabaseChangeset");
  });

  it("uses canonical page-property IDs in automation definitions", async () => {
    const service = await read("databases/automations/definition/definition-context.ts");

    expect(service).toContain("id: pageProperty.id");
    expect(service).not.toContain("id: databaseProperty.id");
  });
});
