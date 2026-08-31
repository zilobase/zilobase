import assert from "node:assert/strict";
import { test } from "vitest";

import {
  buildAgentPolicyInstruction,
  resolveAgentCapabilityPolicy,
} from "./agent-capabilities";
import { isFailedAgentToolResult } from "./agent-tool-registry";

test("structured tool failures are treated as failed executions", () => {
  assert.equal(isFailedAgentToolResult({ ok: false, status: "failed" }), true);
  assert.equal(isFailedAgentToolResult({ ok: true, status: "succeeded" }), false);
});

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
});

test("agent capability instruction carries explicit negative capabilities", () => {
  const instruction = buildAgentPolicyInstruction(
    resolveAgentCapabilityPolicy({ canEditAttachedPages: true }),
  );

  assert.match(instruction, /Do not create, edit, resolve, delete, or react/);
  assert.match(instruction, /Do not share content/);
  assert.match(instruction, /Page revision history is not retained/);
});

test("agent capability registry contains only native Zilobase tools", () => {
  const policy = resolveAgentCapabilityPolicy({ canEditAttachedPages: true });
  assert.deepEqual(
    policy.capabilities.map((capability) => capability.id),
    [
      "file.read",
      "data.analyze",
      "workspace.search",
      "page.read",
      "page.comments.read",
      "database.query",
      "artifact.create",
      "page.content.update",
      "page-database.configure",
      "page.revisions.read",
      "inbox.manage",
      "database.map-view.configure",
      "code.arbitrary.execute",
      "embed.non-pdf.read",
      "database.advanced.create",
      "page.comments.mutate",
      "page.permissions.mutate",
      "meeting.start",
      "reminder.create",
      "workspace.settings.mutate",
    ],
  );
});
