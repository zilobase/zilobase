import { streamText, type ModelMessage } from "ai";
import type { BuildContextResult } from "@zilobase/page-context";
import type { ChatDebugEvent, ChatReadProgress } from "@zilobase/features/runtime";
import type { AgentState } from "./agent-state";
import { generateReadAgent, type AgentPersistence } from "./agent";
import { z } from "zod";
import { configuredChatModel, CHAT_INSTRUCTIONS } from "./chat";
import { getStringEnv } from "../../shared/config/config";
import type { ServerOperationContext } from "../operations/context";

export type ProviderInput = {
  messages: ModelMessage[];
  agent?: AgentState;
  maxOutputTokens?: number;
  instructions?: string;
  model?: string;
};
export type ProviderCursor = { responseId?: string | null; cursor?: number | null };
export type ProviderChunk = ProviderCursor & {
  text?: string;
  replaceText?: string;
  context?: BuildContextResult;
  progress?: ChatReadProgress;
  debug?: { events: ChatDebugEvent[]; omitted: number };
  checkpoint?: AgentState;
  completed?: boolean;
  usage?: { inputTokens?: number; outputTokens?: number };
};

/** Background mode is an explicit deployment capability, never a model substitution. */
export function backgroundProviderEnabled(env: Record<string, unknown>) {
  return env.AI_PROVIDER_BACKGROUND_ENABLED === "true";
}

export async function* generateChatOutput(
  context: ServerOperationContext,
  input: ProviderInput,
  signal: AbortSignal,
  recovery: ProviderCursor = {},
  transport: typeof fetch = fetch,
  persistence?: AgentPersistence,
): AsyncGenerator<ProviderChunk> {
  if (input.agent) {
    yield* generateReadAgent(
      input.model ? { ...context, env: { ...context.env, AI_MODEL: input.model } } : context,
      input.agent,
      signal,
      { transport, persistence },
    );
    return;
  }
  const background = backgroundProviderEnabled(context.env);
  if (recovery.responseId) {
    if (!background) throw new Error("CHAT_PROVIDER_RESUME_UNAVAILABLE");
    yield* resumeChatOutput(context, signal, recovery, transport);
    return;
  }
  const providerFetch: typeof fetch = background
    ? (url, init) =>
        transport(url, {
          ...init,
          // The installed OpenAI provider has no typed background option yet.
          // Its supported fetch port adds this field without replacing SDK streaming.
          body: JSON.stringify({
            ...JSON.parse(String(init?.body)),
            background: true,
            store: false,
          }),
        })
    : transport;
  const modelContext = input.model
    ? { ...context, env: { ...context.env, AI_MODEL: input.model } }
    : context;
  const result = streamText({
    model: configuredChatModel(modelContext, providerFetch),
    instructions: input.instructions ?? CHAT_INSTRUCTIONS,
    messages: input.messages,
    abortSignal: signal,
    maxRetries: 0,
    ...(background ? { include: { rawChunks: true } } : {}),
    // Provider errors are surfaced below without logging source documents.
    onError: () => {},
  });
  let cursor: ProviderCursor = {};
  let pendingText: ProviderChunk | undefined;
  let terminalCursor: ProviderCursor | undefined;
  let completed = false;
  for await (const part of result.stream) {
    signal.throwIfAborted();
    if (part.type === "raw" && background) {
      if (pendingText) throw new Error("CHAT_PROVIDER_TEXT_UNCHECKPOINTED");
      const event = parseProviderEvent(part.rawValue);
      const next = providerEventChunk(event, cursor);
      if (!next) continue;
      cursor = { responseId: next.responseId, cursor: next.cursor };
      if (event.type === "response.output_text.delta") pendingText = next;
      else if (event.type === "response.completed") terminalCursor = cursor;
      else yield cursor;
    } else if (part.type === "text-delta") {
      if (background) {
        if (!pendingText || pendingText.text !== part.text)
          throw new Error("CHAT_PROVIDER_TEXT_CURSOR_MISMATCH");
        // Never checkpoint a text event's cursor before its SDK text delta.
        yield { ...pendingText, text: part.text };
        pendingText = undefined;
      } else yield { text: part.text };
    } else if (part.type === "error") throw new Error("CHAT_PROVIDER_FAILED");
    else if (part.type === "finish") {
      if (
        (background && (!terminalCursor || pendingText)) ||
        ["error", "other"].includes(part.finishReason)
      )
        throw new Error("CHAT_PROVIDER_INTERRUPTED");
      completed = true;
      yield {
        ...terminalCursor,
        completed: true,
        usage: {
          inputTokens: part.totalUsage.inputTokens,
          outputTokens: part.totalUsage.outputTokens,
        },
      };
    }
  }
  signal.throwIfAborted();
  if (!completed) throw new Error("CHAT_PROVIDER_INTERRUPTED");
}

const providerEventSchema = z.object({
  type: z.string(),
  sequence_number: z.number().int().nonnegative().safe(),
  delta: z.string().optional(),
  response: z
    .object({
      id: z.string().min(1).optional(),
      usage: z
        .object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() })
        .nullish(),
    })
    .optional(),
});
type ProviderEvent = z.infer<typeof providerEventSchema>;
function parseProviderEvent(value: unknown): ProviderEvent {
  const parsed = providerEventSchema.safeParse(value);
  if (!parsed.success) throw new Error("CHAT_PROVIDER_EVENT_INVALID");
  return parsed.data;
}
function providerEventChunk(event: ProviderEvent, previous: ProviderCursor): ProviderChunk | null {
  if (event.sequence_number <= (previous.cursor ?? -1)) return null;
  const responseId = event.response?.id ?? previous.responseId;
  if (!responseId) throw new Error("CHAT_PROVIDER_RESPONSE_ID_MISSING");
  if (
    ["response.failed", "response.incomplete", "error", "response.cancelled"].includes(event.type)
  )
    throw new Error("CHAT_PROVIDER_FAILED");
  if (event.type === "response.output_text.delta" && event.delta === undefined)
    throw new Error("CHAT_PROVIDER_TEXT_INVALID");
  return {
    responseId,
    cursor: event.sequence_number,
    ...(event.type === "response.output_text.delta" ? { text: event.delta } : {}),
    ...(event.type === "response.completed"
      ? {
          completed: true,
          usage: {
            inputTokens: event.response?.usage?.input_tokens,
            outputTokens: event.response?.usage?.output_tokens,
          },
        }
      : {}),
  };
}

/** Reattach the original response; streamText must never issue a second POST here. */
async function* resumeChatOutput(
  context: ServerOperationContext,
  signal: AbortSignal,
  recovery: ProviderCursor,
  transport: typeof fetch,
): AsyncGenerator<ProviderChunk> {
  const key = getStringEnv(context.env, "OPENAI_API_KEY");
  if (!key) throw new Error("CHAT_PROVIDER_KEY_REQUIRED");
  const response = await transport(
    `https://api.openai.com/v1/responses/${encodeURIComponent(recovery.responseId!)}?stream=true&starting_after=${recovery.cursor ?? -1}`,
    { method: "GET", signal, headers: { Authorization: `Bearer ${key}` } },
  );
  if (!response.ok || !response.body) throw new Error(`CHAT_PROVIDER_HTTP_${response.status}`);
  let cursor = recovery;
  let completed = false;
  for await (const event of readProviderEvents(response.body, signal)) {
    const chunk = providerEventChunk(event, cursor);
    if (!chunk) continue;
    cursor = { responseId: chunk.responseId, cursor: chunk.cursor };
    completed = !!chunk.completed;
    yield chunk;
    if (completed) return;
  }
  if (!completed) throw new Error("CHAT_PROVIDER_INTERRUPTED");
}

export async function cancelProviderResponse(context: ServerOperationContext, responseId: string) {
  const response = await fetch(
    `https://api.openai.com/v1/responses/${encodeURIComponent(responseId)}/cancel`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${getStringEnv(context.env, "OPENAI_API_KEY")}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok && response.status !== 409) throw new Error("CHAT_PROVIDER_CANCEL_FAILED");
}

async function* readProviderEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<ProviderEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, "\n");
      if (buffer.length > 2_000_000) throw new Error("CHAT_PROVIDER_EVENT_TOO_LARGE");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data && data !== "[DONE]") yield parseProviderEvent(JSON.parse(data));
      }
      if (done) break;
    }
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
