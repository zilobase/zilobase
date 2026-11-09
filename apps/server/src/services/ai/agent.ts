import { recordDebugEvent, debugModelMessages } from "./debug";
import { ToolLoopAgent, type LanguageModel, type ModelMessage } from "ai";
import type { ServerOperationContext } from "../operations/context";
import { configuredChatModel, CHAT_INSTRUCTIONS, DEFAULT_CHAT_MODEL } from "./chat";
import {
  createReadTools,
  revalidateReadKnowledge,
  readChatLocations,
  readToolSchemaText,
  type ReadToolDependencies,
} from "./read-tools";
import { readProgressKey, updateReadCoverage, type AgentState } from "./agent-state";
import {
  chatTokenCounter,
  modelContextWindow,
  compactConversation,
  memoryMessage,
} from "./compaction";
import {
  restoreAgentKnowledge,
  agentKnowledgeSummary,
  pruneStaleInspections,
  retainConversationSources,
} from "./agent-memory";
import type { ProviderChunk } from "./provider";
import { createAiDiagnostics, type AiDiagnostics } from "./diagnostics";
import { routeSearchIntent, resolveIntentTeamspaces } from "./intent";
import { searchAvailabilityNotice } from "@zilobase/features/search";
import { createActionTools } from "./action-tools";

/** Write guidance added when workspace actions are enabled for this deployment. */
const ACTION_INSTRUCTIONS =
  "You can create and change databases with the databases_* tools, which act as the user with the user's permissions. Do what the user asks; do not change content they did not ask about. Inspect a database with describe_source before editing it, and find row IDs with query_records before updating rows. Refer to properties by their names or IDs exactly as returned. Batch up to 100 rows per call. If a tool returns an error, fix the input or explain the problem; never invent IDs. Deleting or archiving content is not available yet. After changing content, briefly summarize what changed with links.";

export type AgentPersistence = {
  checkpoint: (state: AgentState) => Promise<void>;
  diagnostics?: AiDiagnostics;
};
export async function* generateReadAgent(
  context: ServerOperationContext,
  state: AgentState,
  signal: AbortSignal,
  options: {
    model?: LanguageModel;
    transport?: typeof fetch;
    persistence?: AgentPersistence;
    dependencies?: ReadToolDependencies;
  } = {},
): AsyncGenerator<ProviderChunk> {
  const window = modelContextWindow(context.env);
  const counter = chatTokenCounter(
    context.env,
    typeof options.model === "object"
      ? options.model.modelId
      : String(options.model ?? context.env.AI_MODEL ?? DEFAULT_CHAT_MODEL),
  );
  restoreAgentKnowledge(state);
  if (!state.debug)
    recordDebugEvent(state, "run.started", {
      roots: state.roots,
      contextWindow: window,
      estimator: counter.encoding,
      usage: { inputTokens: state.inputTokens, outputTokens: state.outputTokens },
    });
  const diagnostics =
    options.persistence?.diagnostics ??
    createAiDiagnostics(context.env, {
      requestId: context.requestId,
      model:
        typeof options.model === "object"
          ? options.model.modelId
          : String(context.env.AI_MODEL ?? "default"),
    });
  const updates: ProviderChunk[] = [];
  let saving = Promise.resolve();
  let emittedDebugEvents = 0;
  let emittedDebugOmitted = 0;
  let wakeUpdates: (() => void) | undefined;
  const changed = async () => {
    // Keep working checkpoints alive; the one-hour retention starts at inactivity.
    state.expiresAt = Date.now() + 3_600_000;
    for (const cursor of Object.values(state.cursors)) cursor.expiresAt = state.expiresAt;
    updateReadCoverage(state);
    retainConversationSources(state);
    const copy = structuredClone(state);
    saving = saving.then(() =>
      options.persistence
        ? diagnostics.measure("agent_checkpoint", () => options.persistence!.checkpoint(copy), {
            step: copy.steps,
            calls: copy.calls,
            bytes: Buffer.byteLength(JSON.stringify(copy)),
          })
        : undefined,
    );
    await saving;
    if (options.persistence && state.conversation) state.conversation.dirty = false;
    if (!options.persistence) {
      updates.push({ context: copy.context, progress: copy.progress });
      const events = copy.debug?.events.slice(emittedDebugEvents) ?? [];
      const omitted = copy.debug?.omitted ?? 0;
      if (events.length || omitted !== emittedDebugOmitted)
        updates.push({ debug: { events, omitted } });
      emittedDebugOmitted = omitted;
      emittedDebugEvents = copy.debug?.events.length ?? 0;
      wakeUpdates?.();
    }
  };
  let preparedMessages = state.messages;
  let separator = "";
  let answerOnly = false;
  let endModelCall: ReturnType<AiDiagnostics["start"]> | undefined;
  const transport: typeof fetch = async (input, init) => {
    const end = diagnostics.start("provider_headers", { step: state.steps });
    try {
      const response = await (options.transport ?? fetch)(input, init);
      end({ status: response.status, outcome: response.ok ? "ok" : "error" });
      return response;
    } catch (error) {
      end({ outcome: "error" });
      throw error;
    }
  };
  const model = options.model ?? configuredChatModel(context, transport);
  if (!state.intent && !state.continuation && !state.searchListing) {
    const routed = await routeSearchIntent(model, state.task, signal);
    state.inputTokens += routed.usage.inputTokens ?? 0;
    state.outputTokens += routed.usage.outputTokens ?? 0;
    state.intent = resolveIntentTeamspaces(
      routed.intent,
      routed.intent.teamspaceNames.length
        ? await readChatLocations(context, state.workspaceId, options.dependencies)
        : [],
    );
    await changed();
  }
  const actionTools = createActionTools(context, {
    workspaceId: state.workspaceId,
    invocationId: context.requestId,
    progress: state.progress,
    changed,
  });
  const tools = {
    ...createReadTools(context, state, {
      signal,
      changed,
      dependencies: options.dependencies,
      diagnostics,
    }),
    ...actionTools,
  };
  const baseInstructions = Object.keys(actionTools).length
    ? `${CHAT_INSTRUCTIONS.replace("a read-only workspace assistant", "a workspace assistant").replace(" Never create, edit or delete workspace content.", "")} ${ACTION_INSTRUCTIONS}`
    : CHAT_INSTRUCTIONS;
  const agent = new ToolLoopAgent({
    model,
    instructions: baseInstructions,
    tools,
    stopWhen: () => !!state.searchListing,
    maxRetries: 0,
    onLanguageModelCallStart: async (event) => {
      recordDebugEvent(state, "model.request", {
        usage: { inputTokens: state.inputTokens, outputTokens: state.outputTokens },
        estimator: counter.encoding,
        answerOnly,
        callId: event.callId,
        provider: event.provider,
        model: event.modelId,
        instructions: event.instructions,
        messages: debugModelMessages(event.messages),
        tools: event.tools,
      });
      await changed();
      endModelCall = diagnostics.start("model", { step: state.steps, calls: state.calls });
    },
    onLanguageModelCallEnd: async (event) => {
      state.inputTokens += event.usage.inputTokens ?? 0;
      state.outputTokens += event.usage.outputTokens ?? 0;
      recordDebugEvent(
        state,
        "model.response",
        {
          callId: event.callId,
          model: event.modelId,
          finishReason: event.finishReason,
          usage: event.usage,
          content: event.content
            .map((part) =>
              part.type === "text"
                ? { type: part.type, text: part.text }
                : part.type === "tool-call"
                  ? {
                      type: part.type,
                      toolName: part.toolName,
                      toolCallId: part.toolCallId,
                      input: part.input,
                    }
                  : null,
            )
            .filter(Boolean),
        },
        { durationMs: event.performance.responseTimeMs },
      );
      await changed();
      endModelCall?.({
        outcome: event.finishReason,
        inputTokens: event.usage.inputTokens,
        outputTokens: event.usage.outputTokens,
        reasoningTokens: event.usage.outputTokenDetails?.reasoningTokens,
      });
      endModelCall = undefined;
    },
    prepareStep: async ({ messages }) => {
      signal.throwIfAborted();
      await revalidateReadKnowledge(context, state, options.dependencies);
      const validated = pruneStaleInspections(messages, state);
      messages = validated.messages;
      state.omittedResults += validated.omitted;
      const instructions =
        baseInstructions +
        `\nCurrent request routing: ${JSON.stringify(state.intent)}. Follow this current request even when earlier messages requested a different response. Preserve every requested constraint. Named teamspaces have already been resolved; use those exact IDs. For a source-list request, do not read content. For a content question, search with responseMode=read and then read only the relevant sources.` +
        `\nCurrent UTC time: ${new Date().toISOString()}. Runtime coverage: ${state.context.omissions.join(" ")}`;
      answerOnly = !!state.progress.stopReason;
      if (state.inventoryMessage)
        messages = messages.filter(
          (message) => message.content !== state.inventoryMessage || message.content === state.task,
        );
      const inventory = memoryMessage(
        `Retained read inventory (metadata is not record evidence): ${agentKnowledgeSummary(state)}`,
        true,
      );
      state.inventoryMessage = String(inventory.content);
      // Inventory belongs to context data, so it can be summarized too.
      messages = [inventory, ...messages];
      preparedMessages = await compactConversation(state, messages, {
        model,
        signal,
        count: counter.count,
        window,
        overhead:
          counter.count(instructions) + (answerOnly ? 0 : counter.count(readToolSchemaText)) + 1024,
        changed,
      });
      state.messages = preparedMessages;
      await changed();
      return {
        messages: preparedMessages,
        instructions:
          instructions +
          (answerOnly
            ? " Retrieval stopped making progress. Do not call tools. Answer from available evidence and explain any unfinished work."
            : ""),
        ...(answerOnly
          ? { toolChoice: "none" as const, activeTools: [] }
          : state.continuation
            ? {
                activeTools: [
                  "describe_source",
                  "read_page",
                  "query_records",
                  "read_record",
                  "aggregate_records",
                ] as const,
              }
            : {}),
      };
    },
    onStepEnd: async (step) => {
      diagnostics.event("step", {
        step: state.steps,
        calls: state.calls,
        pendingReads: Object.keys(state.pending).length,
        inputTokens: step.usage.inputTokens,
        outputTokens: step.usage.outputTokens,
      });
      recordDebugEvent(state, "step.completed", {
        usage: step.usage,
        finishReason: step.finishReason,
        toolCalls: step.toolCalls.length,
        omissions: state.context.omissions,
      });
      state.steps++;
      state.messages = [...preparedMessages, ...step.response.messages];
      separator = step.toolCalls.length && step.text ? "\n\n" : "";
      state.committedText += step.text + separator;
      await changed();
    },
  });
  // A replacement worker discards only uncommitted text from the failed step.
  yield { replaceText: state.committedText, context: state.context, progress: state.progress };
  let completed = !!state.searchListing || !!state.intent?.locationIssue;
  try {
    const result =
      state.searchListing || state.intent?.locationIssue
        ? undefined
        : await agent.stream({ messages: state.messages, abortSignal: signal });
    const iterator = result?.stream[Symbol.asyncIterator]();
    const nextPart = () => iterator!.next().then((value) => ({ type: "part" as const, value }));
    let pending = iterator ? nextPart() : undefined;
    while (pending) {
      signal.throwIfAborted();
      while (updates.length) yield updates.shift()!;
      const update = new Promise<{ type: "update" }>((resolve) => {
        wakeUpdates = () => resolve({ type: "update" });
      });
      const item = await Promise.race([pending, update]);
      wakeUpdates = undefined;
      if (item.type === "update") continue;
      if (item.value.done) break;
      const part = item.value.value;
      if (part.type === "text-delta") yield { text: part.text };
      else if (part.type === "finish-step" && separator) {
        yield { text: separator };
        separator = "";
      } else if (part.type === "error")
        throw part.error instanceof Error ? part.error : new Error("CHAT_PROVIDER_FAILED");
      else if (part.type === "finish") {
        if (["error", "other"].includes(part.finishReason))
          throw new Error("CHAT_PROVIDER_INTERRUPTED");
        completed = true;
      }
      pending = nextPart();
    }
  } catch (error) {
    const sourceUnavailable = error instanceof Error && error.message === "CHAT_SOURCE_UNAVAILABLE";
    if (signal.aborted || !sourceUnavailable) {
      recordDebugEvent(state, "run.error", {
        code: signal.aborted ? "RUN_ABORTED" : "GENERATION_FAILED",
      });
      await changed();
      while (updates.length) yield updates.shift()!;
      endModelCall?.({ outcome: "error" });
      endModelCall = undefined;
      throw error;
    }
    state.progress.stopReason = "source_unavailable";
    const text =
      "\n\nA previously inspected source is no longer accessible. Reading stopped. Start a new chat with accessible sources.";
    state.committedText += text;
    await changed();
    yield { text };
    completed = true;
  }
  if (state.intent?.locationIssue && !state.committedText) {
    state.committedText = state.intent.locationIssue;
    await changed();
    yield { text: state.committedText };
  }
  if (state.searchListing && !state.searchListing.emitted) {
    const matches = state.searchListing.matches;
    const label = (title: string) =>
      title.replace(/[\r\n]+/g, " ").replace(/[\\`*_[\]<>]/g, "\\$&");
    const notice = searchAvailabilityNotice(state.searchListing.searchMetadata);
    const listing = matches.length
      ? `Found ${matches.length} matching ${matches.length === 1 ? "source" : "sources"}:\n\n${matches
          .map(
            (match) =>
              `- [${label(match.title) || (match.type === "page" ? "Untitled page" : "Untitled database")}](/${match.type === "page" ? "p" : "d"}/${encodeURIComponent(match.id)})`,
          )
          .join(
            "\n",
          )}\n\nThese are search matches; page contents were not read. Results are bounded.`
      : "No matching pages or databases were returned. Search is bounded, so this does not prove none exist.";
    const text = notice ? (matches.length ? `${notice}\n\n${listing}` : notice) : listing;
    state.committedText += text;
    state.searchListing.emitted = true;
    await changed();
    yield { text };
  }
  if (
    state.continuation &&
    readProgressKey(state) === state.continuation.initialProgress &&
    state.progress.stopReason !== "source_unavailable"
  ) {
    state.progress.stopReason = "no_progress";
    await changed();
  }
  while (updates.length) yield updates.shift()!;
  await saving;
  if (!completed) throw new Error("CHAT_PROVIDER_INTERRUPTED");
  recordDebugEvent(state, "run.completed", {
    steps: state.steps,
    calls: state.calls,
    inputTokens: state.inputTokens,
    outputTokens: state.outputTokens,
    stopReason: state.progress.stopReason,
    outcome: state.context.status,
    usage: { inputTokens: state.inputTokens, outputTokens: state.outputTokens },
    estimator: counter.encoding,
    omissions: state.context.omissions,
  });
  await changed();
  while (updates.length) yield updates.shift()!;
  yield {
    completed: true,
    context: state.context,
    progress: state.progress,
    usage: { inputTokens: state.inputTokens, outputTokens: state.outputTokens },
  };
}
