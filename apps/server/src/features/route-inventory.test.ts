import { describe, expect, it } from "vitest";

import { databaseRoutes } from "./databases/database-routes";
import { pageRoutes } from "./pages/page-routes";

const inventory = (routes: typeof pageRoutes) =>
  routes.routes.map(({ method, path }) => `${method} ${path}`);

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
      "GET /:id",
      "POST /:id/realtime-ticket",
      "GET /:id/published",
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
      "PATCH /:id",
      "PATCH /data-sources/:dataSourceId",
      "PATCH /:id/views/:viewId",
      "POST /:id/views",
      "POST /:id/data-sources/new",
      "POST /:id/data-sources",
      "PUT /:id/views/:viewId/source",
      "DELETE /:id/data-sources/:dataSourceId",
      "DELETE /:id/views/:viewId",
      "POST /:id/apply-template",
      "POST /:id/properties",
      "PATCH /:id/properties/reorder",
      "PATCH /:id/properties/:databasePropertyId",
      "POST /:id/properties/:databasePropertyId/duplicate",
      "DELETE /:id/properties/:databasePropertyId",
      "POST /:id/rows",
      "PATCH /:id/rows/reorder",
      "PATCH /:id/rows/:rowId/move",
      "PUT /:id/rows/:rowId/properties/:propertyId",
    ]);
  });
});
