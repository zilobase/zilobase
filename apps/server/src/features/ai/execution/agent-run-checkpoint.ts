import type { ModelMessage } from "ai";
import { and, eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import {
  aiAgentConversationMessage,
  aiAgentPendingAction,
  aiAgentRun,
} from "../../../infrastructure/database/schema";
import type { RuntimeEnv } from "../../../shared/config/config";
import {
  decryptMcpSecret,
  encryptMcpSecret,
  type EncryptedMcpSecret,
} from "../mcp/connections/credential-crypto";
import { createBackgroundTask } from "../../../infrastructure/background/contracts";
import {
  dispatchBackgroundTasks,
  backgroundTransaction,
} from "../../../infrastructure/background/dispatch";

type Run = Pick<typeof aiAgentRun.$inferSelect, "id" | "profileId" | "workspaceId" | "output">;
export type AgentRunCheckpoint = {
  version: 1;
  messages: ModelMessage[];
  steps: number;
  toolCallIds: string[];
  finalResult?: {
    text: string;
    usage: { inputTokens?: number; outputTokens?: number };
  };
};

function binding(run: Run) {
  return {
    authenticatedByUserId: run.profileId,
    connectionId: run.id,
    profileId: run.profileId,
    workspaceId: run.workspaceId,
    purpose: "agent-run-checkpoint",
  };
}

export async function readAgentRunCheckpoint(
  env: RuntimeEnv,
  run: Run,
): Promise<AgentRunCheckpoint> {
  const envelope = run.output as { checkpoint?: EncryptedMcpSecret } | null;
  if (!envelope?.checkpoint) return { version: 1, messages: [], steps: 0, toolCallIds: [] };
  const value = JSON.parse(
    await decryptMcpSecret(env, envelope.checkpoint, binding(run)),
  ) as AgentRunCheckpoint;
  if (
    value.version !== 1 ||
    !Array.isArray(value.messages) ||
    !Array.isArray(value.toolCallIds) ||
    !Number.isInteger(value.steps) ||
    value.steps < 0 ||
    value.steps > 15
  ) {
    throw new Error("Agent run checkpoint is invalid.");
  }
  return value;
}

export function checkpointToolCallIds(messages: ModelMessage[]) {
  return messages.flatMap((message) =>
    Array.isArray(message.content)
      ? message.content.flatMap((part) => (part.type === "tool-result" ? [part.toolCallId] : []))
      : [],
  );
}

export async function saveAgentRunCheckpoint(
  env: RuntimeEnv,
  run: Run,
  workerId: string,
  value: AgentRunCheckpoint,
) {
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > 5 * 1024 * 1024)
    throw new Error("Agent checkpoint exceeds the run response limit.");
  const checkpoint = await encryptMcpSecret(env, serialized, binding(run));
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: aiAgentRun.id })
      .from(aiAgentRun)
      .where(
        and(
          eq(aiAgentRun.id, run.id),
          eq(aiAgentRun.leaseOwner, workerId),
          eq(aiAgentRun.status, "running"),
        ),
      )
      .for("update");
    if (!owned) throw new Error("Agent run checkpoint lost execution ownership.");
    const pending = await tx
      .select({ id: aiAgentPendingAction.id })
      .from(aiAgentPendingAction)
      .where(
        and(
          eq(aiAgentPendingAction.agentRunId, run.id),
          eq(aiAgentPendingAction.status, "pending"),
        ),
      )
      .limit(1);
    const waiting = pending.length > 0;
    await tx
      .update(aiAgentRun)
      .set({
        output: { checkpoint },
        status: waiting ? "waiting_approval" : "running",
        updatedAt: new Date(),
      })
      .where(eq(aiAgentRun.id, run.id));
    return waiting;
  });
}

type Approval = { toolCallId: string; status: string; result: unknown };
export function applyCheckpointApprovals(
  checkpoint: AgentRunCheckpoint,
  approvals: Approval[],
): AgentRunCheckpoint {
  const results = new Map(approvals.map((action) => [action.toolCallId, action]));
  const messages = checkpoint.messages.map((message): ModelMessage => {
    if (message.role !== "tool") return message;
    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type !== "tool-result") return part;
        const action = results.get(part.toolCallId);
        if (!action) return part;
        if (action.status !== "succeeded" || !action.result)
          throw new Error("A required agent approval did not succeed.");
        return {
          ...part,
          output: { type: "json" as const, value: action.result as never },
        };
      }),
    };
  });
  return { ...checkpoint, messages };
}

/** Called after approval persistence; the parent lock serializes multiple approvals. */
export async function resumeAgentRunAfterApproval(env: RuntimeEnv, runId: string) {
  const queued = await backgroundTransaction(env, async (tx) => {
    const [run] = await tx.select().from(aiAgentRun).where(eq(aiAgentRun.id, runId)).for("update");
    if (!run || run.status !== "waiting_approval") return false;
    const actions = await tx
      .select()
      .from(aiAgentPendingAction)
      .where(eq(aiAgentPendingAction.agentRunId, runId));
    const unfinished = actions.some((action) => ["pending", "executing"].includes(action.status));
    const failed = actions.some(
      (action) => !["pending", "executing", "succeeded"].includes(action.status),
    );
    if (unfinished && !failed) return false;
    const checkpoint = await readAgentRunCheckpoint(env, run);
    if (
      !checkpoint.messages.length ||
      actions.some(
        (action) =>
          action.status !== "succeeded" || !checkpoint.toolCallIds.includes(action.toolCallId),
      )
    ) {
      await tx
        .update(aiAgentRun)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorCode: "AGENT_APPROVAL_CONTINUATION_UNAVAILABLE",
          errorSummary: "A required approval or saved checkpoint is unavailable.",
          leaseOwner: null,
          leaseExpiresAt: null,
        })
        .where(eq(aiAgentRun.id, runId));
      await tx
        .update(aiAgentConversationMessage)
        .set({
          status: "failed",
          updatedAt: new Date(),
          parts: [
            {
              type: "run",
              status: "failed",
              text: "Run stopped because a required approval could not complete.",
            },
          ],
        })
        .where(eq(aiAgentConversationMessage.runId, runId));
      return false;
    }
    const updated = applyCheckpointApprovals(checkpoint, actions);
    const encrypted = await encryptMcpSecret(env, JSON.stringify(updated), binding(run));
    await tx
      .update(aiAgentRun)
      .set({
        output: { checkpoint: encrypted },
        status: "queued",
        availableAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(aiAgentRun.id, runId));
    await dispatchBackgroundTasks(env, [
      createBackgroundTask({ env, kind: "agent.run", resourceId: runId }),
    ]);
    return true;
  });
  return queued;
}
