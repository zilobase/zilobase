import type { ModelMessage } from "ai";

import { lastMatchingIndex } from "./last-matching-index";

const DEFAULT_RESERVED_TOKENS = 4_096;
const MAX_RECENT_MESSAGES = 12;

export function composeBoundedAgentMessages(input: {
  context: ModelMessage[];
  contextWindowTokens: number;
  history: ModelMessage[];
  maxOutputTokens: number;
  summary?: string | null;
  system: string;
}) {
  const inputBudget = Math.max(
    4_000,
    input.contextWindowTokens - input.maxOutputTokens - DEFAULT_RESERVED_TOKENS,
  );
  const systemTokens = estimateTextTokens(input.system);
  const summaryMessage: ModelMessage[] = input.summary
    ? [{
        content: `Compact thread summary (older durable messages only):\n${input.summary}`,
        role: "user",
      }]
    : [];
  const summaryTokens = estimateMessagesTokens(summaryMessage);
  const latestUserIndex = lastMatchingIndex(input.history,
    (message) => message.role === "user",
  );
  const latest = latestUserIndex >= 0
    ? input.history.slice(latestUserIndex)
    : input.history.slice(-1);
  const older = latestUserIndex >= 0
    ? input.history.slice(0, latestUserIndex)
    : input.history.slice(0, -1);
  const latestTokens = estimateMessagesTokens(latest);
  const availableForContext = Math.max(
    1_000,
    inputBudget - systemTokens - latestTokens - summaryTokens,
  );
  const context = fitContextMessages(input.context, availableForContext);
  let remaining = inputBudget - systemTokens - latestTokens - summaryTokens - estimateMessagesTokens(context);
  const recent: ModelMessage[] = [];

  for (
    let index = older.length - 1;
    index >= 0 && recent.length < MAX_RECENT_MESSAGES;
    index -= 1
  ) {
    const message = older[index]!;
    const tokens = estimateMessageTokens(message);
    if (tokens > remaining) break;
    recent.unshift(message);
    remaining -= tokens;
  }

  return [...summaryMessage, ...recent, ...context, ...latest];
}

export function estimateMessagesTokens(messages: ModelMessage[]) {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
}

function fitContextMessages(messages: ModelMessage[], tokenBudget: number) {
  const output: ModelMessage[] = [];
  let remaining = tokenBudget;
  for (const message of messages) {
    const tokens = estimateMessageTokens(message);
    if (tokens <= remaining) {
      output.push(message);
      remaining -= tokens;
      continue;
    }
    if (remaining < 128 || typeof message.content !== "string") break;
    const maxChars = Math.max(0, (remaining - 32) * 4);
    output.push({
      ...message,
      content: `${message.content.slice(0, maxChars).trimEnd()}\n[Context truncated to model budget]`,
    } as ModelMessage);
    break;
  }
  return output;
}

function estimateMessageTokens(message: ModelMessage) {
  if (typeof message.content === "string") {
    return 8 + estimateTextTokens(message.content);
  }
  return 8 + message.content.reduce((total, part) => {
    if (part.type === "text") return total + estimateTextTokens(part.text);
    if (part.type === "file" || part.type === "image") return total + 2_000;
    return total + 64;
  }, 0);
}

function estimateTextTokens(value: string) {
  return Math.ceil(value.length / 4);
}
