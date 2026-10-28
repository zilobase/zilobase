import {
  recordBackgroundCounter,
  backgroundAttributes,
} from "../../infrastructure/background/telemetry";
import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { runWithIndependentDbEnv } from "../../infrastructure/database";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type {
  ChatRequest,
  ChatRequestInput,
  ChatRunEnvelope,
  ChatRunEvent,
  ChatRunReceipt,
  ChatRunStatus,
  ChatRunDebug,
} from "@zilobase/features/runtime";
import { db } from "../../infrastructure/database";
import {
  askAiRun,
  askAiRunEvent,
  askAiRunInput,
  askAiThread,
  askAiTurn,
  session,
} from "../../infrastructure/database/schema";
import {
  backgroundTransaction,
  persistBackgroundTasks,
} from "../../infrastructure/background/publication";
import {
  createBackgroundTaskV2,
  getBackgroundCellId,
} from "../../infrastructure/background/task-v2";
import { ServerOperationError, type ServerOperationContext } from "../operations/context";
import { authorizeChatWorkspace } from "./context";
import {
  createAgentState,
  emptyChatContext,
  resumeAgentState,
  type AgentState,
} from "./agent-state";
import { chatRequestSchema, chatDisplayText } from "@zilobase/features/runtime";
import { assertHistoryAccess } from "./conversations";
import { CHAT_INSTRUCTIONS, configuredChatModel, DEFAULT_CHAT_MODEL } from "./chat";
import { attachConversationHistory, type ConversationMemory } from "./compaction";
import { type ProviderChunk } from "./provider";
import { openRunInput, sealRunInput } from "./run-input";
import { createAiDiagnostics } from "./diagnostics";

export const durableChatEnabled = (env: Record<string, unknown>) =>
  env.AI_DURABLE_STREAMING_ENABLED === "true";
export const isRunTerminal = (status: string) => !["queued", "running"].includes(status);
export type RunRow = typeof askAiRun.$inferSelect;
export const snapshot = (
  run: RunRow,
  text: string,
  context?: (typeof askAiTurn.$inferSelect)["context"],
  progress?: (typeof askAiTurn.$inferSelect)["progress"],
): ChatRunReceipt => ({
  ...(context ? { context: { ...context, markdown: "" } } : {}),
  ...(progress ? { progress } : {}),
  runId: run.id,
  requestId: run.turnId,
  threadId: run.threadId,
  turnId: run.turnId,
  status: run.status,
  seq: run.seq,
  text,
});

export async function admitChatRun(
  context: ServerOperationContext,
  input: ChatRequestInput,
): Promise<ChatRunReceipt> {
  const request = chatRequestSchema.parse(input);
  const diagnostics = createAiDiagnostics(context.env, { requestId: request.requestId });
  const receipt = await diagnostics.measure("admission", () =>
    admitChatRunOperation(context, request),
  );
  diagnostics.event("admitted", { runId: receipt.runId, outcome: receipt.status });
  return receipt;
}

async function admitChatRunOperation(
  context: ServerOperationContext,
  request: ChatRequest,
): Promise<ChatRunReceipt> {
  if (!durableChatEnabled(context.env))
    throw new ServerOperationError({ error: "Durable chat is not enabled" }, 503);
  const actor = await authorizeChatWorkspace(context, request.workspaceId);
  if (context.authentication.authMethod !== "session" || !context.authentication.session?.id)
    throw new ServerOperationError(
      { error: "Durable chat requires an authenticated session" },
      403,
    );
  configuredChatModel(context);
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        text: request.text,
        roots: request.roots,
        continueFromRunId: request.continueFromRunId,
      }),
    )
    .digest("hex");
  const existing = await findRunByRequest(context, request.requestId, request.workspaceId);
  if (existing) {
    if (
      existing.turn.requestHash !== hash ||
      (request.threadId && request.threadId !== existing.run.threadId)
    )
      throw new ServerOperationError({ error: "Request ID already used" }, 409);
    return snapshot(
      existing.run,
      existing.turn.assistantText,
      existing.turn.context,
      existing.turn.progress,
    );
  }
  let continued: AgentState | undefined;
  if (request.continueFromRunId) {
    const previous = await readChatRun(context, request.continueFromRunId, request.workspaceId);
    if (
      previous.status !== "completed" ||
      !previous.progress?.canContinue ||
      previous.threadId !== request.threadId
    )
      throw new ServerOperationError({ error: "This read cannot be continued" }, 409);
    const [saved] = await db
      .select()
      .from(askAiRunInput)
      .where(eq(askAiRunInput.runId, previous.runId));
    if (!saved || saved.expiresAt <= new Date())
      throw new ServerOperationError(
        { error: "Continuation expired. Ask again with your sources." },
        409,
      );
    continued = openRunInput(context.env, previous.runId, saved.sealed).agent;
    if (
      !continued ||
      continued.expiresAt < Date.now() ||
      JSON.stringify(continued.roots) !== JSON.stringify(request.roots)
    )
      throw new ServerOperationError(
        { error: "Continuation sources changed. Ask again with your sources." },
        409,
      );
    if (!resumeAgentState(continued))
      throw new ServerOperationError({ error: "No unfinished reads remain to continue" }, 409);
  }
  const built = continued?.context ?? emptyChatContext();
  const { markdown: _markdown, ...metadata } = built;
  return backgroundTransaction(context.env, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`ask-ai:${request.workspaceId}:${actor.id}`}, 0))`,
    );
    const [previous] = await tx.select().from(askAiTurn).where(eq(askAiTurn.id, request.requestId));
    if (previous) {
      const found = await findRunByRequest(context, request.requestId, request.workspaceId);
      if (
        !found ||
        previous.requestHash !== hash ||
        (request.threadId && request.threadId !== found.run.threadId)
      )
        throw new ServerOperationError({ error: "Request ID already used" }, 409);
      return snapshot(found.run, previous.assistantText, previous.context, previous.progress);
    }
    const threadId = request.threadId ?? randomUUID();
    let compactedMemory: string | null = null;
    if (request.threadId) {
      const [thread] = await tx
        .select()
        .from(askAiThread)
        .where(
          and(
            eq(askAiThread.id, threadId),
            eq(askAiThread.userId, actor.id),
            eq(askAiThread.workspaceId, request.workspaceId),
          ),
        );
      if (!thread) throw new ServerOperationError({ error: "Conversation not found" }, 404);
      compactedMemory = thread.compactedMemory;
    } else
      await tx.insert(askAiThread).values({
        id: threadId,
        workspaceId: request.workspaceId,
        userId: actor.id,
        title: chatDisplayText(request.text).trim().slice(0, 100) || "New AI chat",
      });
    const turns = await tx
      .select()
      .from(askAiTurn)
      .where(eq(askAiTurn.threadId, threadId))
      .orderBy(asc(askAiTurn.createdAt), asc(askAiTurn.id));
    await assertHistoryAccess(context, request.workspaceId, turns);
    if (turns.some((turn) => turn.status === "streaming"))
      throw new ServerOperationError(
        { error: "Wait for the current answer or stop it first" },
        409,
      );
    const runId = randomUUID();
    const agent =
      continued ??
      createAgentState(request.workspaceId, request.roots, [
        {
          role: "user",
          content: `Mentioned sources (references only): ${JSON.stringify(request.roots)}\n\nUser question:\n${request.text}`,
        },
      ]);
    if (!continued)
      attachConversationHistory(
        agent,
        turns,
        compactedMemory
          ? openRunInput<ConversationMemory>(context.env, `thread:${threadId}`, compactedMemory)
          : undefined,
      );
    const sealed = sealRunInput(context.env, runId, {
      messages: agent.messages,
      model: String(context.env.AI_MODEL ?? "").trim() || DEFAULT_CHAT_MODEL,
      agent,
    });
    const deadline = new Date(Date.now() + 120_000);
    await tx.insert(askAiTurn).values({
      id: request.requestId,
      threadId,
      requestHash: hash,
      userText: request.text,
      roots: request.roots,
      context: metadata,
      expiresAt: deadline,
    });
    const [run] = await tx
      .insert(askAiRun)
      .values({
        id: runId,
        turnId: request.requestId,
        threadId,
        userId: actor.id,
        workspaceId: request.workspaceId,
        sessionId: context.authentication.session!.id,
        cellId: getBackgroundCellId(context.env),
        model: String(context.env.AI_MODEL ?? "").trim() || DEFAULT_CHAT_MODEL,
        background: false,
        agentVersion: 2,
        deadlineAt: null,
      })
      .returning();
    await tx.insert(askAiRunInput).values({ runId, sealed, expiresAt: new Date(agent.expiresAt) });
    await tx.update(askAiThread).set({ updatedAt: new Date() }).where(eq(askAiThread.id, threadId));
    await persistBackgroundTasks(
      context.env,
      [createBackgroundTaskV2({ env: context.env, kind: "ai.generate", resourceId: runId })],
      tx,
    );
    return snapshot(run!, "", metadata, { activities: [], canContinue: false });
  });
}

async function findRunByRequest(
  context: ServerOperationContext,
  requestId: string,
  workspaceId: string,
) {
  const [found] = await db
    .select({ run: askAiRun, turn: askAiTurn })
    .from(askAiRun)
    .innerJoin(askAiTurn, eq(askAiTurn.id, askAiRun.turnId))
    .where(
      and(
        eq(askAiRun.turnId, requestId),
        eq(askAiRun.userId, context.authentication.user!.id),
        eq(askAiRun.workspaceId, workspaceId),
      ),
    );
  return found;
}
export async function getChatRequest(
  context: ServerOperationContext,
  requestId: string,
  workspaceId: string,
) {
  await authorizeChatWorkspace(context, workspaceId);
  const found = await findRunByRequest(context, requestId, workspaceId);
  if (!found) throw new ServerOperationError({ error: "Request not found" }, 404);
  await assertHistoryAccess(context, workspaceId, [found.turn]);
  return snapshot(found.run, found.turn.assistantText, found.turn.context, found.turn.progress);
}
export async function readChatRun(
  context: ServerOperationContext,
  runId: string,
  workspaceId: string,
  executor: Pick<typeof db, "select"> = db,
) {
  await authorizeChatWorkspace(context, workspaceId);
  const loginId = context.authentication.session?.id;
  if (context.authentication.authMethod !== "session" || !loginId)
    throw new ServerOperationError({ error: "Session required" }, 401);
  const [login] = await executor
    .select({ id: session.id })
    .from(session)
    .where(
      and(
        eq(session.id, loginId),
        eq(session.userId, context.authentication.user!.id),
        gt(session.expiresAt, new Date()),
      ),
    );
  if (!login) throw new ServerOperationError({ error: "Session expired" }, 401);
  const [found] = await executor
    .select({ run: askAiRun, turn: askAiTurn })
    .from(askAiRun)
    .innerJoin(askAiTurn, eq(askAiTurn.id, askAiRun.turnId))
    .where(
      and(
        eq(askAiRun.id, runId),
        eq(askAiRun.userId, context.authentication.user!.id),
        eq(askAiRun.workspaceId, workspaceId),
      ),
    );
  if (!found) throw new ServerOperationError({ error: "Run not found" }, 404);
  await assertHistoryAccess(context, workspaceId, [found.turn]);
  return snapshot(found.run, found.turn.assistantText, found.turn.context, found.turn.progress);
}
/** Raw payloads are only returned on demand after owner, session and source authorization. */
export async function readChatRunDebug(
  context: ServerOperationContext,
  runId: string,
  workspaceId: string,
): Promise<ChatRunDebug> {
  return db.transaction(
    async (tx) => {
      const receipt = await readChatRun(context, runId, workspaceId, tx);
      const turns = await tx
        .select()
        .from(askAiTurn)
        .where(eq(askAiTurn.threadId, receipt.threadId));
      await assertHistoryAccess(context, workspaceId, turns);
      const [saved] = await tx.select().from(askAiRunInput).where(eq(askAiRunInput.runId, runId));
      if (!saved || saved.expiresAt <= new Date())
        return {
          runId,
          status: receipt.status,
          model: null,
          expiresAt: null,
          available: false,
          events: [],
          omitted: 0,
        };
      const input = openRunInput(context.env, runId, saved.sealed);
      return {
        runId,
        status: receipt.status,
        model: input.model ?? null,
        expiresAt: saved.expiresAt.toISOString(),
        available:
          !!input.agent?.debug || receipt.status === "queued" || receipt.status === "running",
        events: input.agent?.debug?.events ?? [],
        omitted: input.agent?.debug?.omitted ?? 0,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}

export async function readChatRunPage(
  context: ServerOperationContext,
  runId: string,
  workspaceId: string,
  after: number,
) {
  return db.transaction(
    async (tx) => {
      const receipt = await readChatRun(context, runId, workspaceId, tx);
      const events = await tx
        .select()
        .from(askAiRunEvent)
        .where(and(eq(askAiRunEvent.runId, runId), gt(askAiRunEvent.seq, after)))
        .orderBy(asc(askAiRunEvent.seq))
        .limit(100);
      // A compacted or unavailable suffix must be replaced by an atomic snapshot.
      const reset =
        (events[0] && events[0].seq !== after + 1) ||
        (!events.length && after < receipt.seq) ||
        after > receipt.seq;
      return {
        snapshot: receipt,
        reset: !!reset,
        events: events.map((row): ChatRunEnvelope => ({
          version: 1,
          runId,
          seq: row.seq,
          event: row.event,
        })),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function cancelChatRun(
  context: ServerOperationContext,
  runId: string,
  workspaceId: string,
) {
  await readChatRun(context, runId, workspaceId);
  recordBackgroundCounter(
    "ai_cancellation",
    backgroundAttributes(context.env, "ai.generate", "requested"),
  );
  await db.transaction(async (tx) => {
    const [run] = await tx.select().from(askAiRun).where(eq(askAiRun.id, runId)).for("update");
    if (!run || isRunTerminal(run.status)) return;
    await tx.update(askAiRun).set({ cancelRequestedAt: new Date() }).where(eq(askAiRun.id, runId));
    if (run.status === "queued") await finalizeRunLocked(tx, run, "stopped");
  });
  return readChatRun(context, runId, workspaceId);
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function finalizeRunLocked(
  tx: Transaction,
  run: RunRow,
  status: Exclude<ChatRunStatus, "queued" | "running">,
  event?: ChatRunEvent,
) {
  const seq = run.seq + 1;
  const now = new Date();
  await tx.insert(askAiRunEvent).values({
    runId: run.id,
    seq,
    event:
      event ??
      (status === "completed" || status === "stopped"
        ? { type: "done", status }
        : { type: "status", status }),
  });
  await tx
    .update(askAiRun)
    .set({ status, seq, completedAt: now, leaseExpiresAt: null, leaseOwner: null, updatedAt: now })
    .where(eq(askAiRun.id, run.id));
  await tx.update(askAiTurn).set({ status, updatedAt: now }).where(eq(askAiTurn.id, run.turnId));
  // Agent checkpoints (including debug reads) expire after their existing one-hour TTL.
  if (run.agentVersion !== 2) await tx.delete(askAiRunInput).where(eq(askAiRunInput.runId, run.id));
}
export async function claimChatRun(runId: string, owner: string, cellId: string) {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(askAiRun)
      .where(and(eq(askAiRun.id, runId), eq(askAiRun.cellId, cellId)))
      .for("update");
    if (!run || isRunTerminal(run.status)) return null;
    if (run.cancelRequestedAt || (run.deadlineAt && run.deadlineAt <= new Date())) {
      await finalizeRunLocked(tx, run, run.cancelRequestedAt ? "stopped" : "interrupted");
      return null;
    }
    if (run.leaseExpiresAt && run.leaseExpiresAt > new Date()) throw new Error("CHAT_RUN_BUSY");
    if (run.agentVersion !== 2 && run.providerStartedAt && !run.responseId) {
      await finalizeRunLocked(tx, run, "interrupted");
      return null;
    }
    const [claimed] = await tx
      .update(askAiRun)
      .set({
        status: "running",
        leaseOwner: owner,
        fence: run.fence + 1,
        leaseExpiresAt: new Date(Date.now() + 90_000),
        updatedAt: new Date(),
      })
      .where(eq(askAiRun.id, runId))
      .returning();
    return claimed!;
  });
}
export async function checkpointChatRun(
  runId: string,
  owner: string,
  fence: number,
  chunk: ProviderChunk,
  terminal?: Exclude<ChatRunStatus, "queued" | "running">,
  env?: Record<string, unknown>,
) {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(askAiRun).where(eq(askAiRun.id, runId)).for("update");
    if (
      !run ||
      run.leaseOwner !== owner ||
      run.fence !== fence ||
      run.status !== "running" ||
      !run.leaseExpiresAt ||
      run.leaseExpiresAt <= new Date()
    )
      throw new Error("CHAT_RUN_LEASE_LOST");
    if (run.cancelRequestedAt && terminal !== "stopped") throw new Error("CHAT_RUN_CANCELLED");
    let seq = run.seq;
    if (chunk.replaceText !== undefined) {
      await tx
        .insert(askAiRunEvent)
        .values({ runId, seq: ++seq, event: { type: "replace-text", text: chunk.replaceText } });
      await tx
        .update(askAiTurn)
        .set({ assistantText: chunk.replaceText, updatedAt: new Date() })
        .where(eq(askAiTurn.id, run.turnId));
    }
    if (chunk.context && chunk.progress) {
      const { markdown: _markdown, ...metadata } = chunk.context;
      await tx.insert(askAiRunEvent).values({
        runId,
        seq: ++seq,
        event: {
          type: "read-progress",
          context: { ...metadata, markdown: "" },
          progress: chunk.progress,
        },
      });
      await tx
        .update(askAiTurn)
        .set({ context: metadata, progress: chunk.progress, updatedAt: new Date() })
        .where(eq(askAiTurn.id, run.turnId));
    }
    if (chunk.checkpoint) {
      const state = chunk.checkpoint;
      if (!env) throw new Error("CHAT_CHECKPOINT_ENV_REQUIRED");
      const sealed = sealRunInput(env, runId, {
        messages: state.messages,
        model: run.model,
        agent: state,
      });
      await tx
        .update(askAiRunInput)
        .set({ sealed, expiresAt: new Date(state.expiresAt) })
        .where(eq(askAiRunInput.runId, runId));
      if (state.conversation?.dirty && state.conversation.memory)
        await tx
          .update(askAiThread)
          .set({
            compactedMemory: sealRunInput(env, `thread:${run.threadId}`, state.conversation.memory),
          })
          .where(eq(askAiThread.id, run.threadId));
    }
    if (chunk.text) {
      if (chunk.text.length > 65_536) throw new Error("CHAT_RUN_BATCH_TOO_LARGE");
      await tx
        .insert(askAiRunEvent)
        .values({ runId, seq: ++seq, event: { type: "delta", text: chunk.text } });
      await tx
        .update(askAiTurn)
        .set({
          assistantText: sql`${askAiTurn.assistantText} || ${chunk.text}`,
          updatedAt: new Date(),
        })
        .where(eq(askAiTurn.id, run.turnId));
    }
    await tx
      .update(askAiRun)
      .set({
        seq,
        responseId: chunk.responseId ?? run.responseId,
        providerCursor: chunk.cursor ?? run.providerCursor,
        leaseExpiresAt: new Date(Date.now() + 90_000),
        updatedAt: new Date(),
      })
      .where(eq(askAiRun.id, runId));
    if (chunk.usage)
      await tx.update(askAiTurn).set({ usage: chunk.usage }).where(eq(askAiTurn.id, run.turnId));
    if (terminal) await finalizeRunLocked(tx, { ...run, seq }, terminal);
    return { cancelled: !!run.cancelRequestedAt };
  });
}
/** A lease heartbeat carries no events; keep its successful path to one fenced SQL update. */
export async function renewChatRunLease(runId: string, owner: string, fence: number) {
  const now = new Date();
  const [renewed] = await db
    .update(askAiRun)
    .set({ leaseExpiresAt: new Date(now.getTime() + 90_000), updatedAt: now })
    .where(
      and(
        eq(askAiRun.id, runId),
        eq(askAiRun.leaseOwner, owner),
        eq(askAiRun.fence, fence),
        eq(askAiRun.status, "running"),
        gt(askAiRun.leaseExpiresAt, now),
        isNull(askAiRun.cancelRequestedAt),
      ),
    )
    .returning({ id: askAiRun.id });
  if (renewed) return;
  const [state] = await db.select().from(askAiRun).where(eq(askAiRun.id, runId));
  if (
    state?.leaseOwner === owner &&
    state.fence === fence &&
    state.status === "running" &&
    state.cancelRequestedAt
  )
    throw new Error("CHAT_RUN_CANCELLED");
  throw new Error("CHAT_RUN_LEASE_LOST");
}
export async function latestThreadRun(threadId: string) {
  const [found] = await db
    .select({ run: askAiRun, turn: askAiTurn })
    .from(askAiRun)
    .innerJoin(askAiTurn, eq(askAiTurn.id, askAiRun.turnId))
    .where(eq(askAiRun.threadId, threadId))
    .orderBy(desc(askAiRun.createdAt))
    .limit(1);
  return found
    ? snapshot(found.run, found.turn.assistantText, found.turn.context, found.turn.progress)
    : null;
}
export async function failChatRunDelivery(runId: string) {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(askAiRun).where(eq(askAiRun.id, runId)).for("update");
    if (!run || isRunTerminal(run.status)) return true;
    if (run.leaseExpiresAt && run.leaseExpiresAt > new Date()) return false;
    await finalizeRunLocked(tx, run, "interrupted");
    return true;
  });
}

export function readChatRunPageInScope(
  context: ServerOperationContext,
  runId: string,
  threadId: string,
  after: number,
) {
  return runWithRuntimePorts(context.runtimePorts, () =>
    runWithIndependentDbEnv(context.env, async () => {
      const [thread] = await db
        .select({ workspaceId: askAiThread.workspaceId })
        .from(askAiThread)
        .where(
          and(
            eq(askAiThread.id, threadId),
            eq(askAiThread.userId, context.authentication.user!.id),
          ),
        );
      if (!thread) throw new ServerOperationError({ error: "Conversation not found" }, 404);
      return readChatRunPage(context, runId, thread.workspaceId, after);
    }),
  );
}
