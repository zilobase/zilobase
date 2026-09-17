import type {
  CustomAgentTriggerDefinition,
  CustomAgentTriggerKind,
} from "@zilobase/features/ai-chat/custom-agent-contract";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import * as Y from "yjs";

import { db } from "../../../infrastructure/database";
import {
  aiAgentEventReceipt,
  aiAgentProfile,
  aiAgentRun,
  aiAgentTrigger,
  automationSecret,
  dataSource,
  database,
  meeting,
  page,
} from "../../../infrastructure/database/schema";
import { getStringEnv, type RuntimeEnv } from "../../../shared/config/config";
import { canAgentAccessDatabase, canAgentAccessPage } from "../../access";
import { encryptAutomationSecret } from "../../automations/actions/secret-crypto";
import { computeNextAgentSchedule, normalizeAgentDefinition } from "./agent-definition";
import { AgentProfileError, requireAgentProfileRole } from "./agent-profile-service";
import { applyAgentDefinition, getCurrentAgentRevision } from "./agent-revision-service";
import { enqueueAgentRun } from "../execution/agent-run-queue";

export async function listAgentTriggers(input: {
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "user" });
  return (await db.select().from(aiAgentTrigger)
    .where(eq(aiAgentTrigger.profileId, input.profileId))
    .orderBy(asc(aiAgentTrigger.createdAt))).map(serializeTrigger);
}

export async function upsertAgentTrigger(input: {
  config: Record<string, unknown>;
  env: RuntimeEnv;
  kind: CustomAgentTriggerKind;
  label: string;
  profileId: string;
  status?: "active" | "paused" | "degraded" | "disabled";
  triggerId?: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "editor" });
  const [profile] = await db.select({ currentRevisionId: aiAgentProfile.currentRevisionId })
    .from(aiAgentProfile).where(and(
      eq(aiAgentProfile.id, input.profileId),
      eq(aiAgentProfile.workspaceId, input.workspaceId),
      eq(aiAgentProfile.status, "active"),
    )).limit(1);
  if (!profile?.currentRevisionId) throw new AgentProfileError("agent_not_ready", "Agent has no active revision.", 409);
  if (input.kind === "connector") {
    throw new AgentProfileError("connector_event_adapter_required", "Connector triggers require an installed curated event adapter.", 409);
  }
  if (input.kind === "slack") {
    throw new AgentProfileError("slack_event_adapter_required", "Slack event triggers require an installed signed Slack event adapter.", 409);
  }
  if (
    input.kind === "schedule" &&
    input.config.cadence === "custom" &&
    (typeof input.config.intervalMinutes !== "number" ||
      !Number.isFinite(input.config.intervalMinutes) ||
      input.config.intervalMinutes < 5 ||
      input.config.intervalMinutes > 525_600)
  ) {
    throw new AgentProfileError("agent_schedule_invalid", "Custom schedules must use an interval from 5 to 525600 minutes.", 409);
  }
  await validateTriggerResourceAccess(input);
  const now = new Date();
  const id = input.triggerId ?? crypto.randomUUID();
  const existing = input.triggerId
    ? (await db.select().from(aiAgentTrigger).where(and(
        eq(aiAgentTrigger.id, input.triggerId),
        eq(aiAgentTrigger.profileId, input.profileId),
      )).limit(1))[0]
    : null;
  if (input.triggerId && !existing) throw new AgentProfileError("agent_trigger_not_found", "Agent trigger not found.", 404);
  const status: CustomAgentTriggerDefinition["status"] = input.status ??
    (existing?.status as CustomAgentTriggerDefinition["status"] | undefined) ?? "active";
  const currentRevision = await getCurrentAgentRevision(input.profileId);
  if (!currentRevision) throw new AgentProfileError("agent_not_ready", "Agent has no active revision.", 409);
  const currentDefinition = normalizeAgentDefinition(currentRevision.definition);
  const triggerDefinition = { config: input.config, id, kind: input.kind, label: input.label, status };
  await applyAgentDefinition({
    definition: {
      ...currentDefinition,
      triggers: [
        ...currentDefinition.triggers.filter((trigger) => trigger.id !== id),
        triggerDefinition,
      ],
    },
    profileId: input.profileId,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  return { triggers: await listAgentTriggers(input) };
}

export async function removeAgentTrigger(input: {
  profileId: string;
  triggerId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "editor" });
  const [trigger] = await db.select().from(aiAgentTrigger).where(and(
    eq(aiAgentTrigger.id, input.triggerId),
    eq(aiAgentTrigger.profileId, input.profileId),
  )).limit(1);
  if (!trigger) throw new AgentProfileError("agent_trigger_not_found", "Agent trigger not found.", 404);
  const currentRevision = await getCurrentAgentRevision(input.profileId);
  if (!currentRevision) throw new AgentProfileError("agent_not_ready", "Agent has no active revision.", 409);
  const currentDefinition = normalizeAgentDefinition(currentRevision.definition);
  await applyAgentDefinition({
    definition: {
      ...currentDefinition,
      triggers: currentDefinition.triggers.filter((item) => item.id !== input.triggerId),
    },
    profileId: input.profileId,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  return { triggers: await listAgentTriggers(input) };
}

export async function rotateAgentWebhookSecret(input: {
  env: RuntimeEnv;
  profileId: string;
  triggerId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "editor" });
  const [trigger] = await db.select().from(aiAgentTrigger).where(and(
    eq(aiAgentTrigger.id, input.triggerId),
    eq(aiAgentTrigger.profileId, input.profileId),
    eq(aiAgentTrigger.kind, "webhook"),
  )).limit(1);
  if (!trigger) throw new AgentProfileError("agent_webhook_not_found", "Webhook trigger not found.", 404);
  const secretId = crypto.randomUUID();
  const secret = randomSecret();
  const encrypted = await encryptAutomationSecret(input.env, secret, {
    ownerUserId: input.userId,
    purpose: "agent_inbound_webhook",
    secretId,
    workspaceId: input.workspaceId,
  });
  await db.transaction(async (tx) => {
    await tx.insert(automationSecret).values({
      ...encrypted,
      id: secretId,
      ownerUserId: input.userId,
      purpose: "agent_inbound_webhook",
      workspaceId: input.workspaceId,
    });
    await tx.update(aiAgentTrigger).set({ webhookSecretId: secretId, updatedAt: new Date() })
      .where(eq(aiAgentTrigger.id, trigger.id));
    if (trigger.webhookSecretId) {
      await tx.delete(automationSecret).where(eq(automationSecret.id, trigger.webhookSecretId));
    }
  });
  return { secret };
}

export async function acceptAgentEvent(input: {
  chainDepth?: number;
  env: RuntimeEnv;
  eventKey: string;
  payload: Record<string, unknown>;
  profileId: string;
  triggerId: string;
  workspaceId: string;
}) {
  const [record] = await db.select({ trigger: aiAgentTrigger }).from(aiAgentTrigger)
    .innerJoin(aiAgentProfile, eq(aiAgentProfile.id, aiAgentTrigger.profileId))
    .where(and(
      eq(aiAgentTrigger.id, input.triggerId),
      eq(aiAgentTrigger.profileId, input.profileId),
      eq(aiAgentTrigger.status, "active"),
      eq(aiAgentProfile.workspaceId, input.workspaceId),
      eq(aiAgentProfile.status, "active"),
    )).limit(1);
  const trigger = record?.trigger;
  if (!trigger) throw new AgentProfileError("agent_trigger_unavailable", "Agent trigger is unavailable.", 404);
  const receiptId = crypto.randomUUID();
  await db.insert(aiAgentEventReceipt).values({
    eventKey: input.eventKey,
    id: receiptId,
    profileId: input.profileId,
    receivedAt: new Date(),
    triggerId: input.triggerId,
    workspaceId: input.workspaceId,
  }).onConflictDoNothing();
  const [receipt] = await db.select().from(aiAgentEventReceipt).where(and(
    eq(aiAgentEventReceipt.profileId, input.profileId),
    eq(aiAgentEventReceipt.eventKey, input.eventKey),
  )).limit(1);
  if (!receipt) throw new Error("Unable to reserve agent event receipt.");
  if (receipt.runId) return { duplicate: true, run: null };
  const run = await enqueueAgentRun({
    chainDepth: input.chainDepth,
    env: input.env,
    input: { triggerPayload: input.payload },
    occurrenceKey: input.eventKey,
    profileId: input.profileId,
    revisionId: trigger.revisionId,
    triggerId: trigger.id,
    triggerKind: trigger.kind,
    workspaceId: input.workspaceId,
  });
  await db.update(aiAgentEventReceipt).set({ runId: run.id })
    .where(eq(aiAgentEventReceipt.id, receipt.id));
  return { duplicate: false, run };
}

export async function enqueueDueAgentSchedules(env: RuntimeEnv, now = new Date()) {
  const triggers = await db.select({ trigger: aiAgentTrigger, workspaceId: aiAgentProfile.workspaceId })
    .from(aiAgentTrigger)
    .innerJoin(aiAgentProfile, eq(aiAgentProfile.id, aiAgentTrigger.profileId))
    .where(and(
      eq(aiAgentTrigger.kind, "schedule"),
      eq(aiAgentTrigger.status, "active"),
      lte(aiAgentTrigger.nextRunAt, now),
      eq(aiAgentProfile.status, "active"),
    )).limit(100);
  for (const { trigger, workspaceId } of triggers) {
    const occurrenceKey = `schedule:${trigger.id}:${trigger.nextRunAt?.toISOString() ?? now.toISOString()}`;
    try {
      await acceptAgentEvent({
        env,
        eventKey: occurrenceKey,
        payload: { scheduledFor: trigger.nextRunAt?.toISOString() },
        profileId: trigger.profileId,
        triggerId: trigger.id,
        workspaceId,
      });
      await db.update(aiAgentTrigger).set({
        lastRunAt: now,
        nextRunAt: computeNextAgentSchedule(trigger.config as Record<string, unknown>, now),
        updatedAt: now,
      }).where(eq(aiAgentTrigger.id, trigger.id));
    } catch {
      await db.update(aiAgentTrigger).set({
        lastRunAt: now,
        nextRunAt: null,
        status: "degraded",
        updatedAt: now,
      }).where(eq(aiAgentTrigger.id, trigger.id));
    }
  }
  return triggers.length;
}

type DatabaseAgentMutationFact = {
  actorId?: string | null;
  changedValues: Array<{ after: unknown; before: unknown; propertyId: string }>;
  dataSourceId: string;
  pageId: string;
  rowAdded?: boolean;
  rowRemoved?: boolean;
  rowId: string;
  origin?: string;
};

export async function dispatchDatabaseAgentMutationFacts(
  env: RuntimeEnv,
  input: { eventKeyPrefix: string; facts: DatabaseAgentMutationFact[] },
) {
  if (!nativeAgentTriggersEnabled(env) || input.facts.length === 0) return { accepted: 0 };
  const sourceIds = [...new Set(input.facts.map((fact) => fact.dataSourceId))];
  const sources = await db.select({
    dataSourceId: dataSource.id,
    databaseId: dataSource.parentDatabaseId,
    workspaceId: database.workspaceId,
  }).from(dataSource)
    .innerJoin(database, eq(database.id, dataSource.parentDatabaseId))
    .where(inArray(dataSource.id, sourceIds));
  const sourceById = new Map(sources.map((source) => [source.dataSourceId, source]));
  let accepted = 0;
  for (const [index, fact] of input.facts.entries()) {
    const source = sourceById.get(fact.dataSourceId);
    if (!source) continue;
    const candidates = await activeTriggersForWorkspace(source.workspaceId, "database");
    const origin = await readOriginatingAgentRun(fact);
    for (const candidate of candidates) {
      const config = candidate.trigger.config as Record<string, unknown>;
      const configuredDatabaseId = stringValue(config.databaseId);
      if (configuredDatabaseId && configuredDatabaseId !== source.databaseId && configuredDatabaseId !== fact.dataSourceId) continue;
      if (!(await canAgentAccessDatabase(source.databaseId, source.workspaceId, candidate.trigger.profileId, "view"))) continue;
      const event = fact.rowRemoved ? "row_removed" : fact.rowAdded ? "row_added" : "property_changed";
      if (stringValue(config.event) && config.event !== event) continue;
      const propertyId = stringValue(config.propertyId);
      if (event === "property_changed" && propertyId && !fact.changedValues.some((value) => value.propertyId === propertyId)) continue;
      if (origin?.profileId === candidate.trigger.profileId) continue;
      const result = await safelyAcceptAgentEvent({
        chainDepth: origin ? origin.chainDepth + 1 : 0,
        env,
        eventKey: `${input.eventKeyPrefix}:${index}:${candidate.trigger.id}`,
        payload: {
          changedValues: fact.changedValues.slice(0, 100),
          dataSourceId: fact.dataSourceId,
          databaseId: source.databaseId,
          event,
          pageId: fact.pageId,
          rowId: fact.rowId,
        },
        profileId: candidate.trigger.profileId,
        triggerId: candidate.trigger.id,
        workspaceId: source.workspaceId,
      });
      if (result) accepted += 1;
    }
  }
  return { accepted };
}

export async function dispatchPageCommentAgentTriggers(
  env: RuntimeEnv,
  input: { nextState: Uint8Array; pageId: string; previousState?: Uint8Array | null },
) {
  if (!nativeAgentTriggersEnabled(env)) return { accepted: 0 };
  const [pageRecord] = await db.select({ workspaceId: page.workspaceId }).from(page)
    .where(eq(page.id, input.pageId)).limit(1);
  if (!pageRecord) return { accepted: 0 };
  const previousIds = new Set(readPageComments(input.previousState ?? new Uint8Array()).map((comment) => comment.id));
  const comments = readPageComments(input.nextState).filter((comment) => !previousIds.has(comment.id));
  if (comments.length === 0) return { accepted: 0 };
  const candidates = await db.select({ name: aiAgentProfile.name, trigger: aiAgentTrigger })
    .from(aiAgentTrigger)
    .innerJoin(aiAgentProfile, eq(aiAgentProfile.id, aiAgentTrigger.profileId))
    .where(and(
      eq(aiAgentProfile.workspaceId, pageRecord.workspaceId),
      eq(aiAgentProfile.status, "active"),
      eq(aiAgentTrigger.status, "active"),
    ));
  let accepted = 0;
  for (const comment of comments) {
    for (const candidate of candidates) {
      if (candidate.trigger.kind !== "comment" && candidate.trigger.kind !== "mention") continue;
      const config = candidate.trigger.config as Record<string, unknown>;
      const configuredPageId = stringValue(config.pageId);
      if (configuredPageId && configuredPageId !== input.pageId) continue;
      if (candidate.trigger.kind === "mention" && !mentionsAgent(comment.body, candidate.name)) continue;
      if (comment.authorId === candidate.trigger.profileId) continue;
      if (!(await canAgentAccessPage(input.pageId, pageRecord.workspaceId, candidate.trigger.profileId, "view"))) continue;
      const result = await safelyAcceptAgentEvent({
        env,
        eventKey: `page-comment:${input.pageId}:${comment.id}:${candidate.trigger.id}`,
        payload: { authorId: comment.authorId, body: comment.body.slice(0, 4_000), commentId: comment.id, pageId: input.pageId },
        profileId: candidate.trigger.profileId,
        triggerId: candidate.trigger.id,
        workspaceId: pageRecord.workspaceId,
      });
      if (result) accepted += 1;
    }
  }
  return { accepted };
}

async function readOriginatingAgentRun(fact: DatabaseAgentMutationFact) {
  if (fact.origin !== "ai" || !fact.actorId) return null;
  const match = fact.actorId.match(/^agent:([^:]+):run:([^:]+)$/);
  if (!match) return null;
  const [run] = await db.select({ chainDepth: aiAgentRun.chainDepth, profileId: aiAgentRun.profileId })
    .from(aiAgentRun).where(and(eq(aiAgentRun.id, match[2]!), eq(aiAgentRun.profileId, match[1]!))).limit(1);
  return run ?? null;
}

export async function dispatchMeetingCompletedAgentTriggers(
  env: RuntimeEnv,
  input: { meetingId: string; occurrenceKey: string },
) {
  if (!nativeAgentTriggersEnabled(env)) return { accepted: 0 };
  const [record] = await db.select({ pageId: meeting.pageId, workspaceId: meeting.workspaceId })
    .from(meeting).where(eq(meeting.id, input.meetingId)).limit(1);
  if (!record) return { accepted: 0 };
  const candidates = await activeTriggersForWorkspace(record.workspaceId, "meeting");
  let accepted = 0;
  for (const candidate of candidates) {
    const configuredMeetingId = stringValue((candidate.trigger.config as Record<string, unknown>).meetingId);
    if (configuredMeetingId && configuredMeetingId !== input.meetingId) continue;
    if (!(await canAgentAccessPage(record.pageId, record.workspaceId, candidate.trigger.profileId, "view"))) continue;
    const result = await safelyAcceptAgentEvent({
      env,
      eventKey: `meeting-completed:${input.meetingId}:${input.occurrenceKey}:${candidate.trigger.id}`,
      payload: { meetingId: input.meetingId, pageId: record.pageId },
      profileId: candidate.trigger.profileId,
      triggerId: candidate.trigger.id,
      workspaceId: record.workspaceId,
    });
    if (result) accepted += 1;
  }
  return { accepted };
}

async function validateTriggerResourceAccess(input: {
  config: Record<string, unknown>;
  kind: CustomAgentTriggerKind;
  profileId: string;
  workspaceId: string;
}) {
  if (input.kind === "database") {
    const databaseId = stringValue(input.config.databaseId);
    if (!databaseId || !(await canAgentAccessDatabase(databaseId, input.workspaceId, input.profileId, "view"))) {
      throw new AgentProfileError("agent_trigger_resource_not_granted", "Grant this database to the agent before adding its trigger.", 409);
    }
  }
  if (input.kind === "comment" || input.kind === "mention") {
    const pageId = stringValue(input.config.pageId);
    if (!pageId || !(await canAgentAccessPage(pageId, input.workspaceId, input.profileId, "view"))) {
      throw new AgentProfileError("agent_trigger_resource_not_granted", "Grant this page to the agent before adding its trigger.", 409);
    }
  }
  if (input.kind === "meeting") {
    const meetingId = stringValue(input.config.meetingId);
    const [record] = meetingId
      ? await db.select({ pageId: meeting.pageId }).from(meeting).where(and(eq(meeting.id, meetingId), eq(meeting.workspaceId, input.workspaceId))).limit(1)
      : [];
    if (!record || !(await canAgentAccessPage(record.pageId, input.workspaceId, input.profileId, "view"))) {
      throw new AgentProfileError("agent_trigger_resource_not_granted", "Grant the meeting page to the agent before adding its trigger.", 409);
    }
  }
}

function activeTriggersForWorkspace(workspaceId: string, kind: CustomAgentTriggerKind) {
  return db.select({ trigger: aiAgentTrigger }).from(aiAgentTrigger)
    .innerJoin(aiAgentProfile, eq(aiAgentProfile.id, aiAgentTrigger.profileId))
    .where(and(
      eq(aiAgentProfile.workspaceId, workspaceId),
      eq(aiAgentProfile.status, "active"),
      eq(aiAgentTrigger.kind, kind),
      eq(aiAgentTrigger.status, "active"),
    ));
}

async function safelyAcceptAgentEvent(input: Parameters<typeof acceptAgentEvent>[0]) {
  try {
    const result = await acceptAgentEvent(input);
    return result.duplicate ? null : result;
  } catch {
    return null;
  }
}

function nativeAgentTriggersEnabled(env: RuntimeEnv) {
  return getStringEnv(env, "AI_CUSTOM_AGENTS_ENABLED") === "true" &&
    getStringEnv(env, "AI_CUSTOM_AGENT_TRIGGERS_ENABLED") === "true";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mentionsAgent(body: string, name: string) {
  const normalized = body.toLocaleLowerCase();
  return normalized.includes(`@${name.trim().toLocaleLowerCase()}`);
}

function readPageComments(state: Uint8Array) {
  if (state.length === 0) return [];
  try {
    const document = new Y.Doc();
    Y.applyUpdate(document, state);
    const threads = document.getMap<Y.Map<unknown>>("commentThreads");
    return [...threads.entries()].flatMap(([threadId, thread]) => {
      if (!(thread instanceof Y.Map)) return [];
      const messages = thread.get("messages");
      if (!(messages instanceof Y.Map)) return [];
      return [...messages.entries()].flatMap(([messageId, value]) => {
        if (!(value instanceof Y.Map)) return [];
        const author = value.get("author");
        const authorId = author instanceof Y.Map
          ? stringValue(author.get("id"))
          : author && typeof author === "object" && !Array.isArray(author)
            ? stringValue((author as Record<string, unknown>).id)
            : null;
        const rawBody = value.get("body");
        const body = rawBody instanceof Y.Text ? rawBody.toString() : stringValue(rawBody) ?? "";
        return [{ authorId, body, id: `${threadId}:${messageId}` }];
      });
    });
  } catch {
    return [];
  }
}

function serializeTrigger(row: typeof aiAgentTrigger.$inferSelect) {
  return {
    config: row.config as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    kind: row.kind,
    label: row.label,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    revisionId: row.revisionId,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
