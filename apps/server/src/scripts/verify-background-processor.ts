/** Real SQL/BullMQ and production processor; only external provider HTTP is a fixture. */
import assert from "node:assert/strict";
import { fork, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { createNodeQueueRuntime } from "@zilobase/runtime-adapter/node";
import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { createDbClient, runWithDbEnv, db } from "../infrastructure/database";
import * as tables from "../infrastructure/database/schema";
import {
  BACKGROUND_LANE_POLICY,
  createBackgroundTaskV2,
  decodeBackgroundTaskV2,
} from "../infrastructure/background/task-v2";
import { backgroundTaskLane } from "../infrastructure/background/contracts";
import {
  backgroundTransaction,
  persistBackgroundTasks,
  publishBackgroundDispatches,
} from "../infrastructure/background/publication";
import {
  deliverBackgroundTask,
  recordBackgroundExhaustion,
} from "../app/background/runtime-delivery";
import { enqueueAiJob } from "../features/ai/jobs/ai-jobs";
import { encryptCalendarSecret } from "../features/calendar/provider/credentials";

const connection = process.env.ZILOBASE_BACKGROUND_VERIFY_URL!;
assert.equal(new URL(connection).pathname, "/zilobase_background_verify");
assert.equal(new URL(connection).hostname, "127.0.0.1");
const cell = "processor-fixture";
const key = Buffer.alloc(32, 7).toString("base64");
const env = {
  DATABASE_URL: connection,
  QUEUE_REDIS_URL: process.env.ZILOBASE_QUEUE_VERIFY_URL!,
  ZILOBASE_CELL_ID: cell,
  AI_CUSTOM_AGENTS_ENABLED: "true",
  DATABASE_AUTOMATIONS_ENABLED: "true",
  OPENAI_API_KEY: "fixture-no-external-calls",
  MCP_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({
    activeVersion: "fixture",
    keys: { fixture: key },
  }),
  CALENDAR_TOKEN_ENCRYPTION_KEY: key,
  CALENDAR_GOOGLE_CLIENT_ID: "fixture",
  CALENDAR_GOOGLE_CLIENT_SECRET: "fixture",
};
const channels: string[] = [];
let calendarCalls = 0,
  modelCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const target = new URL(input instanceof Request ? input.url : String(input));
  if (target.hostname === "oauth2.googleapis.com")
    return Response.json({ access_token: "fixture" });
  if (target.hostname === "www.googleapis.com" && target.pathname.includes("/events")) {
    calendarCalls++;
    return Response.json({
      items: [
        {
          id: `event-${calendarCalls}`,
          start: { date: "2026-10-06" },
          end: { date: "2026-10-07" },
        },
      ],
      ...(calendarCalls === 1
        ? { nextPageToken: "second" }
        : { nextSyncToken: "final-checkpoint" }),
    });
  }
  if (target.hostname === "api.openai.com" && target.pathname.endsWith("/responses")) {
    modelCalls++;
    return Response.json({
      id: `resp-${modelCalls}`,
      model: JSON.parse(String(init?.body)).model,
      created_at: Math.floor(Date.now() / 1000),
      output: [
        {
          id: "message",
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Queue fixture result", annotations: [] }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  }
  throw new Error(
    `Fixture refuses unexpected external request: ${target.origin}${target.pathname}`,
  );
};
let runtime: ReturnType<typeof createNodeQueueRuntime>;
const ports = {
  jobs: { dispatch: (tasks: Parameters<typeof runtime.dispatch>[0]) => runtime.dispatch(tasks) },
  fanout: {
    subscribe: async () => () => {},
    publish: async (channel: string) => {
      channels.push(channel);
    },
  },
};
const scoped = <T>(work: () => Promise<T>) =>
  runWithRuntimePorts(ports, () => runWithDbEnv(env, work));
const callbacks = {
  validate: (body: unknown) => decodeBackgroundTaskV2(body, cell),
  lane: (task: { kind: string }) => backgroundTaskLane(task.kind as never),
  policy: BACKGROUND_LANE_POLICY,
  maintain: () => scoped(() => publishBackgroundDispatches(env)),
  deliver: (body: unknown, lane: Parameters<typeof deliverBackgroundTask>[2], owner: string) =>
    scoped(() => deliverBackgroundTask(env, body, lane, owner)),
  exhausted: (body: unknown, lane: Parameters<typeof recordBackgroundExhaustion>[2]) =>
    scoped(() => recordBackgroundExhaustion(env, body, lane)),
};
runtime = createNodeQueueRuntime({ ...env, ZILOBASE_PROCESS_ROLE: "api" }, callbacks);
const consumers = [0, 1].map(() =>
  createNodeQueueRuntime({ ...env, ZILOBASE_PROCESS_ROLE: "worker" }, callbacks),
);
async function until(check: () => Promise<boolean>, timeout = 25_000) {
  const end = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("Processor fixture timed out");
    await sleep(50);
  }
}
try {
  await runtime.start();
  await scoped(async () => {
    await db
      .insert(tables.user)
      .values({ id: "queue-actor", name: "Actor", email: "queue@fixture.invalid" });
    await db
      .insert(tables.workspace)
      .values({ id: "queue-workspace", name: "Queue", slug: "queue-workspace" });
    await db.insert(tables.member).values({
      id: "queue-member",
      organizationId: "queue-workspace",
      userId: "queue-actor",
      role: "owner",
    });
    await db.insert(tables.database).values({
      id: "queue-host",
      workspaceId: "queue-workspace",
      createdById: "queue-actor",
      name: "Queue",
      config: {},
    });
    await db.insert(tables.dataSource).values({
      id: "queue-source",
      workspaceId: "queue-workspace",
      parentDatabaseId: "queue-host",
      createdById: "queue-actor",
      name: "Source",
      config: {},
    });
    await db
      .insert(tables.databaseDataSource)
      .values({ databaseId: "queue-host", dataSourceId: "queue-source" });
    await db.insert(tables.page).values({
      id: "queue-page",
      workspaceId: "queue-workspace",
      createdById: "queue-actor",
      name: "Record",
    });
    await db.insert(tables.databaseRow).values({
      id: "queue-row",
      pageId: "queue-page",
      dataSourceId: "queue-source",
      orderKey: "1024",
    });
    const definition = {
      definitionVersion: 1,
      scope: { type: "data_source" },
      timezone: "UTC",
      trigger: { kind: "event", match: "any", clauses: [{ id: "added", type: "page_added" }] },
      actions: [
        {
          id: "notify",
          type: "send_notification",
          message: { parts: [{ type: "text", text: "Queued notification" }] },
          recipients: [{ type: "selected_user", userId: "queue-actor" }],
        },
      ],
    };
    await backgroundTransaction(env, async () => {
      await db.insert(tables.databaseAutomation).values({
        id: "queue-automation",
        workspaceId: "queue-workspace",
        dataSourceId: "queue-source",
        ownerUserId: "queue-actor",
        createdById: "queue-actor",
        name: "Notify",
        currentRevisionId: "queue-revision",
        createIdempotencyKey: "queue",
      });
      await db.insert(tables.databaseAutomationRevision).values({
        id: "queue-revision",
        automationId: "queue-automation",
        version: 1,
        definitionVersion: 1,
        definition,
        compiledDefinition: definition,
        definitionHash: "fixture",
      });
    });
    const now = new Date(Date.now() - 100);
    await backgroundTransaction(env, async () => {
      await db.insert(tables.databaseAutomationEventWindow).values({
        id: "queue-window",
        workspaceId: "queue-workspace",
        dataSourceId: "queue-source",
        rowId: "queue-row",
        pageId: "queue-page",
        openedAt: now,
        closesAt: now,
        lastFactAt: now,
        nextAttemptAt: now,
        rowAdded: true,
      });
      await persistBackgroundTasks(env, [
        createBackgroundTaskV2({
          env,
          kind: "automation.event_window",
          resourceId: "queue-window",
        }),
      ]);
    });
    await db.insert(tables.aiAgentProfile).values({
      id: "queue-agent",
      workspaceId: "queue-workspace",
      ownerUserId: "queue-actor",
      name: "Queue Agent",
    });
    await db.insert(tables.aiAgentRevision).values({
      id: "queue-agent-revision",
      profileId: "queue-agent",
      version: 1,
      definition: {},
      compiledDefinition: { name: "Queue Agent", instructions: "Return fixture text" },
      definitionHash: "fixture",
    });
    await db
      .update(tables.aiAgentProfile)
      .set({ currentRevisionId: "queue-agent-revision" })
      .where(eq(tables.aiAgentProfile.id, "queue-agent"));
    await backgroundTransaction(env, async () => {
      await db.insert(tables.aiAgentRun).values({
        id: "queue-agent-run",
        workspaceId: "queue-workspace",
        profileId: "queue-agent",
        revisionId: "queue-agent-revision",
        initiatedByUserId: "queue-actor",
        triggerKind: "manual",
      });
      await persistBackgroundTasks(env, [
        createBackgroundTaskV2({ env, kind: "agent.run", resourceId: "queue-agent-run" }),
      ]);
    });
    await db.insert(tables.aiChatThread).values({
      id: "queue-thread",
      workspaceId: "queue-workspace",
      userId: "queue-actor",
      nextMessageSequence: 14,
    });
    await db.insert(tables.aiChatMessage).values(
      [0, 1].map((sequence) => ({
        id: `queue-message-${sequence}`,
        threadId: "queue-thread",
        role: "user",
        sequence,
        parts: [{ type: "text", text: "Retain this conversation" }],
      })),
    );
    await enqueueAiJob({
      env,
      workspaceId: "queue-workspace",
      userId: "queue-actor",
      type: "thread-compaction",
      input: { threadId: "queue-thread" },
      dedupeKey: "queue-compaction",
    });
    const secret = await encryptCalendarSecret(env, "refresh", {
      connectionId: "queue-account",
      userId: "queue-actor",
      purpose: "refresh_token",
    });
    await db.insert(tables.calendarAccount).values({
      id: "queue-account",
      userId: "queue-actor",
      googleSubject: "queue-subject",
      email: "queue@fixture.invalid",
      secret,
      scopes: [],
    });
    await db.insert(tables.calendarBinding).values({
      id: "queue-binding",
      userId: "queue-actor",
      workspaceId: "queue-workspace",
      accountId: "queue-account",
    });
    await backgroundTransaction(env, async () => {
      await db.insert(tables.calendarProviderCalendar).values({
        accountId: "queue-account",
        calendarId: "primary",
        data: {
          id: "primary",
          bindingId: "queue-binding",
          name: "Primary",
          permissions: { read: true, write: true, owner: true, freeBusyOnly: false },
          colorId: null,
          defaultReminders: [],
          timeZone: "UTC",
          primary: true,
        },
        dirtyAt: now,
      });
      await persistBackgroundTasks(env, [
        createBackgroundTaskV2({
          env,
          kind: "calendar.sync",
          resourceId: JSON.stringify(["queue-account", "primary"]),
        }),
      ]);
    });
    await backgroundTransaction(env, async () => {
      await db.insert(tables.databaseMutationEvent).values({
        id: "queue-event",
        commandId: "queue-command",
        databaseId: "queue-host",
        dataSourceId: "queue-source",
        actorId: "queue-actor",
        version: 1,
        areas: ["records"],
        changes: {},
        requiresReset: true,
      });
      await db
        .insert(tables.databaseRealtimeOutbox)
        .values({ id: "queue-realtime", eventId: "queue-event" });
      await persistBackgroundTasks(env, [
        createBackgroundTaskV2({ env, kind: "realtime.database", resourceId: "queue-realtime" }),
      ]);
    });
  });
  const broker = process.env.ZILOBASE_QUEUE_VERIFY_CONTAINER!;
  assert.ok(broker.startsWith("zilobase-background-test-") && broker.endsWith("-queue"));
  await scoped(() =>
    db
      .insert(tables.aiChatThread)
      .values({ id: "queue-outage-thread", workspaceId: "queue-workspace", userId: "queue-actor" }),
  );
  await promisify(execFile)("docker", ["pause", broker]);
  const outageStarted = Date.now();
  let outageJob: { id: string };
  try {
    outageJob = await scoped(() =>
      enqueueAiJob({
        env,
        workspaceId: "queue-workspace",
        userId: "queue-actor",
        type: "thread-compaction",
        input: { threadId: "queue-outage-thread" },
        dedupeKey: "queue-outage",
      }),
    );
    assert.ok(
      Date.now() - outageStarted < 8000,
      "Commit acknowledgement stays bounded during a real broker outage",
    );
    await scoped(async () => {
      const [ticket] = await db
        .select()
        .from(tables.backgroundDispatch)
        .where(eq(tables.backgroundDispatch.resourceId, outageJob.id));
      assert.equal(ticket.status, "pending");
      await db
        .update(tables.backgroundDispatch)
        .set({ nextPublicationAt: new Date(0) })
        .where(eq(tables.backgroundDispatch.id, ticket.id));
    });
  } finally {
    await promisify(execFile)("docker", ["unpause", broker]);
  }
  await scoped(() => publishBackgroundDispatches(env));
  await Promise.all(consumers.map((consumer) => consumer.start()));
  await until(() =>
    scoped(async () => {
      const [agent] = await db
        .select()
        .from(tables.aiAgentRun)
        .where(eq(tables.aiAgentRun.id, "queue-agent-run"));
      const [calendar] = await db
        .select()
        .from(tables.calendarProviderCalendar)
        .where(eq(tables.calendarProviderCalendar.accountId, "queue-account"));
      const [summary] = await db
        .select()
        .from(tables.aiChatThreadSummary)
        .where(eq(tables.aiChatThreadSummary.threadId, "queue-thread"));
      return (
        agent?.status === "succeeded" &&
        calendar?.syncToken === "final-checkpoint" &&
        !!summary &&
        channels.includes("notification:queue-actor") &&
        channels.includes("db:queue-host")
      );
    }),
  );
  await scoped(async () => {
    const [window] = await db
      .select()
      .from(tables.databaseAutomationEventWindow)
      .where(eq(tables.databaseAutomationEventWindow.id, "queue-window"));
    assert.equal(window.status, "completed");
    const [run] = await db
      .select()
      .from(tables.databaseAutomationRun)
      .where(eq(tables.databaseAutomationRun.automationId, "queue-automation"));
    assert.equal(run.status, "succeeded");
    assert.equal(
      (
        await db
          .select()
          .from(tables.inProductNotification)
          .where(eq(tables.inProductNotification.runId, run.id))
      ).length,
      1,
    );
    assert.equal(
      (
        await db
          .select()
          .from(tables.calendarEventRecord)
          .where(eq(tables.calendarEventRecord.accountId, "queue-account"))
      ).length,
      2,
    );
    const dispatches = await db
      .select()
      .from(tables.backgroundDispatch)
      .where(eq(tables.backgroundDispatch.cellId, cell));
    assert.equal(new Set(dispatches.map((row) => row.kind)).size, 7);
    assert.ok(dispatches.every((row) => row.status === "completed"));
    assert.equal(channels.filter((channel) => channel === "notification:queue-actor").length, 1);
    assert.equal(
      (await db.select().from(tables.aiJob).where(eq(tables.aiJob.id, outageJob.id)))[0].attempt,
      1,
      "Partial enqueue after timeout cannot repeat business execution",
    );
    assert.equal(modelCalls, 2, "Both AI compaction and Custom Agent execute their provider calls");
    assert.equal(
      calendarCalls,
      2,
      "Continuation reads both provider pages through separate deliveries",
    );
  });
  await Promise.all(consumers.map((consumer) => consumer.stop()));
  const crashTask = createBackgroundTaskV2({
    env,
    kind: "notification.publish",
    resourceId: "queue-crash-outbox",
  });
  await scoped(() =>
    backgroundTransaction(env, async () => {
      await db.insert(tables.inProductNotification).values({
        id: "queue-crash-notification",
        workspaceId: "queue-workspace",
        userId: "queue-actor",
        message: "Retain committed notification",
      });
      await db.insert(tables.inProductNotificationOutbox).values({
        id: "queue-crash-outbox",
        notificationId: "queue-crash-notification",
        workspaceId: "queue-workspace",
        userId: "queue-actor",
        nextAttemptAt: new Date(),
      });
      await persistBackgroundTasks(env, [crashTask]);
    }),
  );
  const child = fork(
    fileURLToPath(new URL("./verify-background-crash-worker.ts", import.meta.url)),
    [],
    {
      execArgv: ["--import", "tsx"],
      env: { ...process.env, ...env, ZILOBASE_PROCESS_ROLE: "worker" },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  child.stderr?.pipe(process.stderr);
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Crash worker did not claim delivery")),
        15_000,
      );
      child.once("message", () => {
        clearTimeout(timeout);
        resolve();
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Crash worker exited early: ${code}`));
      });
    });
    const exit = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGKILL");
    await exit;
    await scoped(async () => {
      const [ticket] = await db
        .select()
        .from(tables.backgroundDispatch)
        .where(eq(tables.backgroundDispatch.id, crashTask.taskId));
      assert.equal(ticket.status, "running");
      await db
        .update(tables.backgroundDispatch)
        .set({ leaseExpiresAt: new Date(0), nextPublicationAt: new Date(0) })
        .where(eq(tables.backgroundDispatch.id, crashTask.taskId));
    });
    const recovery = createNodeQueueRuntime({ ...env, ZILOBASE_PROCESS_ROLE: "worker" }, callbacks);
    try {
      await recovery.start();
      await until(
        () =>
          scoped(
            async () =>
              (
                await db
                  .select()
                  .from(tables.backgroundDispatch)
                  .where(eq(tables.backgroundDispatch.id, crashTask.taskId))
              )[0].status === "completed",
          ),
        120_000,
      );
      await scoped(async () => {
        assert.equal(
          (
            await db
              .select()
              .from(tables.inProductNotification)
              .where(eq(tables.inProductNotification.id, "queue-crash-notification"))
          ).length,
          1,
        );
        assert.equal(
          (
            await db
              .select()
              .from(tables.inProductNotificationOutbox)
              .where(eq(tables.inProductNotificationOutbox.id, "queue-crash-outbox"))
          )[0].status,
          "published",
        );
      });
    } finally {
      await recovery.stop();
    }
    console.info(
      "Forced SIGKILL recovery passed: production delivery reclaimed after lease expiry, with one retained domain notification.",
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  console.info(
    "Production processor verification passed: all seven kinds, two competing workers, automation notifications, AI compaction, agent checkpoints, calendar continuation and journal fanout.",
  );
} finally {
  await Promise.all(consumers.map((consumer) => consumer.stop()));
  await runtime.stop();
  globalThis.fetch = originalFetch;
  await createDbClient(env).client.end();
}
