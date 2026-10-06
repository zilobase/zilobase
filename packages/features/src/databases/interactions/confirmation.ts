import { resolveDatabaseBootstrap } from "../cache-references";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { type DatabaseCommandAck } from "../core/entities";
import type { DatabaseCommandInput } from "../mutations/execute";
import { databaseAccessQueryKey } from "../queries/queries";
import { pageQueryKey } from "../../pages/queries";
import { isNavigationSnapshot } from "./favorites";

const lifecycleResult = z.object({
  database: z.object({ workspaceId: z.string() }).nullable(),
  deletedDatabaseIds: z.array(z.string()).optional(),
  deletedPageIds: z.array(z.string()).optional(),
  restoredDatabaseIds: z.array(z.string()).optional(),
  restoredPageIds: z.array(z.string()).optional(),
});

/** Confirmation side effects also run when the original mutation hook is gone. */
export async function refreshConfirmedDatabaseReads(
  client: QueryClient,
  sessionId: string,
  input: DatabaseCommandInput,
  ack: DatabaseCommandAck,
  hosts: Set<string>,
) {
  const refreshes: Promise<unknown>[] = [];
  const invalidate = (queryKey: readonly unknown[]) =>
    refreshes.push(client.invalidateQueries({ queryKey }, { throwOnError: true }));
  const workspaces = new Set<string>();
  for (const [, value] of client.getQueriesData({ queryKey: ["db", sessionId] })) {
    const parsed = resolveDatabaseBootstrap(client, value);
    if (parsed && hosts.has(parsed.database.id)) workspaces.add(parsed.database.workspaceId);
  }
  if (input.command.type === "database.create") workspaces.add(input.command.workspaceId);
  if (input.command.type === "database.archive" || input.command.type === "database.restore") {
    const result = lifecycleResult.parse(ack.result);
    if (result.database) workspaces.add(result.database.workspaceId);
    for (const id of result.deletedDatabaseIds ?? []) {
      // Active-only reads cannot serve archived entities; preserve trash reads and
      // never evict another session's database snapshots.
      client.removeQueries({
        predicate: (query) =>
          query.queryKey[0] === "db" &&
          query.queryKey[1] === sessionId &&
          query.queryKey[2] === id &&
          query.queryKey.at(-1) !== true,
      });
      invalidate(["db", sessionId, id]);
      client.removeQueries({ queryKey: databaseAccessQueryKey(id) });
      hosts.add(id);
    }
    for (const id of result.deletedPageIds ?? [])
      client.removeQueries({ queryKey: pageQueryKey(id) });
    for (const id of result.restoredDatabaseIds ?? []) {
      invalidate(["db", sessionId, id]);
      invalidate(databaseAccessQueryKey(id));
      hosts.add(id);
    }
    for (const id of result.restoredPageIds ?? []) invalidate(pageQueryKey(id));
  }
  if (
    input.command.type === "access.upsert" ||
    input.command.type === "access.remove" ||
    input.command.type === "database.publish"
  )
    invalidate(databaseAccessQueryKey(input.databaseId));

  // Refresh whole workspace navigation snapshots, including the trash variant.
  // A committed receipt must not patch an unversioned slice over a newer GET.
  for (const query of client.getQueryCache().findAll({ queryKey: ["pages"] })) {
    if (
      query.queryKey[2] === "nav" &&
      isNavigationSnapshot(query.state.data) &&
      query.state.data.databases.some(({ id }) => hosts.has(id))
    )
      workspaces.add(String(query.queryKey[1]));
  }
  for (const workspace of workspaces) invalidate(["pages", workspace, "nav"]);
  await Promise.all(refreshes);
}
