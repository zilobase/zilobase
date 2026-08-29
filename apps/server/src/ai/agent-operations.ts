import { getAgentToolDescriptor } from "@zilobase/features/ai-chat/tool-registry";
import type { UIMessage } from "ai";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";

import { getStringEnv, type RuntimeEnv } from "../shared/config/config";
import { db } from "../infrastructure/database";
import {
  aiAgentActionReceipt,
  aiAgentToolExecution,
  aiAgentTurn,
  aiChatArtifact,
  aiChatUpload,
} from "../infrastructure/database/schema";
import { createImageStorage } from "../infrastructure/storage/image-storage";

const DAY_MS = 24 * 60 * 60 * 1_000;

export type AiAgentLimits = {
  auditRetentionDays: number;
  cleanupBatchSize: number;
  maxArtifactBytesPerUserPerDay: number;
  maxArtifactsPerUserPerDay: number;
  maxConcurrentTurnsPerUser: number;
  maxConcurrentTurnsPerWorkspace: number;
  maxFilesPerTurn: number;
  maxInputCharacters: number;
  maxInputMessages: number;
  maxOutputTokens: number;
  maxRetries: number;
  maxSteps: number;
  maxTokensPerUserPerDay: number;
  maxTurnsPerUserPerDay: number;
  maxUploadBytesPerUserPerDay: number;
  streamChunkTimeoutMs: number;
  streamStepTimeoutMs: number;
  turnTimeoutMs: number;
};

export type AiAgentTurnMetrics = {
  attachmentCount: number;
  inputCharacterCount: number;
  inputMessageCount: number;
};

export class AiAgentOperationalLimitError extends Error {
  readonly code: string;
  readonly retryAfterSeconds: number;
  readonly status = 429;

  constructor(code: string, message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "AiAgentOperationalLimitError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function readAiAgentLimits(env: RuntimeEnv): AiAgentLimits {
  return {
    auditRetentionDays: readBoundedIntegerEnv(env, "AI_AGENT_AUDIT_RETENTION_DAYS", 90, 7, 365),
    cleanupBatchSize: readBoundedIntegerEnv(env, "AI_AGENT_CLEANUP_BATCH_SIZE", 100, 10, 1_000),
    maxArtifactBytesPerUserPerDay: readBoundedIntegerEnv(
      env,
      "AI_AGENT_MAX_ARTIFACT_BYTES_PER_USER_PER_DAY",
      250 * 1024 * 1024,
      1024 * 1024,
      2_000_000_000,
    ),
    maxArtifactsPerUserPerDay: readBoundedIntegerEnv(
      env,
      "AI_AGENT_MAX_ARTIFACTS_PER_USER_PER_DAY",
      50,
      1,
      1_000,
    ),
    maxConcurrentTurnsPerUser: readBoundedIntegerEnv(
      env,
      "AI_AGENT_MAX_CONCURRENT_TURNS_PER_USER",
      2,
      1,
      10,
    ),
    maxConcurrentTurnsPerWorkspace: readBoundedIntegerEnv(
      env,
      "AI_AGENT_MAX_CONCURRENT_TURNS_PER_WORKSPACE",
      24,
      1,
      500,
    ),
    maxFilesPerTurn: readBoundedIntegerEnv(env, "AI_AGENT_MAX_FILES_PER_TURN", 5, 1, 5),
    maxInputCharacters: readBoundedIntegerEnv(
      env,
      "AI_AGENT_MAX_INPUT_CHARACTERS",
      250_000,
      10_000,
      1_000_000,
    ),
    maxInputMessages: readBoundedIntegerEnv(env, "AI_AGENT_MAX_INPUT_MESSAGES", 500, 10, 500),
    maxOutputTokens: readBoundedIntegerEnv(env, "AI_AGENT_MAX_OUTPUT_TOKENS", 1_600, 256, 8_000),
    maxRetries: readBoundedIntegerEnv(env, "AI_AGENT_MAX_PROVIDER_RETRIES", 2, 0, 5),
    maxSteps: readBoundedIntegerEnv(env, "AI_AGENT_MAX_STEPS", 15, 1, 15),
    maxTokensPerUserPerDay: readBoundedIntegerEnv(
      env,
      "AI_AGENT_MAX_TOKENS_PER_USER_PER_DAY",
      500_000,
      10_000,
      10_000_000,
    ),
    maxTurnsPerUserPerDay: readBoundedIntegerEnv(
      env,
      "AI_AGENT_MAX_TURNS_PER_USER_PER_DAY",
      200,
      1,
      10_000,
    ),
    maxUploadBytesPerUserPerDay: readBoundedIntegerEnv(
      env,
      "AI_AGENT_MAX_UPLOAD_BYTES_PER_USER_PER_DAY",
      250 * 1024 * 1024,
      1024 * 1024,
      2_000_000_000,
    ),
    streamChunkTimeoutMs: readBoundedIntegerEnv(
      env,
      "AI_AGENT_STREAM_CHUNK_TIMEOUT_MS",
      30_000,
      5_000,
      120_000,
    ),
    streamStepTimeoutMs: readBoundedIntegerEnv(
      env,
      "AI_AGENT_STREAM_STEP_TIMEOUT_MS",
      60_000,
      10_000,
      180_000,
    ),
    turnTimeoutMs: readBoundedIntegerEnv(
      env,
      "AI_AGENT_TURN_TIMEOUT_MS",
      180_000,
      30_000,
      600_000,
    ),
  };
}

export function summarizeAiAgentTurnInput(
  messages: UIMessage[],
  attachmentIds: string[],
): AiAgentTurnMetrics {
  return {
    attachmentCount: new Set(attachmentIds).size,
    inputCharacterCount: messages.reduce(
      (total, message) => total + safeSerializedLength(message.parts),
      0,
    ),
    inputMessageCount: messages.length,
  };
}

export async function reserveAiAgentTurn(input: {
  clientTurnId?: string;
  env: RuntimeEnv;
  metrics: AiAgentTurnMetrics;
  requestedModel: string;
  threadId: string;
  userMessageId?: string;
  userId: string;
  workspaceId: string;
}) {
  const limits = readAiAgentLimits(input.env);
  const now = new Date();
  const id = crypto.randomUUID();

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`ai-agent-workspace:${input.workspaceId}`}))`,
    );
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`ai-agent-user:${input.workspaceId}:${input.userId}`}))`,
    );

    const staleBefore = getAiAgentTurnStaleBefore(now, limits.turnTimeoutMs);
    await tx
      .update(aiAgentTurn)
      .set({
        completedAt: now,
        errorCode: "stale_turn_timeout",
        status: "failed",
        updatedAt: now,
      })
      .where(
        and(
          eq(aiAgentTurn.status, "running"),
          lt(aiAgentTurn.startedAt, staleBefore),
          eq(aiAgentTurn.workspaceId, input.workspaceId),
        ),
      );

    const rejection = validateTurnInputMetrics(input.metrics, limits) ??
      await resolveTurnQuotaRejection({
        limits,
        now,
        tx,
        userId: input.userId,
        workspaceId: input.workspaceId,
      });

    await tx.insert(aiAgentTurn).values({
      attachmentCount: input.metrics.attachmentCount,
      completedAt: rejection ? now : null,
      createdAt: now,
      durationMs: rejection ? 0 : null,
      errorCode: rejection?.code ?? null,
      id,
      clientTurnId: input.clientTurnId ?? null,
      inputCharacterCount: input.metrics.inputCharacterCount,
      inputMessageCount: input.metrics.inputMessageCount,
      requestedModel: input.requestedModel.slice(0, 160),
      startedAt: now,
      status: rejection ? "rejected" : "running",
      threadId: input.threadId,
      userMessageId: input.userMessageId ?? null,
      updatedAt: now,
      userId: input.userId,
      workspaceId: input.workspaceId,
    });

    return rejection
      ? { id, limits, ok: false as const, rejection }
      : { id, limits, ok: true as const, startedAt: now };
  });
}

export async function getAiAgentTurnByClientId(input: {
  clientTurnId: string;
  threadId: string;
}) {
  const [turn] = await db
    .select({ id: aiAgentTurn.id, status: aiAgentTurn.status })
    .from(aiAgentTurn)
    .where(and(
      eq(aiAgentTurn.threadId, input.threadId),
      eq(aiAgentTurn.clientTurnId, input.clientTurnId),
    ))
    .limit(1);
  return turn ?? null;
}

export async function finishAiAgentTurn(input: {
  errorCode?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  status: "succeeded" | "failed" | "cancelled";
  stepCount?: number;
  toolCallCount?: number;
  totalTokens?: number;
  turnId: string;
}) {
  const now = new Date();
  const [record] = await db
    .select({ startedAt: aiAgentTurn.startedAt })
    .from(aiAgentTurn)
    .where(eq(aiAgentTurn.id, input.turnId))
    .limit(1);

  if (!record) return;

  await db
    .update(aiAgentTurn)
    .set({
      completedAt: now,
      durationMs: Math.max(0, now.getTime() - record.startedAt.getTime()),
      errorCode: input.errorCode?.slice(0, 120) || null,
      inputTokens: normalizeUsage(input.inputTokens),
      outputTokens: normalizeUsage(input.outputTokens),
      status: input.status,
      stepCount: normalizeCount(input.stepCount),
      toolCallCount: normalizeCount(input.toolCallCount),
      totalTokens: normalizeUsage(input.totalTokens),
      updatedAt: now,
    })
    .where(and(eq(aiAgentTurn.id, input.turnId), eq(aiAgentTurn.status, "running")));

  await db
    .update(aiAgentToolExecution)
    .set({
      completedAt: now,
      errorCode: input.status === "cancelled" ? "turn_cancelled" : "turn_ended",
      status: input.status === "cancelled" ? "cancelled" : "failed",
      updatedAt: now,
    })
    .where(
      and(
        eq(aiAgentToolExecution.turnId, input.turnId),
        eq(aiAgentToolExecution.status, "running"),
      ),
    );
}

export async function startAiAgentToolExecution(input: {
  stepNumber?: number;
  toolCallId: string;
  toolName: string;
  turnId: string;
}) {
  const now = new Date();
  await db
    .insert(aiAgentToolExecution)
    .values({
      createdAt: now,
      effect: getAiAgentToolEffect(input.toolName),
      id: crypto.randomUUID(),
      status: "running",
      stepNumber: input.stepNumber,
      toolCallId: input.toolCallId,
      toolName: input.toolName.slice(0, 160),
      turnId: input.turnId,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

export async function finishAiAgentToolExecution(input: {
  durationMs: number;
  error?: unknown;
  success: boolean;
  toolCallId: string;
  turnId: string;
}) {
  const now = new Date();
  await db
    .update(aiAgentToolExecution)
    .set({
      completedAt: now,
      durationMs: normalizeCount(input.durationMs),
      errorCode: input.success ? null : normalizeAiAgentErrorCode(input.error),
      status: input.success ? "succeeded" : "failed",
      updatedAt: now,
    })
    .where(
      and(
        eq(aiAgentToolExecution.turnId, input.turnId),
        eq(aiAgentToolExecution.toolCallId, input.toolCallId),
      ),
    );
}

export async function assertAiAgentUploadQuota(input: {
  byteSize: number;
  env: RuntimeEnv;
  userId: string;
  workspaceId: string;
}) {
  const limits = readAiAgentLimits(input.env);
  const since = new Date(Date.now() - DAY_MS);
  const [usage] = await db
    .select({ bytes: sql<number>`coalesce(sum(${aiChatUpload.byteSize}), 0)` })
    .from(aiChatUpload)
    .where(
      and(
        eq(aiChatUpload.workspaceId, input.workspaceId),
        eq(aiChatUpload.userId, input.userId),
        gte(aiChatUpload.createdAt, since),
        ne(aiChatUpload.status, "rejected"),
      ),
    );

  if (Number(usage?.bytes ?? 0) + input.byteSize > limits.maxUploadBytesPerUserPerDay) {
    throw new AiAgentOperationalLimitError(
      "daily_upload_bytes_exceeded",
      "Your Ask AI upload allowance for the last 24 hours has been reached.",
      3_600,
    );
  }
}

export async function assertAiAgentArtifactQuota(input: {
  byteSize: number;
  env: RuntimeEnv;
  userId: string;
  workspaceId: string;
}) {
  const limits = readAiAgentLimits(input.env);
  const since = new Date(Date.now() - DAY_MS);
  const [usage] = await db
    .select({
      bytes: sql<number>`coalesce(sum(${aiChatArtifact.byteSize}), 0)`,
      count: count(),
    })
    .from(aiChatArtifact)
    .where(
      and(
        eq(aiChatArtifact.workspaceId, input.workspaceId),
        eq(aiChatArtifact.userId, input.userId),
        gte(aiChatArtifact.createdAt, since),
        ne(aiChatArtifact.status, "expired"),
      ),
    );

  if (Number(usage?.count ?? 0) >= limits.maxArtifactsPerUserPerDay) {
    throw new AiAgentOperationalLimitError(
      "daily_artifact_count_exceeded",
      "Your Ask AI artifact allowance for the last 24 hours has been reached.",
      3_600,
    );
  }

  if (Number(usage?.bytes ?? 0) + input.byteSize > limits.maxArtifactBytesPerUserPerDay) {
    throw new AiAgentOperationalLimitError(
      "daily_artifact_bytes_exceeded",
      "Your Ask AI artifact storage allowance for the last 24 hours has been reached.",
      3_600,
    );
  }
}

export async function listAiAgentTurnsForWorkspace(input: {
  limit?: number;
  workspaceId: string;
}) {
  return db
    .select({
      attachmentCount: aiAgentTurn.attachmentCount,
      completedAt: aiAgentTurn.completedAt,
      durationMs: aiAgentTurn.durationMs,
      errorCode: aiAgentTurn.errorCode,
      id: aiAgentTurn.id,
      inputCharacterCount: aiAgentTurn.inputCharacterCount,
      inputMessageCount: aiAgentTurn.inputMessageCount,
      inputTokens: aiAgentTurn.inputTokens,
      outputTokens: aiAgentTurn.outputTokens,
      requestedModel: aiAgentTurn.requestedModel,
      startedAt: aiAgentTurn.startedAt,
      status: aiAgentTurn.status,
      stepCount: aiAgentTurn.stepCount,
      threadId: aiAgentTurn.threadId,
      toolCallCount: aiAgentTurn.toolCallCount,
      totalTokens: aiAgentTurn.totalTokens,
      userId: aiAgentTurn.userId,
    })
    .from(aiAgentTurn)
    .where(eq(aiAgentTurn.workspaceId, input.workspaceId))
    .orderBy(desc(aiAgentTurn.createdAt))
    .limit(Math.max(1, Math.min(input.limit ?? 50, 100)));
}

export async function listAiAgentToolExecutions(input: {
  turnId: string;
  workspaceId: string;
}) {
  return db
    .select({
      completedAt: aiAgentToolExecution.completedAt,
      durationMs: aiAgentToolExecution.durationMs,
      effect: aiAgentToolExecution.effect,
      errorCode: aiAgentToolExecution.errorCode,
      status: aiAgentToolExecution.status,
      stepNumber: aiAgentToolExecution.stepNumber,
      toolCallId: aiAgentToolExecution.toolCallId,
      toolName: aiAgentToolExecution.toolName,
    })
    .from(aiAgentToolExecution)
    .innerJoin(aiAgentTurn, eq(aiAgentTurn.id, aiAgentToolExecution.turnId))
    .where(
      and(
        eq(aiAgentToolExecution.turnId, input.turnId),
        eq(aiAgentTurn.workspaceId, input.workspaceId),
      ),
    )
    .orderBy(aiAgentToolExecution.createdAt);
}

export async function cleanupExpiredAiAgentData(
  env: RuntimeEnv,
  now = new Date(),
) {
  const limits = readAiAgentLimits(env);
  const storage = createImageStorage(env);
  const [uploads, artifacts] = await Promise.all([
    db
      .select({ id: aiChatUpload.id, objectKey: aiChatUpload.objectKey })
      .from(aiChatUpload)
      .where(and(lte(aiChatUpload.expiresAt, now), ne(aiChatUpload.status, "expired")))
      .limit(limits.cleanupBatchSize),
    db
      .select({ id: aiChatArtifact.id, objectKey: aiChatArtifact.objectKey })
      .from(aiChatArtifact)
      .where(and(lte(aiChatArtifact.expiresAt, now), ne(aiChatArtifact.status, "expired")))
      .limit(limits.cleanupBatchSize),
  ]);
  const deletedUploadIds = await deleteStoredObjects(storage, uploads);
  const deletedArtifactIds = await deleteStoredObjects(storage, artifacts);

  if (deletedUploadIds.length > 0) {
    await db
      .update(aiChatUpload)
      .set({
        extractedText: null,
        extraction: null,
        status: "expired",
        updatedAt: now,
      })
      .where(inArray(aiChatUpload.id, deletedUploadIds));
  }

  if (deletedArtifactIds.length > 0) {
    await db
      .update(aiChatArtifact)
      .set({ status: "expired", updatedAt: now })
      .where(inArray(aiChatArtifact.id, deletedArtifactIds));
  }

  const staleBefore = getAiAgentTurnStaleBefore(now, limits.turnTimeoutMs);
  await db
    .update(aiAgentTurn)
    .set({
      completedAt: now,
      errorCode: "stale_turn_timeout",
      status: "failed",
      updatedAt: now,
    })
    .where(and(eq(aiAgentTurn.status, "running"), lt(aiAgentTurn.startedAt, staleBefore)));
  await db
    .update(aiAgentActionReceipt)
    .set({
      completedAt: now,
      error: "Action execution timed out.",
      status: "failed",
      updatedAt: now,
    })
    .where(
      and(
        eq(aiAgentActionReceipt.status, "running"),
        lt(aiAgentActionReceipt.createdAt, staleBefore),
      ),
    );

  const retentionBefore = new Date(
    now.getTime() - limits.auditRetentionDays * DAY_MS,
  );
  await db
    .delete(aiAgentActionReceipt)
    .where(
      and(
        lt(aiAgentActionReceipt.createdAt, retentionBefore),
        ne(aiAgentActionReceipt.status, "running"),
      ),
    );
  await db
    .delete(aiAgentTurn)
    .where(
      and(
        lt(aiAgentTurn.createdAt, retentionBefore),
        notInArray(aiAgentTurn.status, ["running"]),
      ),
    );

  return {
    artifactsExpired: deletedArtifactIds.length,
    uploadsExpired: deletedUploadIds.length,
  };
}

export function normalizeAiAgentErrorCode(error: unknown) {
  if (error instanceof AiAgentOperationalLimitError) return error.code;
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  const message = error instanceof Error
    ? error.message.toLowerCase()
    : typeof error === "string"
      ? error.toLowerCase()
      : "";

  if (name === "aborterror" || message.includes("abort")) return "cancelled";
  if (message.includes("timeout") || message.includes("timed out")) return "provider_timeout";
  if (message.includes("rate limit") || message.includes("too many requests")) return "provider_rate_limited";
  if (message.includes("forbidden") || message.includes("permission")) return "permission_denied";
  if (message.includes("validation") || message.includes("invalid")) return "invalid_request";
  if (message.includes("not configured") || message.includes("unavailable")) return "capability_unavailable";
  return "provider_or_tool_failed";
}

export function getAiAgentToolEffect(
  toolName: string,
): "read" | "write" | "analysis" | "artifact" {
  return getAgentToolDescriptor(toolName)?.effect ?? "read";
}

function validateTurnInputMetrics(
  metrics: AiAgentTurnMetrics,
  limits: AiAgentLimits,
) {
  if (metrics.inputMessageCount > limits.maxInputMessages) {
    return operationalRejection(
      "input_message_limit_exceeded",
      `Ask AI accepts at most ${limits.maxInputMessages} messages in one turn.`,
      0,
    );
  }
  if (metrics.inputCharacterCount > limits.maxInputCharacters) {
    return operationalRejection(
      "input_character_limit_exceeded",
      "This conversation is too large for one Ask AI turn. Start a new chat or remove context.",
      0,
    );
  }
  if (metrics.attachmentCount > limits.maxFilesPerTurn) {
    return operationalRejection(
      "file_count_limit_exceeded",
      `Ask AI accepts at most ${limits.maxFilesPerTurn} files per turn.`,
      0,
    );
  }
  return null;
}

async function resolveTurnQuotaRejection(input: {
  limits: AiAgentLimits;
  now: Date;
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
  userId: string;
  workspaceId: string;
}) {
  const since = new Date(input.now.getTime() - DAY_MS);
  const countedStatuses = ["running", "succeeded", "failed", "cancelled"];
  const [userConcurrent, workspaceConcurrent, daily] = await Promise.all([
    input.tx
      .select({ value: count() })
      .from(aiAgentTurn)
      .where(
        and(
          eq(aiAgentTurn.workspaceId, input.workspaceId),
          eq(aiAgentTurn.userId, input.userId),
          eq(aiAgentTurn.status, "running"),
        ),
      ),
    input.tx
      .select({ value: count() })
      .from(aiAgentTurn)
      .where(
        and(
          eq(aiAgentTurn.workspaceId, input.workspaceId),
          eq(aiAgentTurn.status, "running"),
        ),
      ),
    input.tx
      .select({
        tokens: sql<number>`coalesce(sum(${aiAgentTurn.totalTokens}), 0)`,
        turns: count(),
      })
      .from(aiAgentTurn)
      .where(
        and(
          eq(aiAgentTurn.workspaceId, input.workspaceId),
          eq(aiAgentTurn.userId, input.userId),
          gte(aiAgentTurn.createdAt, since),
          inArray(aiAgentTurn.status, countedStatuses),
        ),
      ),
  ]);

  if (Number(userConcurrent[0]?.value ?? 0) >= input.limits.maxConcurrentTurnsPerUser) {
    return operationalRejection(
      "user_concurrency_exceeded",
      "You already have the maximum number of Ask AI turns running.",
      15,
    );
  }
  if (
    Number(workspaceConcurrent[0]?.value ?? 0) >=
      input.limits.maxConcurrentTurnsPerWorkspace
  ) {
    return operationalRejection(
      "workspace_concurrency_exceeded",
      "This workspace is currently at its Ask AI concurrency limit.",
      15,
    );
  }
  if (Number(daily[0]?.turns ?? 0) >= input.limits.maxTurnsPerUserPerDay) {
    return operationalRejection(
      "daily_turn_limit_exceeded",
      "Your Ask AI turn allowance for the last 24 hours has been reached.",
      3_600,
    );
  }
  if (Number(daily[0]?.tokens ?? 0) >= input.limits.maxTokensPerUserPerDay) {
    return operationalRejection(
      "daily_token_limit_exceeded",
      "Your Ask AI token allowance for the last 24 hours has been reached.",
      3_600,
    );
  }
  return null;
}

function operationalRejection(
  code: string,
  message: string,
  retryAfterSeconds: number,
) {
  return { code, message, retryAfterSeconds };
}

export function getAiAgentTurnStaleBefore(now: Date, turnTimeoutMs: number) {
  return new Date(now.getTime() - Math.max(1, turnTimeoutMs));
}

function readBoundedIntegerEnv(
  env: RuntimeEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const raw = getStringEnv(env, key);
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function safeSerializedLength(value: unknown) {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function normalizeUsage(value?: number) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function normalizeCount(value?: number) {
  return Number.isFinite(value) && Number(value) >= 0
    ? Math.min(Math.round(Number(value)), 2_000_000_000)
    : 0;
}

async function deleteStoredObjects(
  storage: ReturnType<typeof createImageStorage>,
  records: Array<{ id: string; objectKey: string }>,
) {
  const settled = await Promise.allSettled(
    records.map((record) => storage.delete(record.objectKey)),
  );
  return records.flatMap((record, index) =>
    settled[index]?.status === "fulfilled" ? [record.id] : [],
  );
}
