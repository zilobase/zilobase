import assert from "node:assert/strict";
import { test } from "node:test";
import { createMutationTestRuntime } from "../../shared/mutation-runtime.test";
import type { ApiFetcher } from "../../shared/api-fetcher";
import type { DatabaseCommandRequest } from "../core/entities";
import {
  useCreateDatabase,
  useDeleteDatabase,
  useRestoreDatabase,
  useSetDatabaseFavorite,
} from "./databases";
import {
  useDeleteDatabaseAccess,
  useSetDatabasePublished,
  useUpsertDatabaseAccess,
} from "../access/access-mutations";

function transport(
  sent: Array<{ path: string; command: DatabaseCommandRequest["command"] }>,
): ApiFetcher {
  return async <T>(path: string, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    const request = JSON.parse(String(init.body)) as DatabaseCommandRequest;
    sent.push({ path, command: request.command });
    const id = request.command.type === "database.create" ? request.commandId : "host";
    const result =
      request.command.type === "database.favorite"
        ? { databaseId: id, isFavorite: request.command.favorite, workspaceId: "workspace" }
        : {
            database: { id, pageId: "page", workspaceId: "workspace" },
            navDelta: {},
            deletedPageIds: [],
            deletedDatabaseIds: [],
            restoredPageIds: [],
            restoredDatabaseIds: [],
          };
    return {
      commandId: request.commandId,
      event:
        request.command.type === "database.favorite"
          ? null
          : {
              actorId: "actor",
              areas: ["databases"],
              changes: {},
              commandId: request.commandId,
              committedAt: "2026-09-28T00:00:00.000Z",
              databaseId: id,
              dataSourceId: null,
              eventId: request.commandId,
              protocolVersion: 2,
              type: "database.mutation",
              version: 1,
            },
      ...(request.command.type === "database.favorite"
        ? { privateConfirmation: { databaseId: id, revision: 1 } }
        : {}),
      sourceVersions: {},
      result,
    } as T;
  };
}

test("creation reserves its identity at the workspace command boundary", async () => {
  const sent: Parameters<typeof transport>[0] = [];
  const runtime = createMutationTestRuntime(useCreateDatabase, transport(sent));
  try {
    const result = await runtime.mutation.mutateAsync({
      workspaceId: "workspace",
      standalone: true,
    });
    assert.ok(result.database.id);
    assert.deepEqual(sent, [
      {
        path: "/databases/commands",
        command: {
          type: "database.create",
          workspaceId: "workspace",
          standalone: true,
          name: "New database",
        },
      },
    ]);
  } finally {
    runtime.queryClient.clear();
  }
});

test("favorite uses an actor-private command receipt", async () => {
  const sent: Parameters<typeof transport>[0] = [];
  const runtime = createMutationTestRuntime(useSetDatabaseFavorite, transport(sent));
  try {
    const result = await runtime.mutation.mutateAsync({ databaseId: "host", isFavorite: true });
    assert.equal(result.isFavorite, true);
    assert.deepEqual(sent, [
      { path: "/databases/host/commands", command: { type: "database.favorite", favorite: true } },
    ]);
  } finally {
    runtime.queryClient.clear();
  }
});

test("archive and restore submit through the same host controller", async () => {
  const sent: Parameters<typeof transport>[0] = [];
  for (const hook of [useDeleteDatabase, useRestoreDatabase]) {
    const runtime = createMutationTestRuntime(hook as typeof useDeleteDatabase, transport(sent));
    try {
      await runtime.mutation.mutateAsync("host");
    } finally {
      runtime.queryClient.clear();
    }
  }
  assert.deepEqual(
    sent.map(({ command }) => command.type),
    ["database.archive", "database.restore"],
  );
  assert.ok(sent.every(({ path }) => path === "/databases/host/commands"));
});

test("access and publication submit confirmed-only host commands", async () => {
  const sent: Parameters<typeof transport>[0] = [];
  const upsert = createMutationTestRuntime(useUpsertDatabaseAccess, transport(sent));
  const remove = createMutationTestRuntime(useDeleteDatabaseAccess, transport(sent));
  const publish = createMutationTestRuntime(useSetDatabasePublished, transport(sent));
  try {
    await upsert.mutation.mutateAsync({
      databaseId: "host",
      targetId: "user",
      targetType: "user",
      accessLevel: "edit",
    });
    await remove.mutation.mutateAsync({ databaseId: "host", ruleId: "rule" });
    await publish.mutation.mutateAsync({ databaseId: "host", isPublished: true });
    assert.deepEqual(
      sent.map(({ command }) => command.type),
      ["access.upsert", "access.remove", "database.publish"],
    );
    assert.ok(sent.every(({ path }) => path === "/databases/host/commands"));
  } finally {
    for (const runtime of [upsert, remove, publish]) runtime.queryClient.clear();
  }
});
