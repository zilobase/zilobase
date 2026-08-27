import assert from "node:assert/strict";
import { test } from "vitest";

import {
  buildAgentPolicyInstruction,
  resolveAgentCapabilityPolicy,
} from "./agent-capabilities";

test("agent capability policy keeps direct edits behind item-level checks", () => {
  const policy = resolveAgentCapabilityPolicy({
    canEditAttachedPages: false,
  });

  assert.equal(policy.hasCapability("workspace.search"), true);
  assert.equal(policy.hasCapability("page.content.update"), true);
  assert.deepEqual(
    policy.capabilities.find(
      (capability) => capability.id === "page.content.update",
    )?.toolNames,
    ["updateWorkspacePage"],
  );
  assert.equal(policy.hasCapability("page.comments.mutate"), false);
  assert.equal(policy.hasCapability("connected-apps.read"), false);
  assert.equal(policy.hasCapability("connected-apps.mutate"), false);
});

test("agent capability instruction carries explicit negative capabilities", () => {
  const instruction = buildAgentPolicyInstruction(
    resolveAgentCapabilityPolicy({ canEditAttachedPages: true }),
  );

  assert.match(instruction, /Do not create, edit, resolve, delete, or react/);
  assert.match(instruction, /Do not share content/);
  assert.match(instruction, /Page revision history is not retained/);
  assert.match(instruction, /native provider adapters/);
});
