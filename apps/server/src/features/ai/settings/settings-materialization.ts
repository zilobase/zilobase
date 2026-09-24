import { allInstructionResources } from "./instruction-pages";
import { and, eq, inArray } from "drizzle-orm";
import { type AgentSettingsDefinition } from "@zilobase/features/ai-chat/settings-contract";

import {
  aiAgentProfile,
  aiAgentRevision,
  aiAgentProfileAccess,
  aiMcpConnection,
  aiMcpToolSnapshot,
  pageAccess,
  databaseAccess,
} from "../../../infrastructure/database/schema";

import { synchronizeMaterializedTriggers } from "../agents/agent-revision-service";
import { hashAgentDefinition } from "../agents/agent-definition";

import { type SettingsTransaction, settingsConflict } from "./settings-versioning";
import { type SettingsActor, settingsConnectionCondition } from "./settings-access";

export async function materializeSettings(
  tx: SettingsTransaction,
  a: SettingsActor,
  d: AgentSettingsDefinition,
  baseVersion: number,
  version: number,
) {
  const now = new Date();
  if (a.scope !== "personal") {
    const [profile] = await tx
      .select()
      .from(aiAgentProfile)
      .where(eq(aiAgentProfile.id, a.scope))
      .for("update");
    if (profile?.version !== baseVersion) throw settingsConflict();
    const revisionId = crypto.randomUUID();
    const [previousRevision] = profile.currentRevisionId
      ? await tx
          .select()
          .from(aiAgentRevision)
          .where(eq(aiAgentRevision.id, profile.currentRevisionId))
      : [];
    const definition = {
      ...d,
      defaultModel: "auto",
      safeExecutionPreferences:
        (
          previousRevision?.definition as
            | { safeExecutionPreferences?: Record<string, unknown> }
            | undefined
        )?.safeExecutionPreferences ?? {},
    };
    await tx.insert(aiAgentRevision).values({
      id: revisionId,
      profileId: a.scope,
      version,
      definition,
      compiledDefinition: {
        ...definition,
        systemInstructions: d.instructions,
      },
      definitionHash: hashAgentDefinition(definition),
      createdByUserId: a.userId,
    });
    await tx
      .update(aiAgentProfile)
      .set({
        name: d.name,
        description: d.description,
        icon: d.icon,
        cover: d.cover,
        iconPosition: d.iconPosition,
        instructions: d.instructions,
        defaultModel: "auto",
        version,
        currentRevisionId: revisionId,
        updatedAt: now,
      })
      .where(eq(aiAgentProfile.id, a.scope));
    await synchronizeMaterializedTriggers(tx, a.scope, revisionId, d.triggers, now);
    await tx.delete(aiAgentProfileAccess).where(eq(aiAgentProfileAccess.profileId, a.scope));
    if (d.grants.length)
      await tx.insert(aiAgentProfileAccess).values(
        d.grants.map((g) => ({
          ...g,
          id: crypto.randomUUID(),
          profileId: a.scope,
          createdByUserId: a.userId,
        })),
      );
    await tx
      .delete(pageAccess)
      .where(
        and(
          eq(pageAccess.workspaceId, a.workspaceId),
          eq(pageAccess.targetType, "agent"),
          eq(pageAccess.targetId, a.scope),
        ),
      );
    await tx
      .delete(databaseAccess)
      .where(
        and(
          eq(databaseAccess.workspaceId, a.workspaceId),
          eq(databaseAccess.targetType, "agent"),
          eq(databaseAccess.targetId, a.scope),
        ),
      );
    for (const r of allInstructionResources(d)) {
      const common = {
        id: crypto.randomUUID(),
        targetType: "agent",
        targetId: a.scope,
        accessLevel: r.accessLevel,
        workspaceId: a.workspaceId,
      };
      if (r.resourceType === "page")
        await tx.insert(pageAccess).values({ ...common, pageId: r.resourceId });
      else await tx.insert(databaseAccess).values({ ...common, databaseId: r.resourceId });
    }
  }
  const connections = await tx
    .select()
    .from(aiMcpConnection)
    .where(settingsConnectionCondition(a))
    .for("update");
  if (connections.length)
    await tx
      .update(aiMcpToolSnapshot)
      .set({ enabled: false, updatedAt: now })
      .where(
        inArray(
          aiMcpToolSnapshot.connectionId,
          connections.map((c) => c.id),
        ),
      );
  for (const c of d.connectors) {
    await tx
      .update(aiMcpConnection)
      .set({ alwaysAllowEnabled: c.alwaysAllowEnabled, updatedAt: now })
      .where(and(eq(aiMcpConnection.id, c.connectionId), settingsConnectionCondition(a)));
    for (const t of c.tools)
      await tx
        .update(aiMcpToolSnapshot)
        .set({
          enabled: t.enabled,
          classification: t.classification,
          executionMode: t.executionMode,
          updatedAt: now,
        })
        .where(
          and(
            eq(aiMcpToolSnapshot.id, t.toolId),
            eq(aiMcpToolSnapshot.connectionId, c.connectionId),
          ),
        );
  }
}
