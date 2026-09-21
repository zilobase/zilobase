import type { QueryClient } from "@tanstack/react-query";

import type { PagePropertiesPayload } from "../../pages/contracts";
import { databaseQueryRoot } from "../queries/keys";
import { DatabaseReconciliationError } from "./execute";
import { reportPendingError } from "./pending";

function isPagePropertiesQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === "page" && queryKey[2] === "properties";
}

export function invalidateDatabaseQueries(
  queryClient: QueryClient,
  sessionId: string,
  hostDatabaseId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: [databaseQueryRoot, sessionId, hostDatabaseId],
  }).catch((cause: unknown) => {
    reportPendingError(
      [{ hostDatabaseId }],
      new DatabaseReconciliationError(cause),
    );
  });

  for (
    const [queryKey, payload] of queryClient.getQueriesData<
      PagePropertiesPayload | undefined
    >({ queryKey: ["page"] })
  ) {
    if (!isPagePropertiesQueryKey(queryKey as readonly unknown[])) continue;
    if (!payload?.databaseIds?.includes(hostDatabaseId)) continue;
    void queryClient.invalidateQueries({ exact: true, queryKey }).catch(
      () => undefined,
    );
  }

  void queryClient.invalidateQueries({
    queryKey: ["database-context-export", hostDatabaseId],
  }).catch(() => undefined);
}
