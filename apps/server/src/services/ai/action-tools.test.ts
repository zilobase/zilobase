import { expect, test, vi } from "vitest";
import type { ServerOperationContext } from "../operations/context";
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../actions/execute", async (actual) => ({
  ...(await actual<typeof import("../actions/execute")>()),
  executeWorkspaceAction: mocks.execute,
}));
vi.mock("../actions/stores", () => ({ databaseReceiptStore: {}, recordActionChanges: vi.fn() }));
vi.mock("../operations/context", () => ({
  runServerOperation: (_: unknown, run: () => unknown) => run(),
}));

import { actionToolName, createActionTools, enabledActionMilestones } from "./action-tools";

const context = (milestones?: string) =>
  ({
    env: milestones === undefined ? {} : { AI_ACTION_MILESTONES: milestones },
    authentication: { user: { id: "user-1" } },
  }) as unknown as ServerOperationContext;

test("workspace action tools are disabled unless milestones are configured", () => {
  expect(enabledActionMilestones(context().env)).toEqual([]);
  expect(createActionTools(context(), { workspaceId: "org", invocationId: "run" })).toEqual({});
  expect(enabledActionMilestones(context(" a, b ,x").env)).toEqual(["A", "B"]);
});

test("destructive actions are exposed only with milestone D, as proposals", () => {
  const names = (milestones: string) =>
    Object.keys(
      createActionTools(context(milestones), { workspaceId: "org", invocationId: "run" }),
    );
  const ab = names("A,B");
  expect(ab).toContain(actionToolName("databases.add_view"));
  expect(ab).toContain("databases_update_rows");
  expect(ab).not.toContain("databases_archive_rows");
  expect(ab).not.toContain("pages_delete");
  expect(ab).not.toContain("databases_describe");
  expect(ab.every((name) => /^[a-zA-Z0-9_-]+$/.test(name))).toBe(true);
  expect(names("A,B,D")).toEqual(
    expect.arrayContaining(["databases_archive_rows", "pages_delete"]),
  );
});

test("signed-out contexts get no write tools", () => {
  const signedOut = { env: { AI_ACTION_MILESTONES: "A" }, authentication: {} } as never;
  expect(createActionTools(signedOut, { workspaceId: "org", invocationId: "run" })).toEqual({});
});

test("parallel write calls run one at a time, failures settle and changed databases are granted", async () => {
  const events: string[] = [];
  mocks.execute.mockImplementation(async ({ callId }: { callId: string }) => {
    events.push(`start ${callId}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    events.push(`end ${callId}`);
    if (callId === "b") throw new Error("connection busy");
    return {
      status: "completed",
      result: null,
      changes: [{ commandType: "view.create", databaseId: "db-1", ack: { result: { id: "v" } } }],
    };
  });
  const progress = { activities: [] as Array<{ id: string; status: string; error?: string }> };
  const granted: string[] = [];
  const tools = createActionTools(context("A"), {
    workspaceId: "org",
    invocationId: "run",
    progress: progress as never,
    granted: (id) => granted.push(id),
  });
  const run = (id: string) =>
    (tools.databases_add_view!.execute as (value: unknown, options: unknown) => Promise<unknown>)(
      { databaseId: "db-1", type: "kanban" },
      { toolCallId: id, messages: [] },
    );
  const results = await Promise.all([run("a"), run("b"), run("c")]);
  expect(events).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  expect(results.map((result) => (result as { status: string }).status)).toEqual([
    "completed",
    "failed",
    "completed",
  ]);
  expect(progress.activities.map(({ id, status }) => [id, status])).toEqual([
    ["a", "completed"],
    ["b", "failed"],
    ["c", "completed"],
  ]);
  expect(progress.activities[1]!.error).toBe("connection busy");
  expect(granted).toEqual(["db-1", "db-1"]);
});
