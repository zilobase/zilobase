import assert from "node:assert/strict";
import { test } from "vitest";

import {
  AGENT_CREATABLE_DATABASE_PROPERTY_TYPES,
  AGENT_DATABASE_VIEW_TYPES,
  buildDatabaseConfigInstruction,
  databaseBlueprintSchema,
  resolveAgentGlyphConfig,
  resolveDatabaseBlueprintViewConfig,
  stripDuplicatePageTitleHeadings,
  type BlueprintPropertyRecord,
} from "./ask-ai-database-tools";

test("agent database instructions require an explicit placement decision", () => {
  const instruction = buildDatabaseConfigInstruction({
    allowedPageIds: [],
    primaryPageId: null,
  });

  assert.match(
    instruction,
    /standalone full-page database/i,
  );
  assert.match(instruction, /prefer one buildDatabaseFromBlueprint call/i);
  assert.match(instruction, /inline only when/i);
  assert.doesNotMatch(instruction, /always embeds/i);
  assert.match(
    instruction,
    /rowPageId.*readWorkspacePage.*updateWorkspacePage/i,
  );
  assert.match(
    instruction,
    /never use setDatabaseCellValue for page body content/i,
  );
  assert.match(instruction, /semantic icon name and palette color/i);
  assert.match(instruction, /Properties and views may receive a semantic icon glyph, but never a color/i);
  assert.match(instruction, /never call buildDatabaseFromBlueprint.*createPage.*createDatabase/i);
});

test("database blueprints validate safe icons and keep emoji mutually exclusive", () => {
  assert.equal(databaseBlueprintSchema.safeParse({
    databaseName: "Release Tracker",
    icon: { color: "orange", name: "rocket" },
    placement: "standalone",
    properties: [{
      icon: "check-circle",
      key: "status",
      name: "Status",
      type: "status",
    }, {
      icon: "place",
      key: "destination",
      name: "Destination",
      type: "place",
    }],
    views: [{
      icon: "kanban",
      name: "Board",
      type: "kanban",
    }],
  }).success, true);
  assert.equal(databaseBlueprintSchema.safeParse({
    databaseName: "Release Tracker",
    placement: "standalone",
    properties: [{
      icon: { color: "green", name: "check-circle" },
      key: "status",
      name: "Status",
      type: "status",
    }],
  }).success, false);
  assert.equal(databaseBlueprintSchema.safeParse({
    databaseName: "Release Tracker",
    icon: { color: "ultraviolet", name: "rocket" },
    placement: "standalone",
  }).success, false);
  assert.equal(databaseBlueprintSchema.safeParse({
    databaseName: "Release Tracker",
    emoji: "🚀",
    icon: { color: "orange", name: "rocket" },
    placement: "standalone",
  }).success, false);
});

test("property and view glyphs are sanitized and contain no palette color", () => {
  const config = resolveAgentGlyphConfig({
    config: {
      icon: "<svg onload=alert(1)></svg>",
      options: [{ id: "todo", name: "Todo" }],
    },
    fallbackKind: "property",
    includeFallback: true,
    name: "Status",
    requested: "check-circle",
    type: "status",
  });

  assert.deepEqual(config.options, [{ id: "todo", name: "Todo" }]);
  assert.equal(typeof config.icon, "string");
  assert.match(config.icon as string, /data-icon-library="phosphor"/);
  assert.doesNotMatch(config.icon as string, /data-icon-color=|onload=/i);
});

test("database blueprints distinguish standalone and inline placement", () => {
  assert.equal(databaseBlueprintSchema.safeParse({
    databaseName: "Release Tracker",
    placement: "standalone",
  }).success, true);
  assert.equal(databaseBlueprintSchema.safeParse({
    databaseName: "Release Tracker",
    placement: "inline",
  }).success, false);
  assert.equal(databaseBlueprintSchema.safeParse({
    databaseName: "Release Tracker",
    hostPage: { name: "Release Tracker" },
    placement: "inline",
  }).success, true);
  assert.equal(databaseBlueprintSchema.safeParse({
    databaseName: "Release Tracker",
    hostPage: { name: "Release Tracker" },
    placement: "standalone",
  }).success, false);
});

test("AI-created page bodies remove headings that duplicate the native title", () => {
  assert.equal(
    stripDuplicatePageTitleHeadings(
      "# 🚀 Release Tracker\n\nCoordinate release readiness.\n\n## Risks",
      "Release Tracker",
    ),
    "Coordinate release readiness.\n\n## Risks",
  );
  assert.equal(
    stripDuplicatePageTitleHeadings(
      "# Release plan\n\nKeep this distinct heading.",
      "Release Tracker",
    ),
    "# Release plan\n\nKeep this distinct heading.",
  );
});

test("database blueprints resolve friendly property references for views", () => {
  const properties = new Map<string, BlueprintPropertyRecord>();
  const status = {
    databasePropertyId: "database-status",
    key: "status",
    name: "Status",
    pagePropertyId: "page-status",
    type: "status",
  };
  const date = {
    databasePropertyId: "database-date",
    key: "date",
    name: "Date",
    pagePropertyId: "page-date",
    type: "date",
  };
  properties.set("status", status);
  properties.set("date", date);

  const config = resolveDatabaseBlueprintViewConfig({
    filters: [{
      operator: "is_relative_to_today",
      property: "date",
      values: ["relative:this:week"],
    }],
    name: "This week",
    sorts: [{ direction: "ascending", property: "date" }],
    type: "kanban",
  }, properties);

  assert.equal(config.filters?.[0]?.propertyId, "database-date");
  assert.deepEqual(config.filters?.[0]?.values, ["relative:this:week"]);
  assert.equal(config.sorts?.[0]?.column, "database-date");
  assert.equal(config.groupPropertyId, "page-status");
});

test("agent database tools exclude forbidden advanced property creation", () => {
  assert.equal(AGENT_CREATABLE_DATABASE_PROPERTY_TYPES.includes("relation"), true);
  assert.equal(
    (AGENT_CREATABLE_DATABASE_PROPERTY_TYPES as readonly string[]).includes(
      "formula",
    ),
    false,
  );
  assert.equal(
    (AGENT_CREATABLE_DATABASE_PROPERTY_TYPES as readonly string[]).includes(
      "rollup",
    ),
    false,
  );
  assert.equal(
    (AGENT_CREATABLE_DATABASE_PROPERTY_TYPES as readonly string[]).includes(
      "button",
    ),
    false,
  );
});

test("agent database tools expose only implemented view types", () => {
  assert.equal(AGENT_DATABASE_VIEW_TYPES.includes("form"), true);
  assert.equal(
    (AGENT_DATABASE_VIEW_TYPES as readonly string[]).includes("map"),
    false,
  );
});
