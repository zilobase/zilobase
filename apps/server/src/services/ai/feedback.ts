import { chatFeedbackRequestSchema } from "@zilobase/features/runtime";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../infrastructure/database";
import { askAiThread, askAiTurn } from "../../infrastructure/database/schema";
import { ServerOperationError, type ServerOperationContext } from "../operations/context";
import { authorizeChatWorkspace } from "./context";

/** Saves or clears the user's rating of one of their own answers. */
export async function saveChatFeedback(
  context: ServerOperationContext,
  input: z.input<typeof chatFeedbackRequestSchema>,
) {
  const request = chatFeedbackRequestSchema.parse(input);
  const user = await authorizeChatWorkspace(context, request.workspaceId);
  const turnId = request.messageId.replace(/:assistant$/, "");
  const [turn] = await db
    .select({ id: askAiTurn.id })
    .from(askAiTurn)
    .innerJoin(askAiThread, eq(askAiThread.id, askAiTurn.threadId))
    .where(
      and(
        eq(askAiTurn.id, turnId),
        eq(askAiThread.workspaceId, request.workspaceId),
        eq(askAiThread.userId, user.id),
      ),
    )
    .limit(1);
  if (!turn) throw new ServerOperationError({ error: "Answer not found" }, 404);
  const feedback = request.rating
    ? {
        rating: request.rating,
        ...(request.comment ? { comment: request.comment } : {}),
        at: new Date().toISOString(),
      }
    : null;
  await db.update(askAiTurn).set({ feedback }).where(eq(askAiTurn.id, turn.id));
  return { feedback };
}
