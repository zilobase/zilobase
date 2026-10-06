import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../infrastructure/database";
import * as t from "../infrastructure/database/schema";
import {
  backgroundTransaction,
  persistBackgroundTasks,
} from "../infrastructure/background/publication";
import { createBackgroundTask } from "../infrastructure/background/contracts";
import { recordBackgroundExhaustion } from "../app/background/failures";
import { replayBackgroundFailure } from "../app/background/operations/replay";
export async function seedCutoverAcceptance(env: Record<string, unknown>) {
  const old = new Date(0);
  await db.insert(t.member).values({
    id: "cutover-member",
    organizationId: "workspace",
    userId: "operator-owner",
    role: "owner",
  });
  await db.insert(t.database).values({
    id: "cutover-host",
    workspaceId: "workspace",
    createdById: "operator-owner",
    name: "Retained host",
    config: {},
  });
  await db.insert(t.dataSource).values({
    id: "cutover-source",
    workspaceId: "workspace",
    parentDatabaseId: "cutover-host",
    name: "Retained source",
    createdById: "operator-owner",
  });
  await backgroundTransaction(
    env,
    async () => {
      const definition = {
        definitionVersion: 1,
        scope: { type: "data_source" },
        timezone: "UTC",
        trigger: {
          kind: "schedule",
          schedule: {
            frequency: "daily",
            interval: 1,
            localTime: "09:00",
            startDate: "2026-01-01",
            timezone: "UTC",
          },
        },
        actions: [{ id: "add", type: "add_page", dataSourceId: "cutover-source", operations: [] }],
      };
      await db.insert(t.databaseAutomation).values({
        id: "cutover-automation",
        workspaceId: "workspace",
        dataSourceId: "cutover-source",
        name: "Retain configuration",
        currentRevisionId: "cutover-revision",
        createIdempotencyKey: "cutover",
        nextRunAt: old,
      });
      await db.insert(t.databaseAutomationRevision).values({
        id: "cutover-revision",
        automationId: "cutover-automation",
        version: 1,
        definitionVersion: 1,
        definition,
        compiledDefinition: definition,
        definitionHash: "retained",
      });
      await db.insert(t.databaseAutomationRun).values({
        id: "cutover-run",
        automationId: "cutover-automation",
        revisionId: "cutover-revision",
        workspaceId: "workspace",
        dataSourceId: "cutover-source",
        scheduledFor: old,
        triggerTime: old,
        definitionHash: "retained",
      });
      await db.insert(t.databaseAutomationStepRun).values({
        id: "cutover-step",
        runId: "cutover-run",
        actionId: "add",
        actionIndex: 0,
        idempotencyKey: "cutover-step",
        status: "running",
      });
      await db.insert(t.databaseAutomationEventWindow).values({
        id: "cutover-window",
        workspaceId: "workspace",
        dataSourceId: "cutover-source",
        rowId: "old-row",
        pageId: "old-page",
        openedAt: old,
        closesAt: old,
        lastFactAt: old,
        nextAttemptAt: old,
      });
    },
    { publishAfterCommit: false },
  );
  await db.insert(t.aiAgentProfile).values({
    id: "cutover-agent",
    workspaceId: "workspace",
    ownerUserId: "operator-owner",
    name: "Retain agent",
  });
  await db.insert(t.aiAgentRevision).values({
    id: "cutover-agent-revision",
    profileId: "cutover-agent",
    version: 1,
    definition: {},
    compiledDefinition: {},
    definitionHash: "retained",
  });
  await db.insert(t.aiAgentRun).values(
    ["cutover-agent-run", "uncertain-agent-run"].map((id) => ({
      id,
      workspaceId: "workspace",
      profileId: "cutover-agent",
      revisionId: "cutover-agent-revision",
      triggerKind: "manual",
      status: id === "cutover-agent-run" ? "waiting_approval" : "running",
      leaseExpiresAt: old,
    })),
  );
  await db.insert(t.aiAgentPendingAction).values({
    id: "cutover-approval",
    workspaceId: "workspace",
    userId: "operator-owner",
    agentRunId: "cutover-agent-run",
    toolCallId: "call",
    toolName: "write",
    toolVersion: 1,
    toolInput: {},
    inputHash: "hash",
    expiresAt: new Date(Date.now() + 60_000),
  });
  await db.insert(t.aiAgentTrigger).values({
    id: "cutover-trigger",
    revisionId: "cutover-agent-revision",
    profileId: "cutover-agent",
    kind: "schedule",
    label: "Daily",
    config: { cadence: "daily" },
    nextRunAt: old,
  });
  await db.insert(t.aiAgentToolExecution).values({
    id: "uncertain-write",
    agentRunId: "uncertain-agent-run",
    toolCallId: "write-call",
    toolName: "write",
    effect: "write",
    status: "failed",
    outcomeUnknown: true,
  });
  const uncertain = createBackgroundTask({
    env,
    kind: "agent.run",
    resourceId: "uncertain-agent-run",
  });
  await persistBackgroundTasks(env, [uncertain]);
  await recordBackgroundExhaustion(env, uncertain, "automation");
  await assert.rejects(replayBackgroundFailure(env, uncertain.taskId), /INELIGIBLE|UNCERTAIN/);
  await db.insert(t.calendarAccount).values({
    id: "cutover-account",
    userId: "operator-owner",
    googleSubject: "cutover",
    email: "retained@fixture.invalid",
    secret: { ciphertext: "retained", iv: "retained", keyVersion: "v1" },
    scopes: ["retained"],
  });
  await db.insert(t.calendarBinding).values({
    id: "cutover-binding",
    userId: "operator-owner",
    workspaceId: "workspace",
    accountId: "cutover-account",
  });
  await db.insert(t.calendarProviderCalendar).values({
    accountId: "cutover-account",
    calendarId: "primary",
    data: {
      id: "primary",
      bindingId: "cutover-binding",
      name: "Calendar",
      timeZone: "UTC",
      primary: true,
      colorId: null,
      defaultReminders: [],
      permissions: { read: true, write: true, owner: true, freeBusyOnly: false },
    },
    dirtyAt: old,
    pageToken: "abandoned-page",
    syncToken: "abandoned-sync",
    leaseId: "old-owner",
    leaseExpiresAt: old,
  });
  await db.insert(t.databaseMutationEvent).values({
    id: "cutover-journal",
    commandId: "committed",
    databaseId: "cutover-host",
    actorId: "operator-owner",
    version: 1,
    areas: ["records"],
    changes: {},
    committedAt: old,
  });
  await db
    .insert(t.databaseRealtimeOutbox)
    .values({ id: "cutover-outbox", eventId: "cutover-journal" });
}
export async function assertCutoverAcceptance(cutoff: Date) {
  assert.equal(
    (await db.select().from(t.aiAgentRun).where(eq(t.aiAgentRun.id, "cutover-agent-run")))[0]
      .status,
    "cancelled",
  );
  assert.equal(
    (
      await db
        .select()
        .from(t.aiAgentPendingAction)
        .where(eq(t.aiAgentPendingAction.id, "cutover-approval"))
    )[0].status,
    "rejected",
  );
  assert.equal(
    (
      await db
        .select()
        .from(t.databaseAutomationRun)
        .where(eq(t.databaseAutomationRun.id, "cutover-run"))
    )[0].status,
    "cancelled",
  );
  assert.equal(
    (
      await db
        .select()
        .from(t.databaseAutomationStepRun)
        .where(eq(t.databaseAutomationStepRun.id, "cutover-step"))
    )[0].status,
    "skipped",
  );
  assert.equal(
    (
      await db
        .select()
        .from(t.databaseAutomationEventWindow)
        .where(eq(t.databaseAutomationEventWindow.id, "cutover-window"))
    )[0].status,
    "discarded",
  );
  assert.ok(
    (
      await db
        .select()
        .from(t.databaseAutomation)
        .where(eq(t.databaseAutomation.id, "cutover-automation"))
    )[0].nextRunAt! > cutoff,
  );
  assert.ok(
    (await db.select().from(t.aiAgentTrigger).where(eq(t.aiAgentTrigger.id, "cutover-trigger")))[0]
      .nextRunAt! > cutoff,
  );
  const [calendar] = await db
    .select()
    .from(t.calendarProviderCalendar)
    .where(eq(t.calendarProviderCalendar.accountId, "cutover-account"));
  assert.equal(calendar.pageToken, null);
  assert.equal(calendar.syncToken, null);
  assert.equal(calendar.leaseId, null);
  assert.ok(calendar.dirtyAt! > cutoff);
  assert.equal(
    (
      await db.select().from(t.calendarAccount).where(eq(t.calendarAccount.id, "cutover-account"))
    )[0].secret.ciphertext,
    "retained",
  );
  assert.equal(
    (
      await db
        .select()
        .from(t.databaseMutationEvent)
        .where(eq(t.databaseMutationEvent.id, "cutover-journal"))
    ).length,
    1,
  );
  assert.equal(
    (
      await db
        .select()
        .from(t.databaseRealtimeOutbox)
        .where(eq(t.databaseRealtimeOutbox.id, "cutover-outbox"))
    ).length,
    0,
  );
  assert.equal(
    (
      await db
        .select()
        .from(t.aiAgentRevision)
        .where(eq(t.aiAgentRevision.id, "cutover-agent-revision"))
    )[0].definitionHash,
    "retained",
  );
}
