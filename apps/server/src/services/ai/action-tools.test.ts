import { expect, test } from "vitest";
import type { ServerOperationContext } from "../operations/context";
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

test("enabled milestones expose write actions but never destructive ones", () => {
  const names = Object.keys(
    createActionTools(context("A,D"), { workspaceId: "org", invocationId: "run" }),
  );
  expect(names).toContain(actionToolName("databases.add_view"));
  expect(names).toContain("databases_update_rows");
  expect(names).not.toContain("databases_archive_rows");
  expect(names).not.toContain("databases_describe");
  expect(names.every((name) => /^[a-zA-Z0-9_-]+$/.test(name))).toBe(true);
});

test("signed-out contexts get no write tools", () => {
  const signedOut = { env: { AI_ACTION_MILESTONES: "A" }, authentication: {} } as never;
  expect(createActionTools(signedOut, { workspaceId: "org", invocationId: "run" })).toEqual({});
});
