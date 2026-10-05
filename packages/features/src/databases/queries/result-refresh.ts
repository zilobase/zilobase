import type { QueryClient } from "@tanstack/react-query";
import { databaseWindowReferenceSchema } from "../cache-window";

/** Server-owned membership/count/order recovery, restricted to affected source results. */
export function refreshRecordResults(
  client: QueryClient,
  cacheId: string,
  versions: Readonly<Record<string, number>>,
) {
  for (const query of client.getQueryCache().findAll({ queryKey: ["db"] })) {
    if (query.queryKey[3] !== "window" || versions[String(query.queryKey[4])] === undefined)
      continue;
    const data = query.state.data as { pages?: unknown[] } | undefined;
    if (
      !data?.pages?.some((page) => {
        const parsed = databaseWindowReferenceSchema.safeParse(page);
        return parsed.success && parsed.data.cacheId === cacheId;
      })
    )
      continue;
    void client.invalidateQueries({ queryKey: query.queryKey, exact: true }).catch(() => undefined);
  }
}
