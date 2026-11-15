import type { ChatToolActivity } from "@zilobase/features/runtime";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import {
  workspaceActionChange,
  workspaceActionReceipt,
} from "../../infrastructure/database/schema";

type Message = { progress?: { activities: ChatToolActivity[]; canContinue: boolean } };

/**
 * Adds confirmation and undo outcomes to saved chat activities. The outcomes
 * live with the action records rather than the turn, because a user can
 * confirm or undo while the run that proposed the action is still saving.
 */
export async function withActionOutcomes<T extends Message>(userId: string, messages: T[]) {
  const callIds = messages.flatMap((message) =>
    (message.progress?.activities ?? []).flatMap((activity) =>
      activity.name === "workspace_action" && activity.invocationId ? [activity.id] : [],
    ),
  );
  if (!callIds.length) return messages;
  const [proposals, changes] = await Promise.all([
    db
      .select({
        callId: workspaceActionReceipt.callId,
        status: workspaceActionReceipt.status,
        request: workspaceActionReceipt.request,
      })
      .from(workspaceActionReceipt)
      .where(
        and(
          eq(workspaceActionReceipt.kind, "proposal"),
          inArray(workspaceActionReceipt.callId, callIds),
        ),
      ),
    db
      .select()
      .from(workspaceActionChange)
      .where(
        and(
          eq(workspaceActionChange.userId, userId),
          inArray(workspaceActionChange.callId, callIds),
        ),
      ),
  ]);
  const decisions = new Map(
    proposals
      .filter(({ request }) => (request as { userId?: string } | null)?.userId === userId)
      .map(({ callId, status }) => [callId, status]),
  );
  const outcome = (activity: ChatToolActivity): ChatToolActivity => {
    const rows = changes.filter((row) => row.callId === activity.id);
    const undone = rows.length > 0 && rows.every((row) => row.undoneAt);
    const decision = decisions.get(activity.id);
    if (decision === "cancelled") return { ...activity, confirmation: "cancelled" };
    if (decision !== "confirmed") return undone ? { ...activity, undone } : activity;
    return {
      ...activity,
      confirmation: "confirmed",
      ...(undone ? { undone } : {}),
      changes: rows.map((row) => {
        const pageId = (row.inverse as { input?: { pageId?: string } } | null)?.input?.pageId;
        return {
          command: row.commandType,
          databaseId: row.databaseId,
          ...(row.kind === "page" && pageId ? { pageId } : {}),
        };
      }),
    };
  };
  return messages.map((message) =>
    message.progress
      ? {
          ...message,
          progress: {
            ...message.progress,
            activities: message.progress.activities.map((activity) =>
              activity.name === "workspace_action" ? outcome(activity) : activity,
            ),
          },
        }
      : message,
  );
}
