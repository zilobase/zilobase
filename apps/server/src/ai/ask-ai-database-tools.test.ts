import assert from "node:assert/strict";
import { test } from "vitest";

import { AGENT_CREATABLE_DATABASE_PROPERTY_TYPES } from "./ask-ai-database-tools";

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
