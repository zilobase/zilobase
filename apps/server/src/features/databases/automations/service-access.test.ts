import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  databaseAccess: vi.fn(),
  membership: vi.fn(),
  selectResults: [] as unknown[][],
  sourceAccess: vi.fn(),
}));

vi.mock("../../access", () => ({ getMembership: mocks.membership }));
vi.mock("../access/data-source-access", () => ({
  requireDataSourceAccess: mocks.sourceAccess,
}));
vi.mock("../access/database-access", () => ({
  requireDatabaseAccess: mocks.databaseAccess,
}));
vi.mock("../../../infrastructure/database", () => ({
  db: {
    select() {
      const rows = mocks.selectResults.shift() ?? [];
      const builder = {
        from() { return builder; },
        innerJoin() { return builder; },
        where() { return builder; },
        orderBy() { return builder; },
        async limit() { return rows; },
        then(resolve: (value: unknown[]) => unknown) {
          return Promise.resolve(rows).then(resolve);
        },
      };
      return builder;
    },
  },
}));

import {
  DatabaseAutomationError,
  getDatabaseAutomationCatalog,
  listDatabaseAutomations,
} from "./service";

const source = {
  config: {},
  id: "source-1",
  parentDatabaseId: "canonical-database",
  workspaceId: "workspace-1",
};

describe("database automation management access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sourceAccess.mockResolvedValue(source);
    mocks.databaseAccess.mockResolvedValue({ id: "host-database" });
    mocks.membership.mockResolvedValue({ id: "member-1" });
  });

  it("rejects page guests even when a source lookup succeeds", async () => {
    mocks.membership.mockResolvedValue(null);
    await expect(listDatabaseAutomations({
      databaseId: "host-database",
      dataSourceId: "source-1",
      userId: "guest-1",
    })).rejects.toMatchObject({
      code: "AUTOMATION_MEMBER_REQUIRED",
      status: 403,
    });
    expect(mocks.sourceAccess).toHaveBeenCalledWith("source-1", "guest-1", "full");
  });

  it("requires full canonical-source access", async () => {
    mocks.sourceAccess.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    await expect(listDatabaseAutomations({
      databaseId: "host-database",
      dataSourceId: "source-1",
      userId: "member-1",
    })).rejects.toMatchObject({
      code: "AUTOMATION_MANAGE_FORBIDDEN",
      status: 403,
    });
  });

  it("rejects inaccessible linked containers and locked canonical sources", async () => {
    mocks.databaseAccess.mockRejectedValue(new Error("Forbidden"));
    await expect(listDatabaseAutomations({
      databaseId: "hidden-host",
      dataSourceId: "source-1",
      userId: "member-1",
    })).rejects.toMatchObject({ code: "AUTOMATION_HOST_FORBIDDEN" });

    mocks.databaseAccess.mockResolvedValue({ id: "host-database" });
    mocks.selectResults.push(
      [{ databaseId: "host-database" }],
      [{ config: { locked: true }, id: "canonical-database" }],
    );
    await expect(listDatabaseAutomations({
      databaseId: "host-database",
      dataSourceId: "source-1",
      userId: "member-1",
    })).rejects.toMatchObject({ code: "AUTOMATION_SOURCE_LOCKED", status: 409 });
  });

  it("resolves linked views through one canonical source owner", async () => {
    mocks.selectResults.push(
      [{ databaseId: "linked-host" }],
      [{ config: {}, id: "canonical-database" }],
      [],
    );
    await expect(listDatabaseAutomations({
      databaseId: "linked-host",
      dataSourceId: "source-1",
      userId: "member-1",
    })).resolves.toEqual({ automations: [] });
    expect(mocks.sourceAccess).toHaveBeenCalledWith("source-1", "member-1", "full");
    expect(mocks.databaseAccess).toHaveBeenCalledWith("linked-host", "member-1", "view");
  });

  it("returns a disabled catalog instead of definitions to lower-access users", async () => {
    mocks.sourceAccess.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    await expect(getDatabaseAutomationCatalog({
      databaseId: "host-database",
      dataSourceId: "source-1",
      userId: "viewer-1",
    })).resolves.toEqual(expect.objectContaining({
      actions: [],
      canManage: false,
      dataSourceId: "source-1",
      properties: [],
      users: [],
      views: [],
    }));
  });

  it("uses stable typed errors for clients", () => {
    const error = new DatabaseAutomationError("conflict", 409, "AUTOMATION_REVISION_CONFLICT");
    expect(error).toMatchObject({
      code: "AUTOMATION_REVISION_CONFLICT",
      message: "conflict",
      status: 409,
    });
  });
});
