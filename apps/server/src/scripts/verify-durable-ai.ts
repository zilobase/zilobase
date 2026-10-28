import { BACKGROUND_LANE_POLICY } from "../infrastructure/background/task-v2";
import { createNodeQueueRuntime } from "@zilobase/runtime-adapter/node";
import { getChatThread } from "../services/ai/conversations";
import { generateReadAgent } from "../services/ai/agent";
import type { generateChatOutput } from "../services/ai/provider";
import { openRunInput } from "../services/ai/run-input";
import { MockLanguageModelV4 } from "ai/test";
import { processAiGeneration } from "../services/ai/background";
import { chatRunResponse } from "../routes/ai/durable-stream";
import { backgroundTaskLane, parseBackgroundTask } from "../infrastructure/background/contracts";
import { createBackgroundDeliveryStore } from "../infrastructure/background/publication";
import { runBackgroundDelivery } from "../app/background/delivery";
import { runWithIndependentDbEnv } from "../infrastructure/database";
import type { Ports } from "@zilobase/runtime-ports";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { runWithRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { runMigrationSets } from "@zilobase/runtime-adapter/node";
import { CORE_MIGRATION_SET } from "../public/node-adapter-api";
import { createDbClientForUrl, runWithDb } from "../infrastructure/database";
import {
  database,
  dataSource,
  databaseDataSource,
  databaseRow,
  page,
  askAiRun,
  askAiRunInput,
  askAiRunEvent,
  askAiTurn,
  askAiThread,
  backgroundDispatch,
  member,
  session,
  user,
  workspace,
} from "../infrastructure/database/schema";
import {
  admitChatRun,
  cancelChatRun,
  checkpointChatRun,
  claimChatRun,
  readChatRunPage,
  renewChatRunLease,
  getChatRequest,
} from "../services/ai/runs";
import type { ServerOperationContext } from "../services/operations/context";
import { managedAppPolicy } from "../shared/config/app-policy";
const connection = process.env.ZILOBASE_BACKGROUND_VERIFY_URL;
assert.ok(connection, "Use scripts/ai/test-durable.mjs");
assert.equal(new URL(connection).pathname, "/zilobase_background_verify");
const client = createDbClientForUrl(connection);
const env = {
  DATABASE_URL: connection,
  ZILOBASE_CELL_ID: "test",
  OPENAI_API_KEY: "fixture",
  AI_DURABLE_STREAMING_ENABLED: "true",
  AI_RUN_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString("base64"),
};
const ports: Partial<Ports> = { jobs: { dispatch: async () => {} } };
try {
  await client.client.connect();
  assert.equal(
    (
      await client.client.query(
        "select count(*)::int as count from information_schema.tables where table_schema='public'",
      )
    ).rows[0].count,
    0,
  );
  await runMigrationSets(client.db, [CORE_MIGRATION_SET]);
  await runWithRuntimePorts(ports, () =>
    runWithDb(client.db, async () => {
      const [actor] = await client.db
        .insert(user)
        .values({ id: "actor", name: "Test", email: "durable@test.invalid" })
        .returning();
      await client.db.insert(workspace).values({ id: "workspace", name: "Test", slug: "test" });
      await client.db
        .insert(member)
        .values({ id: "member", organizationId: "workspace", userId: "actor", role: "owner" });
      const [login] = await client.db
        .insert(session)
        .values({
          id: "session",
          token: "fixture-only",
          userId: "actor",
          activeWorkspaceId: "workspace",
          expiresAt: new Date(Date.now() + 3600_000),
        })
        .returning();
      const context = {
        env,
        runtimePorts: ports,
        policy: managedAppPolicy,
        authentication: {
          user: actor,
          session: login,
          authMethod: "session",
          apiKey: null,
          oauthScopes: null,
        },
        activeWorkspaceId: "workspace",
        pinnedWorkspaceId: null,
        editionExtension: null,
        requestId: "http",
      } as ServerOperationContext;
      const request = {
        requestId: randomUUID(),
        workspaceId: "workspace",
        text: "First",
        roots: [],
        snapshots: [],
        history: [],
      };
      const receipt = await admitChatRun(context, request);
      assert.deepEqual(
        await admitChatRun(context, request),
        receipt,
        "duplicate submit resolves the original run",
      );
      assert.equal((await client.db.select().from(backgroundDispatch)).length, 1);
      await assert.rejects(admitChatRun(context, { ...request, text: "Different" }), /Request ID/);
      await assert.rejects(
        admitChatRun(context, { ...request, requestId: randomUUID(), threadId: receipt.threadId }),
        /current answer/,
      );
      assert.equal(
        (await client.db.select().from(askAiTurn)).length,
        1,
        "failed admission rolls back",
      );
      assert.equal(
        (await client.db.select().from(askAiRunInput))[0]?.sealed.includes("First"),
        false,
      );
      const run = await claimChatRun(receipt.runId, "owner", "test");
      assert.ok(run);
      await renewChatRunLease(run.id, "owner", run.fence);
      await assert.rejects(renewChatRunLease(run.id, "stale", run.fence), /LEASE_LOST/);
      await assert.rejects(claimChatRun(receipt.runId, "duplicate", "test"), /BUSY/);
      await checkpointChatRun(run.id, "owner", run.fence, { text: "Saved" });
      const initialPage = await readChatRunPage(context, run.id, "workspace", 0);
      assert.equal(initialPage.snapshot.text, "Saved");
      assert.equal(initialPage.snapshot.seq, 1);
      assert.equal(initialPage.events[0]?.seq, 1);
      await assert.rejects(
        checkpointChatRun(run.id, "stale", run.fence, { text: "wrong" }),
        /LEASE_LOST/,
      );
      await cancelChatRun(context, run.id, "workspace");
      await assert.rejects(renewChatRunLease(run.id, "owner", run.fence), /CANCELLED/);
      await assert.rejects(
        checkpointChatRun(run.id, "owner", run.fence, { text: "late" }, "completed"),
        /CANCELLED/,
      );
      await checkpointChatRun(run.id, "owner", run.fence, {}, "stopped");
      assert.equal(
        (await getChatRequest(context, request.requestId, "workspace")).status,
        "stopped",
      );
      const retained = await client.db.select().from(askAiRunInput);
      assert.equal(
        retained.length,
        1,
        "Stopped agent checkpoints retain the raw log until their existing TTL",
      );
      assert.ok(retained[0]!.expiresAt > new Date());
      await client.db.delete(member).where(eq(member.id, "member"));
      await assert.rejects(readChatRunPage(context, run.id, "workspace", 0), /Forbidden/);
      await client.db
        .insert(member)
        .values({ id: "member", organizationId: "workspace", userId: "actor", role: "owner" });
      const queued = await admitChatRun(context, { ...request, requestId: randomUUID() });
      await cancelChatRun(context, queued.runId, "workspace");
      let cancelledCalls = 0;
      await processAiGeneration(
        env,
        { runId: queued.runId, workerId: "cancelled" },
        async function* () {
          cancelledCalls++;
          yield { completed: true };
        },
      );
      assert.equal(cancelledCalls, 0, "cancel-before-start never calls the provider");

      // Simulate slow remote persistence. Reading each token must not wait for its own database transaction.
      const batched = await admitChatRun(context, { ...request, requestId: randomUUID() });
      await client.client.query(`
        CREATE FUNCTION verify_ai_slow_delta() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END $$;
        CREATE TRIGGER verify_ai_slow_delta BEFORE INSERT ON ask_ai_run_event
        FOR EACH ROW WHEN (NEW.event->>'type' = 'delta') EXECUTE FUNCTION verify_ai_slow_delta();
      `);
      try {
        await processAiGeneration(
          env,
          { runId: batched.runId, workerId: "batching" },
          async function* () {
            for (let index = 0; index < 50; index++) {
              yield { text: "x" };
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            yield { completed: true };
          },
        );
        const answer = await getChatRequest(context, batched.turnId, "workspace");
        assert.equal(answer.status, "completed");
        assert.equal(answer.text, "x".repeat(50), "Coalescing preserves every token exactly once");
        const persisted = await client.db
          .select()
          .from(askAiRunEvent)
          .where(eq(askAiRunEvent.runId, batched.runId));
        assert.ok(
          persisted.filter((event) => event.event.type === "delta").length <= 4,
          "Slow persistence must batch tokens, not force one database write per token",
        );
      } finally {
        await client.client.query(
          "DROP TRIGGER verify_ai_slow_delta ON ask_ai_run_event; DROP FUNCTION verify_ai_slow_delta()",
        );
      }

      const abandoned = await admitChatRun(context, { ...request, requestId: randomUUID() });
      const lost = await claimChatRun(abandoned.runId, "lost", "test");
      assert.ok(lost);
      await checkpointChatRun(lost.id, "lost", lost.fence, { text: "Saved partial" });
      await client.db
        .update(askAiRun)
        .set({ providerStartedAt: new Date(), leaseExpiresAt: new Date(0) })
        .where(eq(askAiRun.id, lost.id));
      const replacement = await claimChatRun(lost.id, "replacement", "test");
      assert.ok(
        replacement,
        "Tool runs can restart from a committed transcript without a provider response ID",
      );
      assert.equal(replacement.fence, lost.fence + 1);
      await assert.rejects(
        checkpointChatRun(lost.id, "lost", lost.fence, { text: "stale" }),
        /LEASE_LOST/,
      );
      await checkpointChatRun(
        lost.id,
        "replacement",
        replacement.fence,
        { replaceText: "", text: "Recovered" },
        "completed",
      );
      const interrupted = await getChatRequest(context, abandoned.requestId, "workspace");
      assert.equal(interrupted.status, "completed");
      assert.equal(interrupted.text, "Recovered", "Uncommitted text is replaced, not duplicated");

      const recovered = await admitChatRun(
        { ...context, env: { ...env, AI_PROVIDER_BACKGROUND_ENABLED: "true" } },
        { ...request, requestId: randomUUID() },
      );
      await client.db
        .update(askAiRun)
        .set({ agentVersion: 1, background: true })
        .where(eq(askAiRun.id, recovered.runId));
      const oldOwner = await claimChatRun(recovered.runId, "old-owner", "test");
      assert.ok(oldOwner);
      await checkpointChatRun(recovered.runId, "old-owner", oldOwner.fence, {
        text: "Saved",
        responseId: "resp_fixture",
        cursor: 3,
      });
      await client.db
        .update(askAiRun)
        .set({ providerStartedAt: new Date(), leaseExpiresAt: new Date(0) })
        .where(eq(askAiRun.id, recovered.runId));
      let recoveredCalls = 0;
      await processAiGeneration(
        env,
        { runId: recovered.runId, workerId: "replacement" },
        async function* (_context, _input, _signal, recovery) {
          assert.deepEqual(recovery, { responseId: "resp_fixture", cursor: 3 });
          recoveredCalls++;
          yield { text: " suffix", responseId: "resp_fixture", cursor: 4 };
          yield { completed: true, responseId: "resp_fixture", cursor: 5 };
        },
      );
      assert.equal(recoveredCalls, 1);
      assert.equal(
        (await getChatRequest(context, recovered.requestId, "workspace")).text,
        "Saved suffix",
      );
      await assert.rejects(
        checkpointChatRun(recovered.runId, "old-owner", oldOwner.fence, { text: "stale" }),
        /LEASE_LOST/,
      );
      await client.db.delete(askAiRunEvent).where(eq(askAiRunEvent.runId, recovered.runId));
      const compacted = await readChatRunPage(context, recovered.runId, "workspace", 0);
      assert.equal(compacted.reset, true);
      assert.equal(compacted.snapshot.text, "Saved suffix");

      const cancellable = await admitChatRun(context, { ...request, requestId: randomUUID() });
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      const processing = processAiGeneration(
        env,
        { runId: cancellable.runId, workerId: "stop-owner" },
        async function* (_context, _input, signal) {
          yield { text: "Keep this" };
          started();
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        },
      );
      await ready;
      await cancelChatRun(context, cancellable.runId, "workspace");
      await processing;
      const stopped = await getChatRequest(context, cancellable.requestId, "workspace");
      assert.equal(stopped.status, "stopped");
      assert.equal(stopped.text, "Keep this");

      // Real read operations + deterministic model: source mention -> schema -> first page -> continuation.
      await client.db.insert(database).values({
        id: "tools-db",
        workspaceId: "workspace",
        createdById: "actor",
        name: "Projects",
      });
      await client.db.insert(dataSource).values({
        id: "tools-source",
        workspaceId: "workspace",
        parentDatabaseId: "tools-db",
        name: "Projects",
      });
      await client.db
        .insert(databaseDataSource)
        .values({ databaseId: "tools-db", dataSourceId: "tools-source" });
      for (let i = 0; i < 2; i++) {
        await client.db.insert(page).values({
          id: `tools-page-${i}`,
          workspaceId: "workspace",
          createdById: "actor",
          name: `Project ${i}`,
          content: JSON.stringify({
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: `Saved project plan ${i}` }] },
            ],
          }),
        });
        await client.db.insert(databaseRow).values({
          id: `tools-row-${i}`,
          dataSourceId: "tools-source",
          pageId: `tools-page-${i}`,
          orderKey: String(i),
        });
      }
      const toolRequest = {
        workspaceId: "workspace",
        requestId: randomUUID(),
        text: "Read page:tools-page-0 and [[database:tools-db]]",
      };
      const toolRun = await admitChatRun(context, toolRequest);
      const [acceptedInput] = await client.db
        .select()
        .from(askAiRunInput)
        .where(eq(askAiRunInput.runId, toolRun.runId));
      assert.ok(
        !JSON.stringify(openRunInput(env, toolRun.runId, acceptedInput!.sealed)).includes(
          "Saved project plan 0",
        ),
        "Admission must not preload record content",
      );
      const providerFor = (continuing = false, noProgress = false) =>
        async function* (
          ctx: ServerOperationContext,
          input: import("../services/ai/provider").ProviderInput,
          signal: AbortSignal,
          _cursor: unknown,
          _transport: unknown,
          persistence?: import("../services/ai/agent").AgentPersistence,
        ) {
          let step = 0;
          const pending = Object.values(input.agent!.pending)[0];
          const model = new MockLanguageModelV4({
            doStream: async ({ tools }) => {
              if (continuing) {
                assert.ok(!tools?.some((tool) => tool.name === "search_workspace"));
                assert.ok(!tools?.some((tool) => tool.name === "semantic_search_workspace"));
              }
              const current = step++;
              if (!continuing && current === 1)
                assert.ok(
                  JSON.stringify(input.agent!.messages).includes("Saved project plan 0"),
                  "Page content must arrive through read_page",
                );
              const invocation = continuing
                ? current === 0 && !noProgress
                  ? { name: pending!.name, input: pending!.input }
                  : null
                : current === 0
                  ? { name: "read_page", input: { pageId: "tools-page-0" } }
                  : current === 1
                    ? { name: "describe_source", input: { type: "database", id: "tools-db" } }
                    : current === 2
                      ? { name: "read_page", input: { pageId: "tools-source" } }
                      : current === 3
                        ? { name: "describe_source", input: { type: "database", id: "tools-db" } }
                        : current === 4
                          ? {
                              name: "query_records",
                              input: {
                                databaseId: "tools-db",
                                dataSourceId: "tools-source",
                                limit: 1,
                              },
                            }
                          : null;
              return {
                stream: new ReadableStream({
                  start(controller) {
                    controller.enqueue({ type: "stream-start", warnings: [] });
                    if (invocation)
                      controller.enqueue({
                        type: "tool-call",
                        toolCallId: `tool-${current}`,
                        toolName: invocation.name,
                        input: JSON.stringify(invocation.input),
                      });
                    else {
                      controller.enqueue({ type: "text-start", id: "answer" });
                      controller.enqueue({
                        type: "text-delta",
                        id: "answer",
                        delta: continuing
                          ? "Second project. [[source:tools-source]]"
                          : "First project. [[page:tools-page-0]] [[source:tools-source]]",
                      });
                      controller.enqueue({ type: "text-end", id: "answer" });
                    }
                    controller.enqueue({
                      type: "finish",
                      finishReason: {
                        unified: invocation ? "tool-calls" : "stop",
                        raw: invocation ? "tool_calls" : "stop",
                      },
                      usage: {
                        inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
                        outputTokens: { total: 5, text: 5, reasoning: 0 },
                      },
                    });
                    controller.close();
                  },
                }),
              };
            },
          });
          input.agent!.intent ??= { mode: "read", keywordQuery: null, teamspaceNames: [] };
          yield* generateReadAgent(ctx, input.agent!, signal, { model, persistence });
        };
      await processAiGeneration(env, { runId: toolRun.runId, workerId: "tools" }, providerFor());
      const firstPage = await getChatRequest(context, toolRequest.requestId, "workspace");
      assert.equal(firstPage.status, "completed");
      assert.ok(firstPage.progress?.canContinue);
      assert.equal(firstPage.progress?.activities.length, 5);
      assert.equal(firstPage.progress?.activities[2]?.error, "RESOURCE_TYPE_MISMATCH");
      assert.equal(firstPage.progress?.activities[3]?.cached, true);
      assert.ok(firstPage.context?.manifest.some((entry) => entry.key === "page:tools-page-0"));
      const history = await getChatThread(context, "workspace", toolRun.threadId);
      assert.equal(
        history.messages[0]?.text,
        "Read [[page:tools-page-0]] and [[database:tools-db]]",
      );
      assert.deepEqual(history.roots, [
        { type: "page", id: "tools-page-0" },
        { type: "database", id: "tools-db" },
      ]);
      assert.ok(
        firstPage.context?.manifest.some(
          (entry) => entry.key === "record:tools-source:tools-row-0",
        ),
      );
      const continued = await admitChatRun(context, {
        ...toolRequest,
        requestId: randomUUID(),
        threadId: toolRun.threadId,
        continueFromRunId: toolRun.runId,
        text: "Continue reading [[page:tools-page-0]] [[database:tools-db]]",
      });
      const [continuationInput] = await client.db
        .select()
        .from(askAiRunInput)
        .where(eq(askAiRunInput.runId, continued.runId));
      const resumed = openRunInput(env, continued.runId, continuationInput!.sealed).agent!;
      assert.equal(resumed.messages.length, 1, "Continuation starts a fresh model window");
      assert.ok(!JSON.stringify(resumed.messages).includes("Saved project plan 0"));
      assert.ok(resumed.continuation?.initialProgress);
      await processAiGeneration(
        env,
        { runId: continued.runId, workerId: "continue" },
        providerFor(true),
      );
      const lastPage = await getChatRequest(context, continued.requestId, "workspace");
      assert.equal(lastPage.status, "completed");
      assert.equal(lastPage.progress?.canContinue, false);
      assert.ok(
        lastPage.context?.manifest.some((entry) => entry.key === "record:tools-source:tools-row-1"),
      );
      assert.ok(lastPage.text.includes("Second project"));
      const stalled = await admitChatRun(context, {
        ...toolRequest,
        requestId: randomUUID(),
        threadId: toolRun.threadId,
        continueFromRunId: toolRun.runId,
        text: "Continue reading [[page:tools-page-0]] [[database:tools-db]]",
      });
      await processAiGeneration(
        env,
        { runId: stalled.runId, workerId: "no-progress" },
        providerFor(true, true),
      );
      const stalledResult = await getChatRequest(context, stalled.requestId, "workspace");
      assert.equal(stalledResult.progress?.canContinue, false);
      assert.equal(stalledResult.progress?.stopReason, "no_progress");
      await assert.rejects(
        admitChatRun(context, {
          ...toolRequest,
          requestId: randomUUID(),
          threadId: toolRun.threadId,
          continueFromRunId: stalled.runId,
          text: "Continue reading [[page:tools-page-0]] [[database:tools-db]]",
        }),
        /cannot be continued/,
      );
      await assert.rejects(
        admitChatRun(context, {
          ...toolRequest,
          requestId: randomUUID(),
          threadId: toolRun.threadId,
          continueFromRunId: toolRun.runId,
          text: "Continue without sources",
        }),
        /sources changed/,
      );

      // A chat longer than the former 100-turn ceiling compacts to durable,
      // encrypted memory, then carries that memory into the next message.
      for (let i = 0; i < 105; i++)
        await client.db.insert(askAiTurn).values({
          id: randomUUID(),
          threadId: toolRun.threadId,
          requestHash: randomUUID(),
          userText: `${i === 0 ? "Remember EU hosting for launch." : "Earlier discussion."} ${"context ".repeat(120)}`,
          assistantText: "We chose EU hosting. " + "detail ".repeat(120),
          status: "completed",
          roots: [],
          context: {
            version: 1,
            status: "complete",
            charCount: 0,
            manifest: [],
            omissions: [],
            trimmedAttachmentIds: [],
          },
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(Date.now() - 200_000 + i * 1000),
        });
      const memoryRun = await admitChatRun(context, {
        workspaceId: "workspace",
        requestId: randomUUID(),
        threadId: toolRun.threadId,
        text: "What did we decide about hosting?",
      });
      const compactingProvider = async function* (
        ctx,
        input,
        signal,
        _cursor,
        _transport,
        persistence,
      ) {
        const model = new MockLanguageModelV4({
          doGenerate: async () => ({
            content: [
              {
                type: "text",
                text: "The user decided to use EU hosting for launch. Earlier read and record coverage remain in the retained inventory.",
              },
            ],
            finishReason: { unified: "stop", raw: "stop" },
            warnings: [],
            usage: {
              inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 5, text: 5, reasoning: 0 },
            },
          }),
          doStream: async ({ prompt }) => {
            assert.ok(JSON.stringify(prompt).includes("EU hosting"));
            return {
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue({ type: "stream-start", warnings: [] });
                  controller.enqueue({ type: "text-start", id: "memory" });
                  controller.enqueue({
                    type: "text-delta",
                    id: "memory",
                    delta: "We decided on EU hosting.",
                  });
                  controller.enqueue({ type: "text-end", id: "memory" });
                  controller.enqueue({
                    type: "finish",
                    finishReason: { unified: "stop", raw: "stop" },
                    usage: {
                      inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
                      outputTokens: { total: 5, text: 5, reasoning: 0 },
                    },
                  });
                  controller.close();
                },
              }),
            };
          },
        });
        input.agent!.intent ??= { mode: "read", keywordQuery: null, teamspaceNames: [] };
        yield* generateReadAgent(ctx, input.agent!, signal, { model, persistence });
      } satisfies typeof generateChatOutput;
      await processAiGeneration(
        env,
        { runId: memoryRun.runId, workerId: "compaction" },
        compactingProvider,
      );
      const memoryResult = await getChatRequest(context, memoryRun.requestId, "workspace");
      assert.equal(memoryResult.progress?.compaction?.status, "completed");
      const restoredThread = await getChatThread(context, "workspace", toolRun.threadId);
      assert.equal(restoredThread.messages.at(-1)?.progress?.compaction?.status, "completed");
      assert.ok(!("compactedMemory" in restoredThread.thread));
      const [memoryThread] = await client.db
        .select()
        .from(askAiThread)
        .where(eq(askAiThread.id, toolRun.threadId));
      assert.ok(memoryThread!.compactedMemory);
      assert.ok(!memoryThread!.compactedMemory.includes("EU hosting"));
      const memory = openRunInput<{ summary: string; throughTurnId: string }>(
        env,
        `thread:${toolRun.threadId}`,
        memoryThread!.compactedMemory,
      );
      assert.ok(memory.summary.includes("EU hosting"));
      assert.ok(memory.throughTurnId);
      const following = await admitChatRun(context, {
        workspaceId: "workspace",
        requestId: randomUUID(),
        threadId: toolRun.threadId,
        text: "And which region?",
      });
      const [followingInput] = await client.db
        .select()
        .from(askAiRunInput)
        .where(eq(askAiRunInput.runId, following.runId));
      const followingState = openRunInput(env, following.runId, followingInput!.sealed).agent!;
      assert.ok(JSON.stringify(followingState.messages).includes("EU hosting"));
      assert.equal(followingState.conversation?.memory?.throughTurnId, memory.throughTurnId);
      assert.ok(
        followingState.grants.some((grant) => grant.resource.id === "tools-db"),
        "Typed prior sources remain discoverable for follow-up live reads",
      );
      assert.deepEqual(
        followingState.context.manifest,
        [],
        "Historical source references are not current evidence",
      );
      assert.ok(
        !followingState.grants.some((grant) => grant.resource.id === "EU hosting"),
        "Prose summaries cannot grant content access",
      );
      await cancelChatRun(context, following.runId, "workspace");
      console.info("PASS rolling compaction, encrypted summary, >100 turns, and follow-up context");

      let calls = 0;
      const queueEnv = { ...env, QUEUE_REDIS_URL: process.env.ZILOBASE_QUEUE_VERIFY_URL };
      const queue = createNodeQueueRuntime(queueEnv, {
        lane: (task) => backgroundTaskLane(task.kind as never),
        validate: (body) => {
          const task = parseBackgroundTask(body, "test");
          if (!task.ok) throw new Error(task.errorCode);
          return task.task;
        },
        policy: BACKGROUND_LANE_POLICY,
        deliver: (body, lane, workerId) =>
          runWithRuntimePorts(ports, () =>
            runWithIndependentDbEnv(env, () =>
              runBackgroundDelivery({
                body,
                lane,
                cellId: "test",
                store: createBackgroundDeliveryStore(env, workerId),
                execute: (task) =>
                  processAiGeneration(
                    env,
                    { runId: task.resourceId, workerId },
                    async function* () {
                      calls++;
                      yield { text: "A" };
                      await new Promise((resolve) => setTimeout(resolve, 350));
                      yield { text: "nswer" };
                      yield { completed: true };
                    },
                  ),
              }),
            ),
          ),
        exhausted: async () => {},
        maintain: async () => {},
      });
      try {
        await queue.start();
        ports.jobs = { dispatch: queue.dispatch };
        const admitted = await admitChatRun(context, {
          ...request,
          requestId: randomUUID(),
          text: "Queue test",
        });
        const subscriber = chatRunResponse(context, admitted, 0).body!.getReader();
        await subscriber.read();
        await subscriber.cancel();
        for (let attempt = 0; ; attempt++) {
          const receipt = await getChatRequest(context, admitted.requestId, "workspace");
          if (receipt.status === "completed") {
            assert.equal(receipt.text, "Answer");
            break;
          }
          assert.ok(attempt < 100, "queued producer must finish after subscriber disconnect");
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const resumed = await readChatRunPage(context, admitted.runId, "workspace", 0);
        assert.equal(
          resumed.events
            .filter((entry) => entry.event.type === "delta")
            .map((entry) => (entry.event.type === "delta" ? entry.event.text : ""))
            .join(""),
          "Answer",
        );
        assert.equal(calls, 1, "reconnecting does not generate twice");
      } finally {
        await queue.stop();
        ports.jobs = { dispatch: async () => {} };
      }
      await client.db.delete(session).where(eq(session.id, "session"));
      await assert.rejects(
        readChatRunPage(context, recovered.runId, "workspace", 0),
        /Session expired/,
      );
      console.info(
        "Durable AI PostgreSQL: idempotency, atomic admission, encryption, fencing, replay, cancellation and access revocation passed.",
      );
    }),
  );
} finally {
  await client.client.end();
}
