import { useEffect, useRef } from "react"
import { getToolName, isToolUIPart, type UIMessage } from "ai"
import { useQueryClient } from "@tanstack/react-query"

import {
  isDatabaseConfigToolName,
  readDatabaseConfigToolIds,
} from "@notelab/features/ai-chat"
import { databaseQueryKey } from "@notelab/features/databases"
import { pageQueryKey } from "@notelab/features/pages"

type UseDatabaseToolCacheSyncOptions = {
  enabled?: boolean
  messages: UIMessage[]
}

function collectInvalidationTargets(ids: Record<string, string>) {
  const databaseIds = new Set<string>()
  const pageIds = new Set<string>()

  for (const [key, value] of Object.entries(ids)) {
    if (!value) {
      continue
    }

    if (key === "databaseId" || key.endsWith("DatabaseId")) {
      databaseIds.add(value)
    }

    if (
      key === "pageId" ||
      key === "pageId" ||
      key === "hostPageId" ||
      key === "rowPageId" ||
      key.endsWith("PageId")
    ) {
      pageIds.add(value)
    }
  }

  return { databaseIds, pageIds }
}

export function useDatabaseToolCacheSync({
  enabled = true,
  messages,
}: UseDatabaseToolCacheSyncOptions) {
  const queryClient = useQueryClient()
  const handledToolCallIds = useRef(new Set<string>())

  useEffect(() => {
    if (!enabled) {
      return
    }

    for (const message of messages) {
      if (message.role !== "assistant") {
        continue
      }

      for (const part of message.parts) {
        if (!isToolUIPart(part) || part.state !== "output-available") {
          continue
        }

        const toolName = getToolName(part)

        if (!isDatabaseConfigToolName(toolName)) {
          continue
        }

        if (handledToolCallIds.current.has(part.toolCallId)) {
          continue
        }

        const ids = readDatabaseConfigToolIds(part.output)

        if (!ids) {
          continue
        }

        handledToolCallIds.current.add(part.toolCallId)

        const { databaseIds, pageIds } = collectInvalidationTargets(ids)

        for (const databaseId of databaseIds) {
          void queryClient.invalidateQueries({
            queryKey: databaseQueryKey(databaseId),
          })
        }

        for (const pageId of pageIds) {
          void queryClient.invalidateQueries({
            queryKey: pageQueryKey(pageId),
          })
        }
      }
    }
  }, [enabled, messages, queryClient])
}