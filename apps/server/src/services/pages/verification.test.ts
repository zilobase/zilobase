import { expect, it } from "vitest";
import { verificationFromRow, verificationInputSchema } from "./verification";
it("verification permits indefinite or offset dates and rejects unknown fields", () => {
  expect(verificationInputSchema.safeParse({ expiresAt: null }).success).toBe(true);
  expect(verificationInputSchema.safeParse({ expiresAt: "2027-01-01" }).success).toBe(false);
  expect(
    verificationInputSchema.safeParse({ expiresAt: null, verifiedById: "spoof" }).success,
  ).toBe(false);
});
it("legacy and expired verification use the same derivation as search", () => {
  const row = {
    workspace_id: "w",
    verified_at: null,
    verified_by_id: null,
    verification_expires_at: null,
    verification_updated_at: null,
  };
  expect(verificationFromRow(row).state).toBe("unverified");
  expect(
    verificationFromRow({ ...row, verified_at: new Date(1), verification_expires_at: new Date(2) })
      .state,
  ).toBe("expired");
});

import { vi, beforeEach } from "vitest";
import { contentVerificationOperation } from "./verification";
import type { ServerOperationContext } from "../operations/context";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), access: vi.fn() }));
vi.mock("../../infrastructure/database", () => ({
  db: { transaction: async (run: (tx: unknown) => unknown) => run({ execute: mocks.execute }) },
  runWithDb: async (_: unknown, run: () => unknown) => run(),
}));
vi.mock("../access/effective-access", () => ({
  canAccessPageInWorkspace: mocks.access,
  canAccessDatabaseInWorkspace: mocks.access,
}));
const context = {
  authentication: { authMethod: "session", user: { id: "actor" } },
  pinnedWorkspaceId: "w",
} as ServerOperationContext;
const row = {
  workspace_id: "w",
  verified_at: null,
  verified_by_id: null,
  verification_expires_at: null,
  verification_updated_at: null,
};
beforeEach(() => {
  mocks.execute.mockReset().mockResolvedValue({ rows: [row] });
  mocks.access
    .mockReset()
    .mockImplementation(async (_id, _workspace, _actor, level) => level === "view");
});
it("readers can inspect verification but cannot change it", async () => {
  expect(
    (await contentVerificationOperation(context, { type: "page", id: "p", action: "read" }))
      .canManage,
  ).toBe(false);
  await expect(
    contentVerificationOperation(context, {
      type: "page",
      id: "p",
      action: "verify",
      body: { expiresAt: null },
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(mocks.execute).toHaveBeenCalledTimes(2);
});
it("pinned workspace and view access are enforced", async () => {
  mocks.execute.mockResolvedValueOnce({ rows: [{ ...row, workspace_id: "other" }] });
  await expect(
    contentVerificationOperation(context, { type: "database", id: "d", action: "read" }),
  ).rejects.toMatchObject({ status: 403 });
  mocks.access.mockResolvedValue(false);
  await expect(
    contentVerificationOperation(context, { type: "page", id: "p", action: "read" }),
  ).rejects.toMatchObject({ status: 404 });
});
it("editors may remove verification; past expiry and spoofed actors are rejected", async () => {
  mocks.access.mockResolvedValue(true);
  await contentVerificationOperation(context, { type: "database", id: "d", action: "remove" });
  expect(mocks.execute).toHaveBeenCalledTimes(2);
  await expect(
    contentVerificationOperation(context, {
      type: "page",
      id: "p",
      action: "verify",
      body: { expiresAt: "2020-01-01T00:00:00Z" },
    }),
  ).rejects.toMatchObject({ status: 400 });
});
