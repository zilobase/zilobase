import type { CustomAgentDefinition } from "@zilobase/features/ai-chat/custom-agent-contract";
import { and, desc, eq } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import {
  aiAgentConversation,
  aiAgentConversationMessage,
  aiAgentProfile,
  aiAgentRevision,
  aiAgentTrigger,
  automationSecret,
} from "../../../infrastructure/database/schema";
import {
  compileAgentDefinition,
  computeNextAgentSchedule,
  definitionForProfile,
  hashAgentDefinition,
  normalizeAgentDefinition,
} from "./agent-definition";
import {
  AgentProfileError,
  requireAgentProfileRole,
} from "./agent-profile-service";

export async function listAgentRevisions(input: {
  profileId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "user" });
  const rows = await db
    .select()
    .from(aiAgentRevision)
    .where(eq(aiAgentRevision.profileId, input.profileId))
    .orderBy(desc(aiAgentRevision.version));
  return rows.map(serializeRevision);
}

export async function applyAgentDefinition(input: {
  definition: CustomAgentDefinition;
  profileId: string;
  sourceMessageId?: string | null;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "editor" });
  const now = new Date();
  const revisionId = crypto.randomUUID();
  const definition = normalizeAgentDefinition(input.definition);
  await db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(aiAgentProfile)
      .where(
        and(
          eq(aiAgentProfile.id, input.profileId),
          eq(aiAgentProfile.workspaceId, input.workspaceId),
          eq(aiAgentProfile.status, "active"),
        ),
      )
      .limit(1)
      .for("update");
    if (!profile)
      throw new AgentProfileError("agent_not_found", "Agent not found.", 404);
    const nextVersion = profile.version + 1;
    await tx.insert(aiAgentRevision).values({
      compiledDefinition: compileAgentDefinition(definition),
      createdAt: now,
      createdByUserId: input.userId,
      definition,
      definitionHash: hashAgentDefinition(definition),
      id: revisionId,
      profileId: input.profileId,
      sourceMessageId: input.sourceMessageId ?? null,
      version: nextVersion,
    });
    await tx
      .update(aiAgentProfile)
      .set({
        cover: definition.cover,
        currentRevisionId: revisionId,
        defaultModel: definition.defaultModel,
        description: definition.description,
        icon: definition.icon,
        iconPosition: definition.iconPosition,
        instructions: definition.instructions,
        name: definition.name,
        updatedAt: now,
        version: nextVersion,
      })
      .where(eq(aiAgentProfile.id, input.profileId));
    await synchronizeMaterializedTriggers(
      tx,
      input.profileId,
      revisionId,
      definition.triggers,
      now,
    );
    if (input.sourceMessageId) {
      await tx
        .update(aiAgentConversationMessage)
        .set({ revisionId, updatedAt: now })
        .where(eq(aiAgentConversationMessage.id, input.sourceMessageId));
    }
  });
  return getAgentRevision(input.profileId, revisionId);
}

export async function synchronizeMaterializedTriggers(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  profileId: string,
  revisionId: string,
  desiredTriggers: CustomAgentDefinition["triggers"],
  now: Date,
) {
  const existing = await tx
    .select()
    .from(aiAgentTrigger)
    .where(eq(aiAgentTrigger.profileId, profileId));
  const desiredIds = new Set(desiredTriggers.map((trigger) => trigger.id));

  for (const trigger of existing) {
    if (desiredIds.has(trigger.id)) continue;
    if (trigger.webhookSecretId) {
      await tx
        .delete(automationSecret)
        .where(eq(automationSecret.id, trigger.webhookSecretId));
    }
    await tx.delete(aiAgentTrigger).where(eq(aiAgentTrigger.id, trigger.id));
  }

  const existingById = new Map(
    existing.map((trigger) => [trigger.id, trigger]),
  );
  for (const desired of desiredTriggers) {
    if (desired.kind === "manual") continue;
    const current = existingById.get(desired.id);
    const status = materializedTriggerStatus(desired, Boolean(current));
    const nextRunAt =
      desired.kind === "schedule" && status === "active"
        ? current?.kind === "schedule" && current.status === "active" && JSON.stringify(current.config) === JSON.stringify(desired.config)
          ? current.nextRunAt ?? computeNextAgentSchedule(desired.config, now)
          : computeNextAgentSchedule(desired.config, now)
        : null;
    if (current) {
      await tx
        .update(aiAgentTrigger)
        .set({
          config: desired.config,
          kind: desired.kind,
          label: desired.label,
          nextRunAt,
          revisionId,
          status,
          updatedAt: now,
        })
        .where(
          and(
            eq(aiAgentTrigger.id, desired.id),
            eq(aiAgentTrigger.profileId, profileId),
          ),
        );
    } else {
      await tx.insert(aiAgentTrigger).values({
        config: desired.config,
        createdAt: now,
        id: desired.id,
        kind: desired.kind,
        label: desired.label,
        nextRunAt,
        profileId,
        revisionId,
        status,
        updatedAt: now,
      });
    }
  }
}

function materializedTriggerStatus(
  desired: CustomAgentDefinition["triggers"][number],
  exists: boolean,
) {
  if (desired.kind === "connector" || desired.kind === "slack")
    return "degraded" as const;
  if (desired.kind === "webhook" && !exists) return "paused" as const;
  return desired.status;
}

export async function revertAgentRevision(input: {
  profileId: string;
  revisionId: string;
  userId: string;
  workspaceId: string;
}) {
  await requireAgentProfileRole({ ...input, minimum: "editor" });
  const [revision] = await db
    .select()
    .from(aiAgentRevision)
    .where(
      and(
        eq(aiAgentRevision.id, input.revisionId),
        eq(aiAgentRevision.profileId, input.profileId),
      ),
    )
    .limit(1);
  if (!revision)
    throw new AgentProfileError(
      "revision_not_found",
      "Agent revision not found.",
      404,
    );
  return applyAgentDefinition({
    ...input,
    definition: normalizeAgentDefinition(revision.definition),
    sourceMessageId: null,
  });
}

export async function ensureInitialAgentRevision(input: {
  profileId: string;
  userId: string;
}) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(aiAgentProfile)
      .where(eq(aiAgentProfile.id, input.profileId))
      .limit(1)
      .for("update");
    if (!profile)
      throw new AgentProfileError("agent_not_found", "Agent not found.", 404);
    if (profile.currentRevisionId) return profile.currentRevisionId;
    const revisionId = crypto.randomUUID();
    const definition = definitionForProfile(profile);
    await tx.insert(aiAgentRevision).values({
      compiledDefinition: compileAgentDefinition(definition),
      createdAt: now,
      createdByUserId: input.userId,
      definition,
      definitionHash: hashAgentDefinition(definition),
      id: revisionId,
      profileId: input.profileId,
      version: profile.version,
    });
    await tx
      .update(aiAgentProfile)
      .set({ currentRevisionId: revisionId, updatedAt: now })
      .where(eq(aiAgentProfile.id, input.profileId));
    await tx
      .insert(aiAgentConversation)
      .values({
        createdAt: now,
        id: crypto.randomUUID(),
        lastActivityAt: now,
        profileId: input.profileId,
        updatedAt: now,
      })
      .onConflictDoNothing();
    return revisionId;
  });
}

export async function getCurrentAgentRevision(profileId: string) {
  const [row] = await db
    .select({ revision: aiAgentRevision })
    .from(aiAgentProfile)
    .innerJoin(
      aiAgentRevision,
      eq(aiAgentRevision.id, aiAgentProfile.currentRevisionId),
    )
    .where(eq(aiAgentProfile.id, profileId))
    .limit(1);
  return row?.revision ?? null;
}

async function getAgentRevision(profileId: string, revisionId: string) {
  const [row] = await db
    .select()
    .from(aiAgentRevision)
    .where(
      and(
        eq(aiAgentRevision.profileId, profileId),
        eq(aiAgentRevision.id, revisionId),
      ),
    )
    .limit(1);
  if (!row)
    throw new AgentProfileError(
      "revision_not_found",
      "Agent revision not found.",
      404,
    );
  return serializeRevision(row);
}

function serializeRevision(row: typeof aiAgentRevision.$inferSelect) {
  return {
    agentId: row.profileId,
    createdAt: row.createdAt.toISOString(),
    createdByUserId: row.createdByUserId,
    definition: row.definition as CustomAgentDefinition,
    definitionHash: row.definitionHash,
    id: row.id,
    sourceMessageId: row.sourceMessageId,
    version: row.version,
  };
}
