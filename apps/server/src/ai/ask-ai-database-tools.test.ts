import assert from "node:assert/strict";
import { test } from "vitest";

import {
  AGENT_CREATABLE_DATABASE_PROPERTY_TYPES,
  AGENT_DATABASE_VIEW_TYPES,
} from "./ask-ai-database-tools";

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
