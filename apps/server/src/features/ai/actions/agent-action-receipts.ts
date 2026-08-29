import type { AgentActionReceipt } from "@zilobase/features/ai-chat/agent-contract";
import { and, eq } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import { aiAgentActionReceipt } from "../../../infrastructure/database/schema";

type ReceiptContext = {
  threadId: string;
  userId: string;
  workspaceId: string;
};

type ReceiptedResult = {
  receipt?: AgentActionReceipt;
};

export async function runIdempotentAgentAction<T extends ReceiptedResult>(input: {
  context: ReceiptContext;
  execute: () => Promise<T>;
  toolCallId: string;
  toolInput: unknown;
  toolName: string;
}): Promise<T> {
  const inputHash = await hashAgentToolInput(input.toolInput);
  const receiptId = crypto.randomUUID();
  const now = new Date();
  const [reservation] = await db
    .insert(aiAgentActionReceipt)
    .values({
      createdAt: now,
      id: receiptId,
      inputHash,
      status: "running",
      threadId: input.context.threadId,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      updatedAt: now,
      userId: input.context.userId,
      workspaceId: input.context.workspaceId,
    })
    .onConflictDoNothing()
    .returning({ id: aiAgentActionReceipt.id });

  if (!reservation) {
    return readExistingAgentAction<T>({
      ...input,
      inputHash,
    });
  }

  try {
    const result = await input.execute();
    const completedAt = new Date();
    const withReceipt = {
      ...result,
      receipt: {
        actionId: receiptId,
        completedAt: completedAt.toISOString(),
        toolName: input.toolName,
      },
    };

    await db
      .update(aiAgentActionReceipt)
      .set({
        completedAt,
        result: withReceipt,
        status: "succeeded",
        updatedAt: completedAt,
      })
      .where(eq(aiAgentActionReceipt.id, receiptId));

    return withReceipt;
  } catch (error) {
    const completedAt = new Date();
    const message = toSafeActionError(error);

    await db
      .update(aiAgentActionReceipt)
      .set({
        completedAt,
        error: message,
        status: "failed",
        updatedAt: completedAt,
      })
      .where(eq(aiAgentActionReceipt.id, receiptId));

    throw error;
  }
}

async function readExistingAgentAction<T extends ReceiptedResult>(input: {
  context: ReceiptContext;
  inputHash: string;
  toolCallId: string;
  toolName: string;
}) {
  const [existing] = await db
    .select({
      error: aiAgentActionReceipt.error,
      inputHash: aiAgentActionReceipt.inputHash,
      result: aiAgentActionReceipt.result,
      status: aiAgentActionReceipt.status,
      toolName: aiAgentActionReceipt.toolName,
    })
    .from(aiAgentActionReceipt)
    .where(
      and(
        eq(aiAgentActionReceipt.threadId, input.context.threadId),
        eq(aiAgentActionReceipt.toolCallId, input.toolCallId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("Agent action reservation could not be loaded.");
  }

  if (
    existing.toolName !== input.toolName ||
    existing.inputHash !== input.inputHash
  ) {
    throw new Error("Agent action idempotency key was reused with another action.");
  }

  if (existing.status === "succeeded" && isReceiptedResult(existing.result)) {
    return existing.result as T;
  }

  if (existing.status === "failed") {
    throw new Error(existing.error || "The earlier agent action failed.");
  }

  throw new Error("The same agent action is already in progress.");
}

export async function hashAgentToolInput(input: unknown) {
  const encoded = new TextEncoder().encode(stableStringify(input));
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function isReceiptedResult(value: unknown): value is ReceiptedResult {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toSafeActionError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 1_000);
  }

  return "Agent action failed.";
}
