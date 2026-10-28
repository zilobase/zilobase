import {
  recordBackgroundCounter,
  recordBackgroundHistogram,
  backgroundAttributes,
} from "../../infrastructure/background/telemetry";
import { and, eq, lt, gt, isNull, inArray } from "drizzle-orm";
import { getRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { db, runWithIndependentDbEnv } from "../../infrastructure/database";
import {
  askAiRun,
  askAiRunEvent,
  askAiRunInput,
  session,
  user,
} from "../../infrastructure/database/schema";
import { getBackgroundCellId } from "../../infrastructure/background/contracts";
import { communityAppPolicy, managedAppPolicy } from "../../shared/config/app-policy";
import type { RuntimeEnv } from "../../shared/config/config";
import type { ServerOperationContext } from "../operations/context";
import { cancelProviderResponse, generateChatOutput, type ProviderChunk } from "./provider";
import {
  claimChatRun,
  checkpointChatRun,
  failChatRunDelivery,
  readChatRun,
  renewChatRunLease,
} from "./runs";
import { openRunInput } from "./run-input";
import { createAiDiagnostics } from "./diagnostics";
import { createChatTextBuffer } from "./text-buffer";

export async function processAiGeneration(
  env: RuntimeEnv,
  input: { runId: string; workerId: string; signal?: AbortSignal },
  provider = generateChatOutput,
) {
  const diagnostics = createAiDiagnostics(env, { runId: input.runId });
  const endRun = diagnostics.start("run");
  const scope = <T>(work: () => Promise<T>, stage = "setup") =>
    diagnostics.measureQuiet(stage, () =>
      runWithIndependentDbEnv(env, work, { onTiming: diagnostics.databaseTiming(stage) }),
    );
  let run;
  try {
    run = await scope(
      () => claimChatRun(input.runId, input.workerId, getBackgroundCellId(env)),
      "claim",
    );
  } catch (error) {
    if (error instanceof Error && error.message === "CHAT_RUN_BUSY") {
      endRun({ outcome: "busy" });
      return {
        outcome: "retry" as const,
        availableAt: new Date(Date.now() + 90_000).toISOString(),
      };
    }
    endRun({ outcome: "claim_failed" });
    throw error;
  }
  if (!run) {
    endRun({ outcome: "already_terminal" });
    return { outcome: "completed" as const };
  }
  diagnostics.event("claimed", {
    requestId: run.turnId,
    model: run.model,
    queueWaitMs: Date.now() - run.createdAt.getTime(),
  });
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    ...(run.deadlineAt
      ? [AbortSignal.timeout(Math.max(1, run.deadlineAt.getTime() - Date.now()))]
      : []),
    ...(input.signal ? [input.signal] : []),
  ]);
  let context: ServerOperationContext | undefined;
  let cursor: ProviderChunk = { responseId: run.responseId, cursor: run.providerCursor };
  let finished = false;
  let firstToken = false;
  const startedAt = Date.now();
  const attributes = backgroundAttributes(
    env,
    "ai.generate",
    run.responseId ? "resumed" : "started",
  );
  let stopped = false;
  let authorizedAt = 0;
  let control: Promise<void> | undefined;
  let flushTimer: ReturnType<typeof setInterval> | undefined;
  let writing: Promise<unknown> = Promise.resolve();
  const textBuffer = createChatTextBuffer(async (chunk, complete) => {
    writing = writing.then(() =>
      scope(
        () =>
          checkpointChatRun(
            run.id,
            input.workerId,
            run.fence,
            chunk,
            complete ? "completed" : undefined,
          ),
        "text_checkpoint",
      ),
    );
    await writing;
    recordBackgroundCounter("ai_checkpoint", attributes);
  }, cursor);
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    context = await scope(async () => {
      const [actor] = await db.select().from(user).where(eq(user.id, run.userId));
      const [login] = await db
        .select()
        .from(session)
        .where(and(eq(session.id, run.sessionId), eq(session.userId, run.userId)));
      if (!actor || !login || login.expiresAt <= new Date())
        throw new Error("CHAT_SESSION_REVOKED");
      return {
        env: {
          ...env,
          AI_MODEL: run.model,
          AI_PROVIDER_BACKGROUND_ENABLED: String(run.background),
        },
        runtimePorts: getRuntimePorts(),
        policy: env.ZILOBASE_RUNTIME_KIND === "worker" ? managedAppPolicy : communityAppPolicy,
        editionExtension: null,
        authentication: {
          user: actor,
          session: login,
          authMethod: "session",
          apiKey: null,
          oauthScopes: null,
        },
        activeWorkspaceId: run.workspaceId,
        pinnedWorkspaceId: run.workspaceId,
        requestId: run.turnId,
      };
    });
    const activeContext = context;
    await scope(() => readChatRun(activeContext, run.id, run.workspaceId));
    const [sealed] = await scope(() =>
      db.select().from(askAiRunInput).where(eq(askAiRunInput.runId, run.id)),
    );
    if (!sealed || sealed.expiresAt <= new Date()) throw new Error("CHAT_INPUT_EXPIRED");
    const payload = openRunInput(env, run.id, sealed.sealed);
    await scope(async () => {
      const started = await db
        .update(askAiRun)
        .set({ providerStartedAt: new Date() })
        .where(
          and(
            eq(askAiRun.id, run.id),
            eq(askAiRun.leaseOwner, input.workerId),
            eq(askAiRun.fence, run.fence),
            eq(askAiRun.status, "running"),
            gt(askAiRun.leaseExpiresAt, new Date()),
            isNull(askAiRun.cancelRequestedAt),
          ),
        )
        .returning({ id: askAiRun.id });
      if (!started.length) throw new Error("CHAT_RUN_LEASE_LOST");
    });
    const check = async () => {
      await scope(async () => {
        await renewChatRunLease(run.id, input.workerId, run.fence);
        if (Date.now() - authorizedAt > 5000) {
          const [login] = await db.select().from(session).where(eq(session.id, run.sessionId));
          if (!login || login.expiresAt <= new Date()) throw new Error("CHAT_SESSION_REVOKED");
          await readChatRun(activeContext, run.id, run.workspaceId);
          authorizedAt = Date.now();
        }
      }, "control");
    };
    heartbeat = setInterval(() => {
      if (control) return;
      control = check()
        .catch((error) => {
          controller.abort(error);
        })
        .finally(() => {
          control = undefined;
        });
    }, 1000);
    flushTimer = setInterval(() => {
      if (textBuffer.due()) void textBuffer.start().catch((error) => controller.abort(error));
    }, 200);
    recordBackgroundCounter("ai_provider_start", attributes);
    for await (const chunk of provider(activeContext, payload, signal, cursor, fetch, {
      diagnostics,
      checkpoint: async (state) => {
        await textBuffer.drain();
        writing = writing.then(() =>
          scope(
            () =>
              checkpointChatRun(
                run.id,
                input.workerId,
                run.fence,
                { checkpoint: state, context: state.context, progress: state.progress },
                undefined,
                env,
              ),
            "state_checkpoint",
          ),
        );
        await writing;
      },
    })) {
      signal.throwIfAborted();
      if (chunk.replaceText !== undefined || chunk.context || chunk.progress) {
        await textBuffer.drain();
        await scope(() =>
          checkpointChatRun(run.id, input.workerId, run.fence, {
            replaceText: chunk.replaceText,
            context: chunk.context,
            progress: chunk.progress,
          }),
        );
      }
      if (chunk.text && !firstToken) {
        firstToken = true;
        recordBackgroundHistogram("ai_first_token_ms", Date.now() - startedAt, attributes);
        diagnostics.event("first_text", { waitMs: Date.now() - startedAt });
      }
      if (textBuffer.size + (chunk.text?.length ?? 0) > 65_536) await textBuffer.drain();
      textBuffer.append(chunk);
      const newResponse = chunk.responseId && !cursor.responseId;
      cursor = {
        responseId: chunk.responseId ?? cursor.responseId,
        cursor: chunk.cursor ?? cursor.cursor,
        usage: chunk.usage,
      };
      if (newResponse || chunk.completed) await textBuffer.drain(!!chunk.completed);
      else if (textBuffer.size >= 4096 && !textBuffer.flushing)
        void textBuffer.start().catch((error) => controller.abort(error));
      if (chunk.completed) {
        finished = true;
        break;
      }
    }
    if (!finished) throw new Error("CHAT_PROVIDER_INTERRUPTED");
  } catch (error) {
    if (flushTimer) clearInterval(flushTimer);
    if (heartbeat) clearInterval(heartbeat);
    await writing.catch(() => {});
    await textBuffer.settle().catch(() => {});
    if (input.signal?.aborted) throw error;
    const reason = signal.reason instanceof Error ? signal.reason.message : "";
    const code = error instanceof Error ? error.message : "";
    if ([code, reason].includes("CHAT_RUN_LEASE_LOST")) throw error;
    if ([code, reason].includes("CHAT_RUN_CANCELLED")) stopped = true;
    if (
      run.agentVersion === 2 &&
      !signal.aborted &&
      !stopped &&
      run.fence < 3 &&
      (!run.deadlineAt || run.deadlineAt > new Date())
    ) {
      await scope(() =>
        db
          .update(askAiRun)
          .set({ leaseExpiresAt: new Date() })
          .where(
            and(
              eq(askAiRun.id, run.id),
              eq(askAiRun.leaseOwner, input.workerId),
              eq(askAiRun.fence, run.fence),
            ),
          ),
      );
      throw error;
    }
    if (context && cursor.responseId && signal.aborted)
      await cancelProviderResponse(context, cursor.responseId).catch(() => {});
    // A saved response can be reattached by a replacement worker. Never start another provider call for this attempt.
    if (
      !signal.aborted &&
      cursor.responseId &&
      !stopped &&
      (!run.deadlineAt || run.deadlineAt > new Date())
    ) {
      await scope(async () => {
        await db
          .update(askAiRun)
          .set({ leaseExpiresAt: new Date() })
          .where(
            and(
              eq(askAiRun.id, run.id),
              eq(askAiRun.leaseOwner, input.workerId),
              eq(askAiRun.fence, run.fence),
            ),
          );
      });
      throw error;
    }
    await scope(() =>
      checkpointChatRun(
        run.id,
        input.workerId,
        run.fence,
        textBuffer.pending(),
        stopped ? "stopped" : signal.aborted ? "interrupted" : "failed",
      ),
    ).catch(async (cause) => {
      if (
        !(cause instanceof Error) ||
        !["CHAT_RUN_LEASE_LOST", "CHAT_RUN_CANCELLED"].includes(cause.message)
      )
        throw cause;
    });
  } finally {
    recordBackgroundCounter("ai_producer_end", {
      ...attributes,
      outcome: stopped ? "stopped" : finished ? "completed" : "interrupted",
    });
    if (flushTimer) clearInterval(flushTimer);
    if (heartbeat) clearInterval(heartbeat);
    await writing.catch(() => {});
    await control;
    endRun({ outcome: stopped ? "stopped" : finished ? "completed" : "interrupted" });
    diagnostics.summary();
  }
  return { outcome: "completed" as const };
}

/** A bounded sweep closes abandoned input and removes replay data after history is durable. */
export async function maintainAiRuns(env: RuntimeEnv) {
  await db.delete(askAiRunInput).where(lt(askAiRunInput.expiresAt, new Date()));
  const rows = await db
    .select({ id: askAiRun.id })
    .from(askAiRun)
    .where(
      and(
        eq(askAiRun.cellId, getBackgroundCellId(env)),
        inArray(askAiRun.status, ["queued", "running"]),
        lt(askAiRun.deadlineAt, new Date()),
      ),
    )
    .limit(100);
  for (const row of rows) await failChatRunDelivery(row.id);
  const expired = await db
    .select({ id: askAiRun.id })
    .from(askAiRun)
    .where(
      and(
        eq(askAiRun.cellId, getBackgroundCellId(env)),
        inArray(askAiRun.status, ["completed", "stopped", "failed", "interrupted"]),
        lt(askAiRun.completedAt, new Date(Date.now() - 86_400_000)),
      ),
    )
    .limit(100);
  for (const row of expired) await db.delete(askAiRunEvent).where(eq(askAiRunEvent.runId, row.id));
}
