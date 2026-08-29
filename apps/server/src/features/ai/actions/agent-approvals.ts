import type { AgentToolResult } from "@zilobase/features/ai-chat/agent-contract";
import type { AgentToolDescriptor } from "@zilobase/features/ai-chat/tool-registry";
import { and, eq, gt } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import { aiAgentPendingAction } from "../../../infrastructure/database/schema";
import { hashAgentToolInput } from "./agent-action-receipts";

const APPROVAL_TTL_MS = 15 * 60 * 1_000;

export async function requestAgentActionApproval(input: {
  descriptor: AgentToolDescriptor;
  threadId: string;
  toolCallId: string;
  toolInput: unknown;
  userId: string;
  workspaceId: string;
}): Promise<AgentToolResult<{ approval: {
  actionId: string;
  expiresAt: string;
  title: string;
  toolName: string;
} }>> {
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + APPROVAL_TTL_MS);
  const inputHash = await hashAgentToolInput(input.toolInput);
  await db.insert(aiAgentPendingAction).values({
    createdAt: now,
    expiresAt,
    id,
    inputHash,
    status: "pending",
    threadId: input.threadId,
    toolCallId: input.toolCallId,
    toolInput: input.toolInput,
    toolName: input.descriptor.name,
    toolVersion: input.descriptor.version,
    updatedAt: now,
    userId: input.userId,
    workspaceId: input.workspaceId,
  }).onConflictDoNothing({
    target: [aiAgentPendingAction.threadId, aiAgentPendingAction.toolCallId],
  });
  const [persisted] = await db
    .select()
    .from(aiAgentPendingAction)
    .where(and(
      eq(aiAgentPendingAction.threadId, input.threadId),
      eq(aiAgentPendingAction.toolCallId, input.toolCallId),
    ))
    .limit(1);
  if (
    !persisted ||
    persisted.userId !== input.userId ||
    persisted.workspaceId !== input.workspaceId ||
    persisted.toolName !== input.descriptor.name ||
    persisted.toolVersion !== input.descriptor.version ||
    persisted.inputHash !== inputHash
  ) {
    throw new Error("Approval request idempotency conflict.");
  }
  return {
    data: {
      approval: {
        actionId: persisted.id,
        expiresAt: persisted.expiresAt.toISOString(),
        title: input.descriptor.title,
        toolName: input.descriptor.name,
      },
    },
    ok: false,
    status: "approval_required",
    summary: `${input.descriptor.title} requires your approval before it can run.`,
  };
}

export async function getOwnedPendingAgentAction(input: {
  actionId: string;
  threadId: string;
  userId: string;
  workspaceId: string;
}) {
  const [action] = await db
    .select()
    .from(aiAgentPendingAction)
    .where(and(
      eq(aiAgentPendingAction.id, input.actionId),
      eq(aiAgentPendingAction.threadId, input.threadId),
      eq(aiAgentPendingAction.userId, input.userId),
      eq(aiAgentPendingAction.workspaceId, input.workspaceId),
    ))
    .limit(1);
  return action ?? null;
}

export async function rejectPendingAgentAction(input: {
  actionId: string;
  threadId: string;
  userId: string;
  workspaceId: string;
}) {
  const now = new Date();
  const [action] = await db
    .update(aiAgentPendingAction)
    .set({ rejectedAt: now, status: "rejected", updatedAt: now })
    .where(and(
      eq(aiAgentPendingAction.id, input.actionId),
      eq(aiAgentPendingAction.threadId, input.threadId),
      eq(aiAgentPendingAction.userId, input.userId),
      eq(aiAgentPendingAction.workspaceId, input.workspaceId),
      eq(aiAgentPendingAction.status, "pending"),
    ))
    .returning({ id: aiAgentPendingAction.id });
  return action ?? null;
}

export async function markPendingAgentActionExecuting(input: {
  actionId: string;
  threadId: string;
  userId: string;
  workspaceId: string;
}) {
  const now = new Date();
  const [action] = await db
    .update(aiAgentPendingAction)
    .set({ approvedAt: now, status: "executing", updatedAt: now })
    .where(and(
      eq(aiAgentPendingAction.id, input.actionId),
      eq(aiAgentPendingAction.threadId, input.threadId),
      eq(aiAgentPendingAction.userId, input.userId),
      eq(aiAgentPendingAction.workspaceId, input.workspaceId),
      eq(aiAgentPendingAction.status, "pending"),
      gt(aiAgentPendingAction.expiresAt, now),
    ))
    .returning();
  return action ?? null;
}

export async function expirePendingAgentAction(actionId: string) {
  const now = new Date();
  await db
    .update(aiAgentPendingAction)
    .set({ status: "expired", updatedAt: now })
    .where(and(
      eq(aiAgentPendingAction.id, actionId),
      eq(aiAgentPendingAction.status, "pending"),
    ));
}

export async function finishPendingAgentAction(input: {
  actionId: string;
  error?: string;
  result?: unknown;
}) {
  const now = new Date();
  await db
    .update(aiAgentPendingAction)
    .set({
      completedAt: now,
      error: input.error?.slice(0, 1_000) ?? null,
      result: input.result,
      status: input.error ? "failed" : "succeeded",
      updatedAt: now,
    })
    .where(and(
      eq(aiAgentPendingAction.id, input.actionId),
      eq(aiAgentPendingAction.status, "executing"),
    ));
}
