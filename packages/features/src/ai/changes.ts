import type { QueryClient } from "@tanstack/react-query";
import { pagesQueryKey } from "../pages/queries";
import type { ChatReadProgress } from "./tools";

/**
 * Refreshes this client's reads after the AI changed the workspace. Open
 * database views already receive realtime events; this covers the acting
 * client's other cached database reads and its page tree, which has no
 * realtime channel. Each completed action activity is applied once.
 */
export async function refreshAfterWorkspaceActions(
  queryClient: QueryClient,
  workspaceId: string,
  progress: ChatReadProgress | undefined,
  applied: Set<string>,
) {
  const fresh = (progress?.activities ?? []).filter(
    (activity) =>
      activity.name === "workspace_action" &&
      activity.status !== "running" &&
      activity.changes?.length &&
      !applied.has(activity.id),
  );
  if (!fresh.length) return;
  for (const activity of fresh) applied.add(activity.id);
  const databaseIds = new Set(
    fresh.flatMap((activity) =>
      (activity.changes ?? []).flatMap((change) => (change.databaseId ? [change.databaseId] : [])),
    ),
  );
  const createsDatabase = fresh.some((activity) =>
    activity.changes?.some((change) => change.command === "database.create"),
  );
  await Promise.all([
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "db" &&
        (createsDatabase || query.queryKey.some((part) => databaseIds.has(part as string))),
    }),
    queryClient.invalidateQueries({ queryKey: pagesQueryKey(workspaceId) }),
  ]).catch(() => undefined);
}
