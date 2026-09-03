import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const featuresRoot = new URL("../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, featuresRoot), "utf8");

describe("database automation mutation-path audit", () => {
  it("captures every current eligible row/title/property mutation boundary", async () => {
    const [cell, rows, position, template, mail, pages, ai] = await Promise.all([
      read("databases/properties/cell-service.ts"),
      read("databases/rows/service.ts"),
      read("databases/rows/position-service.ts"),
      read("databases/templates/service.ts"),
      read("mail/mail-database-sync-worker.ts"),
      read("pages/page-routes.ts"),
      read("ai/tools/ask-ai-database-tools.ts"),
    ]);

    expect(cell).toMatch(/automationFacts:[\s\S]*before: previous\?\.value/);
    expect(rows).toMatch(/rowAdded: true/);
    expect(position).toMatch(/before: previousValue\?\.value/);
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
      read("databases/properties/duplication-service.ts"),
      read("demo/seed.ts"),
      read("meetings/meeting-service.ts"),
    ]);

    for (const source of files) {
      expect(source).toContain("automation-origin: system");
    }
  });

  it("captures facts within the canonical transaction and keeps realtime independent", async () => {
    const [commit, capture, realtime] = await Promise.all([
      read("databases/core/commit.ts"),
      read("databases/automations/event-capture.ts"),
      read("databases/realtime/delta.ts"),
    ]);

    expect(commit).toMatch(
      /await captureDatabaseAutomationMutationFacts\([\s\S]*mutationResult\.automationFacts/,
    );
    expect(capture).toContain("pg_advisory_xact_lock");
    expect(capture).toContain("DATABASE_AUTOMATION_EVENT_WINDOW_MS = 3_000");
    expect(realtime).not.toContain("DatabaseAutomationMutationFact");
  });

  it("uses canonical page-property IDs in automation definitions", async () => {
    const service = await read("databases/automations/service.ts");

    expect(service).toContain("id: pageProperty.id");
    expect(service).not.toContain("id: databaseProperty.id");
  });
});
