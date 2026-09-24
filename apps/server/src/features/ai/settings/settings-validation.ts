import { allInstructionResources } from "./instruction-pages";
import { and, eq } from "drizzle-orm";
import { type AgentSettingsDefinition } from "@zilobase/features/ai-chat/settings-contract";

import { db } from "../../../infrastructure/database";
import {
  aiAgentTrigger,
  aiMcpConnection,
  aiMcpToolSnapshot,
  meeting,
} from "../../../infrastructure/database/schema";
import { canAccessPageInWorkspace, canAccessDatabaseInWorkspace } from "../../access";
import { AgentProfileError, validateAccessPrincipals } from "../agents/agent-profile-service";

import { type SettingsActor, settingsConnectionCondition } from "./settings-access";

export async function validateSettingsDefinition(a: SettingsActor, d: AgentSettingsDefinition) {
  if (a.scope !== "personal") {
    await validateAccessPrincipals(a.workspaceId, d.grants);
    await validateResourceGrants(a, d);
    for (const t of d.triggers) {
      await validateWebhookSecret(a, t);
      validateTriggerConfiguration(t);
      await validateTriggerResources(a, d, t);
    }
  }
  await validateConnectorPolicy(a, d);
  assertUniqueEntries(d);
}

async function validateResourceGrants(a: SettingsActor, d: AgentSettingsDefinition) {
  for (const r of allInstructionResources(d)) {
    const required = r.accessLevel === "view" ? "view" : "full";
    const allowed =
      r.resourceType === "page"
        ? await canAccessPageInWorkspace(r.resourceId, a.workspaceId, a.userId, required)
        : await canAccessDatabaseInWorkspace(r.resourceId, a.workspaceId, a.userId, required);
    if (!allowed)
      throw new AgentProfileError(
        "agent_resource_grant_forbidden",
        "You lack permission to grant this resource.",
        403,
      );
  }
}

async function validateWebhookSecret(
  a: SettingsActor,
  t: AgentSettingsDefinition["triggers"][number],
) {
  if (t.kind === "webhook" && t.status === "active") {
    const [existing] = await db
      .select()
      .from(aiAgentTrigger)
      .where(and(eq(aiAgentTrigger.id, t.id), eq(aiAgentTrigger.profileId, a.scope)));
    if (!existing?.webhookSecretId)
      throw new AgentProfileError(
        "webhook_secret_required",
        "Save the webhook paused, create its secret, then enable it and Save.",
      );
  }
}

function validateTriggerConfiguration(t: AgentSettingsDefinition["triggers"][number]) {
  if (
    t.kind === "schedule" &&
    t.config.cadence === "custom" &&
    (typeof t.config.intervalMinutes !== "number" ||
      !Number.isFinite(t.config.intervalMinutes) ||
      t.config.intervalMinutes < 5 ||
      t.config.intervalMinutes > 525600)
  )
    throw new AgentProfileError(
      "invalid_schedule",
      "Custom schedules require an interval of at least five minutes.",
    );
  if (
    t.kind === "schedule" &&
    !["daily", "weekly", "monthly", "yearly", "custom"].includes(String(t.config.cadence))
  )
    throw new AgentProfileError("invalid_schedule", "Choose a supported schedule cadence.");
  if (["connector", "slack"].includes(t.kind) && t.status === "active")
    throw new AgentProfileError(
      "trigger_adapter_required",
      "This trigger requires a supported event adapter.",
      409,
    );
  if (
    t.kind === "database" &&
    !["row_added", "row_removed", "property_changed"].includes(String(t.config.event))
  )
    throw new AgentProfileError("invalid_database_event", "Choose a supported database event.");
}

async function validateTriggerResources(
  a: SettingsActor,
  d: AgentSettingsDefinition,
  t: AgentSettingsDefinition["triggers"][number],
) {
  if (t.kind === "meeting") {
    const [record] = await db
      .select({ pageId: meeting.pageId })
      .from(meeting)
      .where(
        and(
          eq(meeting.id, String(t.config.meetingId ?? "")),
          eq(meeting.workspaceId, a.workspaceId),
        ),
      );
    if (
      !record ||
      !allInstructionResources(d).some(
        (r) => r.resourceType === "page" && r.resourceId === record.pageId,
      )
    )
      throw new AgentProfileError(
        "meeting_access_required",
        "Grant the meeting page in Access before saving.",
        409,
      );
  }
  const target =
    t.kind === "database"
      ? t.config.databaseId
      : ["comment", "mention"].includes(t.kind)
        ? t.config.pageId
        : null;
  if (
    ["database", "comment", "mention"].includes(t.kind) &&
    (!target ||
      !allInstructionResources(d).some(
        (r) =>
          r.resourceId === target &&
          r.resourceType === (t.kind === "database" ? "database" : "page"),
      ))
  )
    throw new AgentProfileError(
      "trigger_access_required",
      "Grant the trigger's resource in Access before saving.",
    );
}

async function validateConnectorPolicy(a: SettingsActor, d: AgentSettingsDefinition) {
  const connections = await db.select().from(aiMcpConnection).where(settingsConnectionCondition(a));
  let enabled = 0;
  for (const c of d.connectors) {
    const connection = connections.find((x) => x.id === c.connectionId);
    if (!connection)
      throw new AgentProfileError(
        "connector_unavailable",
        "A connector is no longer available in this scope.",
        409,
      );
    if (
      c.alwaysAllowEnabled !== connection.alwaysAllowEnabled &&
      connection.authenticatedByUserId !== a.userId
    )
      throw new AgentProfileError(
        "connector_authenticator_required",
        "Only the member who connected this account can change always-allow.",
        403,
      );
    const tools = await db
      .select()
      .from(aiMcpToolSnapshot)
      .where(eq(aiMcpToolSnapshot.connectionId, c.connectionId));
    for (const t of c.tools) {
      if (!tools.some((x) => x.id === t.toolId && (!t.enabled || x.available)))
        throw new AgentProfileError(
          "connector_tool_unavailable",
          "A selected connector tool is unavailable. Refresh its permissions.",
          409,
        );
      if (t.enabled) enabled++;
    }
  }
  if (enabled > 100)
    throw new AgentProfileError(
      "connector_tool_limit",
      "At most 100 connector tools may be enabled.",
      409,
    );
}

function assertUniqueEntries(d: AgentSettingsDefinition) {
  for (const list of [
    d.triggers.map((x) => x.id),
    d.resources.map((x) => `${x.resourceType}:${x.resourceId}`),
    d.grants.map((x) => `${x.principalType}:${x.principalId}`),
    d.connectors.map((x) => x.connectionId),
    ...d.connectors.map((x) => x.tools.map((t) => t.toolId)),
  ])
    if (new Set(list).size !== list.length)
      throw new AgentProfileError(
        "duplicate_settings",
        "Duplicate settings entries are not allowed.",
      );
}
