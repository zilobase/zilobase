import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { useQueryClient } from "@tanstack/react-query";
import { synchronizeDatabaseToolCache } from "./database-tool-cache";

type UseDatabaseToolCacheSyncOptions = {
  enabled?: boolean;
  messages: UIMessage[];
};

export function useDatabaseToolCacheSync({
  enabled = true,
  messages,
}: UseDatabaseToolCacheSyncOptions) {
  const queryClient = useQueryClient();
  const handledToolCallIds = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    synchronizeDatabaseToolCache(messages, handledToolCallIds.current, queryClient);
  }, [enabled, messages, queryClient]);
}
