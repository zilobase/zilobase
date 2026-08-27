import assert from "node:assert/strict";
import { test } from "vitest";

import {
  buildAgentPolicyInstruction,
  resolveAgentCapabilityPolicy,
} from "./agent-capabilities";

test("agent capability policy excludes edits without server-resolved access", () => {
  const policy = resolveAgentCapabilityPolicy({
    canEditAttachedPages: false,
  });

  assert.equal(policy.hasCapability("workspace.search"), true);
  assert.equal(policy.hasCapability("page.content.update"), false);
  assert.equal(policy.hasCapability("page.comments.mutate"), false);
});

test("agent capability instruction carries explicit negative capabilities", () => {
  const instruction = buildAgentPolicyInstruction(
    resolveAgentCapabilityPolicy({ canEditAttachedPages: true }),
  );

  assert.match(instruction, /Do not create, edit, resolve, delete, or react/);
  assert.match(instruction, /Do not share content/);
  assert.match(instruction, /Page revision history is not retained/);
});
