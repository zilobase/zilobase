import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { QueryClient } from "@tanstack/react-query";
import {
  isDatabaseConfigToolName,
  readDatabaseConfigToolIds,
} from "@zilobase/features/ai-chat";
import { databaseQueryRoot } from "@zilobase/features/databases";
import { pageQueryKey } from "@zilobase/features/pages";

function collectInvalidationTargets(ids: Record<string, string>) {
  const databaseIds = new Set<string>();
  const pageIds = new Set<string>();

  for (const [key, value] of Object.entries(ids)) {
    if (!value) {
      continue;
    }

    if (key === "databaseId" || key.endsWith("DatabaseId")) {
      databaseIds.add(value);
    }

    if (
      key === "pageId" ||
      key === "hostPageId" ||
      key === "rowPageId" ||
      key.endsWith("PageId")
    ) {
      pageIds.add(value);
    }
  }

  return { databaseIds, pageIds };
}

function invalidateToolResult(
  part: UIMessage["parts"][number],
  handledToolCallIds: Set<string>,
  queryClient: QueryClient,
) {
  if (!isToolUIPart(part) || part.state !== "output-available") return;
  if (!isDatabaseConfigToolName(getToolName(part))) return;
  if (handledToolCallIds.has(part.toolCallId)) return;
  const ids = readDatabaseConfigToolIds(part.output);
  if (!ids) return;

  // Mark before notifying query observers, which can replay the same messages.
  handledToolCallIds.add(part.toolCallId);
  const { databaseIds, pageIds } = collectInvalidationTargets(ids);
  for (const databaseId of databaseIds) {
    void queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === databaseQueryRoot &&
        query.queryKey.includes(databaseId),
    });
  }
  for (const pageId of pageIds) {
    void queryClient.invalidateQueries({ queryKey: pageQueryKey(pageId) });
  }
}

export function synchronizeDatabaseToolCache(
  messages: UIMessage[],
  handledToolCallIds: Set<string>,
  queryClient: QueryClient,
) {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      invalidateToolResult(part, handledToolCallIds, queryClient);
    }
  }
}
