import { and, eq } from "drizzle-orm";
import {
  emptySettingsDefinition,
  settingsDefinitionSchema,
  type AgentSettingsDefinition,
} from "@zilobase/features/ai-chat/settings-contract";

import { db } from "../../../infrastructure/database";
import {
  aiMcpConnection,
  aiMcpToolSnapshot,
  aiSettings,
  aiSettingsVersion,
} from "../../../infrastructure/database/schema";
import { AgentProfileError } from "../agents/agent-profile-service";
import {
  type SettingsActor,
  settingsConnectionCondition,
  settingsScopeKey,
} from "./settings-access";

async function newPersonalDefinition(
  actor: SettingsActor,
): Promise<AgentSettingsDefinition> {
  const definition = emptySettingsDefinition();
  const connections = await db
    .select()
    .from(aiMcpConnection)
    .where(settingsConnectionCondition(actor));
  for (const connection of connections) {
    const tools = await db
      .select()
      .from(aiMcpToolSnapshot)
      .where(eq(aiMcpToolSnapshot.connectionId, connection.id));
    definition.connectors.push({
      connectionId: connection.id,
      alwaysAllowEnabled: connection.alwaysAllowEnabled,
      tools: tools.map(({ id, enabled, classification, executionMode }) => ({
        toolId: id,
        enabled,
        classification,
        executionMode,
      })) as AgentSettingsDefinition["connectors"][number]["tools"],
    });
  }
  return settingsDefinitionSchema.parse(definition);
}

export async function getSettingsRecord(actor: SettingsActor) {
  const where = and(
    eq(aiSettings.workspaceId, actor.workspaceId),
    eq(aiSettings.scope, settingsScopeKey(actor)),
  );
  const [existing] = await db.select().from(aiSettings).where(where);
  if (existing) return existing;
  if (actor.scope !== "personal") {
    throw new AgentProfileError(
      "agent_settings_missing",
      "The agent settings record is missing.",
      409,
    );
  }

  const definition = await newPersonalDefinition(actor);
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(aiSettings)
      .values({
        id: crypto.randomUUID(),
        workspaceId: actor.workspaceId,
        scope: settingsScopeKey(actor),
        definition,
        version: 1,
      })
      .onConflictDoNothing()
      .returning();
    if (created) {
      await tx.insert(aiSettingsVersion).values({
        id: crypto.randomUUID(),
        settingsId: created.id,
        definition,
        version: 1,
        createdByUserId: actor.userId,
      });
    }
  });
  return (await db.select().from(aiSettings).where(where))[0]!;
}
