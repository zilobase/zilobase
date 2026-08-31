import assert from "node:assert/strict";
import { test } from "vitest";

import { AI_AGENT_SYSTEM_PROMPT } from "./agent-system-prompt";

test("agent prompt turns natural goals into complete implementations", () => {
  assert.match(AI_AGENT_SYSTEM_PROMPT, /plain-language goal/i);
  assert.match(AI_AGENT_SYSTEM_PROMPT, /Do not make the user supply IDs, property types, view mechanics, or a list of microsteps/i);
  assert.match(AI_AGENT_SYSTEM_PROMPT, /buildDatabaseFromBlueprint/);
  assert.match(AI_AGENT_SYSTEM_PROMPT, /exact properties, views, filters, and rows/i);
  assert.match(AI_AGENT_SYSTEM_PROMPT, /Ask one concise question only when/i);
  assert.match(AI_AGENT_SYSTEM_PROMPT, /standalone full-page database/i);
  assert.match(AI_AGENT_SYSTEM_PROMPT, /Do not choose inline merely because a page is attached/i);
  assert.match(AI_AGENT_SYSTEM_PROMPT, /Never repeat it as an H1/i);
});
