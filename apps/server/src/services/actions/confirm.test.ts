import { beforeEach, expect, test, vi } from "vitest";
import type { ServerOperationContext } from "../operations/context";

const state = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, claims: 0 }));
vi.mock("../../infrastructure/database", () => {
  const chain = (result: () => unknown) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["from", "where", "limit", "set", "values"])
      builder[method] = () => builder;
    builder.returning = async () => result();
    builder.onConflictDoNothing = async () => undefined;
    builder.then = (resolve: (value: unknown) => void) => resolve(result());
    return builder;
  };
  return {
    db: {
      select: () => chain(() => (state.row ? [state.row] : [])),
      update: () =>
        chain(() => (state.row?.status === "proposed" ? [{ ...state.row, status: "x" }] : [])),
      insert: () => chain(() => []),
    },
  };
});
vi.mock("../access/principal-access", () => ({ getMembership: async () => ({ role: "member" }) }));
vi.mock("./stores", () => ({ databaseReceiptStore: {}, recordActionChanges: vi.fn() }));

const { decideWorkspaceAction } = await import("./confirm");
const context = {
  authentication: { user: { id: "user-1" } },
  activeWorkspaceId: "org",
  pinnedWorkspaceId: null,
} as unknown as ServerOperationContext;
const input = { workspaceId: "org", invocationId: "run", callId: "call" };
const proposal = (userId = "user-1") => ({
  kind: "proposal",
  status: "proposed",
  request: { name: "pages.delete", input: { pageId: "p" }, workspaceId: "org", userId },
});

beforeEach(() => {
  state.row = proposal();
});

test("confirming runs the proposed action once as the user", async () => {
  const execute = vi.fn(async () => ({ status: "completed" as const, result: null, changes: [] }));
  await expect(
    decideWorkspaceAction(context, { ...input, decision: "confirm" }, { execute }),
  ).resolves.toEqual({ status: "completed", changes: [] });
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "pages.delete",
      input: { pageId: "p" },
      callId: "call",
      principal: expect.objectContaining({ userId: "user-1" }),
    }),
  );
  state.row = { ...state.row!, status: "confirmed" };
  await expect(
    decideWorkspaceAction(context, { ...input, decision: "confirm" }, { execute }),
  ).rejects.toThrow("already confirmed");
  expect(execute).toHaveBeenCalledTimes(1);
});

test("cancelling runs nothing, and other users cannot decide", async () => {
  const execute = vi.fn();
  await expect(
    decideWorkspaceAction(context, { ...input, decision: "cancel" }, { execute }),
  ).resolves.toEqual({ status: "cancelled", changes: [] });
  state.row = proposal("user-2");
  await expect(
    decideWorkspaceAction(context, { ...input, decision: "confirm" }, { execute }),
  ).rejects.toThrow("Forbidden");
  expect(execute).not.toHaveBeenCalled();
});
