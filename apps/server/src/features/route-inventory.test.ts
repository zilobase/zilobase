import { describe, expect, it } from "vitest";

import { databaseRoutes } from "./databases/database-routes";
import { dataSourceRealtimeRoutes } from "./databases/data-source-realtime-routes";
import { pageRoutes } from "./pages/page-routes";

const inventory = (routes: typeof pageRoutes) =>
  [...new Set(routes.routes.filter(({ method }) => method !== "ALL").map(({ method, path }) => `${method} ${path}`))];

describe("feature route composition", () => {
  it("preserves every page endpoint and its registration order", () => {
    expect(inventory(pageRoutes)).toEqual([
      "GET /",
      "POST /item-visits",
      "POST /",
      "POST /:id/move-teamspace",
      "POST /:id/convert-to-teamspace",
      "POST /:id/embed-item",
      "DELETE /:id/embed-item",
      "GET /:id",
      "GET /:id/published",
      "PUT /:id/favorite",
      "DELETE /:id/favorite",
      "GET /:id/access",
      "GET /:id/access-targets",
      "PUT /:id/access",
      "DELETE /:id/access/public",
      "DELETE /:id/access/:ruleId",
      "GET /:id/properties",
      "PUT /:id/properties/:propertyId/value",
      "POST /:id/collaboration-ticket",
      "PATCH /:id/content",
      "PATCH /:id",
      "POST /:id/restore",
      "DELETE /:id",
    ]);
  });

  it("preserves every database endpoint and its registration order", () => {
    expect(inventory(databaseRoutes)).toEqual([
      "POST /",
      "GET /:id/bootstrap",
      "GET /:id/export",
      "GET /:id/data-sources/:dataSourceId/records",
      "GET /:id/mutations",
      "POST /:id/realtime-ticket",
      "GET /:id/published",
      "POST /:id/commands",
      "POST /:id/data-sources/:dataSourceId/commands",
      "GET /:databaseId/automation-capability",
      "GET /:databaseId/automations",
      "POST /:databaseId/automations/validate",
      "POST /:databaseId/automation-secrets",
      "POST /:databaseId/automations",
      "GET /:databaseId/automations/audit",
      "GET /:databaseId/automations/:automationId",
      "GET /:databaseId/automations/:automationId/runs",
      "GET /:databaseId/automations/:automationId/runs/:runId",
      "PATCH /:databaseId/automations/:automationId",
      "POST /:databaseId/automations/:automationId/pause",
      "POST /:databaseId/automations/:automationId/resume",
      "POST /:databaseId/automations/:automationId/duplicate",
      "DELETE /:databaseId/automations/:automationId",
      "GET /:databaseId/automation-catalog",
      "POST /:databaseId/automation-slack/oauth/start",
      "GET /:databaseId/automation-slack/connections/:connectionId/channels",
      "DELETE /:databaseId/automation-slack/connections/:connectionId",
      "GET /:id/access",
      "PUT /:id/access",
      "DELETE /:id/access/public",
      "DELETE /:id/access/:ruleId",
      "PUT /:id/favorite",
      "DELETE /:id",
      "POST /:id/restore",
      "DELETE /:id/favorite",
    ]);
  });

  it("exposes source-keyed catch-up and realtime tickets", () => {
    expect(inventory(dataSourceRealtimeRoutes)).toEqual([
      "GET /:sourceId/mutations",
      "POST /:sourceId/realtime-ticket",
    ]);
  });
});
