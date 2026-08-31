import assert from "node:assert/strict";
import { test } from "vitest";

import { createAgentProgressPublisher } from "./agent-progress";

test("agent progress streams committed steps before the tool completes", () => {
  const chunks: Array<Record<string, unknown>> = [];
  let firstProgressCount = 0;
  const progress = createAgentProgressPublisher({
    debug: true,
    onFirstProgress: () => {
      firstProgressCount += 1;
    },
  });

  progress.attach({
    write(chunk: unknown) {
      chunks.push(chunk as Record<string, unknown>);
    },
  } as never);
  progress.startTool({
    title: "Build Release Tracker",
    toolCallId: "tool-1",
    toolName: "buildDatabaseFromBlueprint",
  });
  progress.startStep({
    key: "database",
    label: "Create database",
    phase: "container",
    toolCallId: "tool-1",
  });
  progress.finishStep({
    detail: "Created database db-1.",
    key: "database",
    toolCallId: "tool-1",
  });

  assert.equal(chunks[0]?.type, "data-agent-debug");
  assert.equal(
    (chunks[0]?.data as { kind: string }).kind,
    "stream-open",
  );
  const debugKinds = chunks
    .filter((chunk) => chunk.type === "data-agent-debug")
    .map((chunk) => (chunk.data as { kind: string }).kind);
  assert.deepEqual(debugKinds, [
    "stream-open",
    "tool-start",
    "step-start",
    "step-finish",
  ]);
  assert.equal(
    chunks.find((chunk) =>
      (chunk.data as { kind?: string }).kind === "tool-start"
    )?.transient,
    true,
  );

  const beforeFinish = chunks.at(-1)?.data as {
    status: string;
    steps: Array<{ status: string }>;
  };
  assert.equal(beforeFinish.status, "running");
  assert.equal(beforeFinish.steps[0]?.status, "completed");

  progress.finishTool({ toolCallId: "tool-1" });
  const afterFinish = chunks.at(-1)?.data as { status: string };
  assert.equal(afterFinish.status, "succeeded");
  assert.equal(firstProgressCount, 1);
});

test("agent progress retains partial work, row counts, and failed step", () => {
  const chunks: Array<Record<string, unknown>> = [];
  const progress = createAgentProgressPublisher();
  progress.attach({
    write(chunk: unknown) {
      chunks.push(chunk as Record<string, unknown>);
    },
  } as never);

  progress.startTool({
    title: "Build database",
    toolCallId: "tool-2",
    toolName: "buildDatabaseFromBlueprint",
  });
  progress.startStep({
    key: "rows",
    label: "Populate rows",
    phase: "rows",
    toolCallId: "tool-2",
  });
  progress.setRowProgress({ completed: 2, toolCallId: "tool-2", total: 5 });
  progress.finishStep({
    detail: "Row 3 failed.",
    failed: true,
    key: "rows",
    toolCallId: "tool-2",
  });
  progress.finishTool({ failed: true, toolCallId: "tool-2" });

  const snapshot = chunks.at(-1)?.data as {
    rowProgress: { completed: number; total: number };
    status: string;
    steps: Array<{ detail?: string; status: string }>;
  };
  assert.deepEqual(snapshot.rowProgress, { completed: 2, total: 5 });
  assert.equal(snapshot.status, "failed");
  assert.equal(snapshot.steps[0]?.status, "failed");
  assert.equal(snapshot.steps[0]?.detail, "Row 3 failed.");
});

test("late attachment replays the latest snapshot idempotently and effects stay transient", () => {
  const progress = createAgentProgressPublisher({ debug: true });
  progress.startTool({
    title: "Create page",
    toolCallId: "tool-3",
    toolName: "createPage",
  });
  const chunks: Array<Record<string, unknown>> = [];
  progress.attach({
    write(chunk: unknown) {
      chunks.push(chunk as Record<string, unknown>);
    },
  } as never);

  assert.equal(chunks[0]?.type, "data-agent-debug");
  assert.equal(
    (chunks[0]?.data as { kind: string }).kind,
    "stream-open",
  );
  assert.equal(chunks[1]?.id, "agent-progress:tool-3");
  progress.effect({
    detail: { id: "page-1" },
    kind: "page-upsert",
    pageId: "page-1",
    toolCallId: "tool-3",
    workspaceId: "workspace-1",
  });
  const effect = chunks.at(-1) as {
    data: { effectId: string };
    transient: boolean;
    type: string;
  };
  assert.equal(effect.type, "data-agent-effect");
  assert.equal(effect.transient, true);
  assert.ok(effect.data.effectId);
});

test("cancellation closes every running tool and preserves completed steps", () => {
  const chunks: Array<Record<string, unknown>> = [];
  const progress = createAgentProgressPublisher();
  progress.attach({
    write(chunk: unknown) {
      chunks.push(chunk as Record<string, unknown>);
    },
  } as never);
  progress.startTool({
    title: "Build database",
    toolCallId: "tool-4",
    toolName: "buildDatabaseFromBlueprint",
  });
  progress.startStep({
    key: "database",
    label: "Create database",
    phase: "container",
    toolCallId: "tool-4",
  });
  progress.finishStep({ key: "database", toolCallId: "tool-4" });
  progress.startStep({
    key: "property:status",
    label: "Add Status",
    phase: "schema",
    toolCallId: "tool-4",
  });

  progress.failRunningTools("Canceled by the user.");

  const snapshot = chunks.at(-1)?.data as {
    status: string;
    steps: Array<{ detail?: string; status: string }>;
  };
  assert.equal(snapshot.status, "failed");
  assert.equal(snapshot.steps[0]?.status, "completed");
  assert.equal(snapshot.steps[1]?.status, "failed");
  assert.equal(snapshot.steps[1]?.detail, "Canceled by the user.");
});
