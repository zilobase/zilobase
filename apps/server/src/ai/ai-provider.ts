import { createOpenAI } from "@ai-sdk/openai";

export class AiProviderConfigError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AiProviderConfigError";
    this.status = status;
  }
}

export async function resolveWorkspaceAiModel(
  workspaceId: string,
  selectedModelId?: string,
  openAiApiKey?: string,
) {
  const { modelId } = parseSelectedModelId(selectedModelId);

  return resolveOpenAiChatModel(openAiApiKey, modelId);
}

function parseSelectedModelId(selectedModelId?: string) {
  if (!selectedModelId) {
    return { modelId: DEFAULT_OPENAI_CHAT_MODEL };
  }

  const separatorIndex = selectedModelId.indexOf(":");
  return separatorIndex === -1
    ? { modelId: selectedModelId }
    : { modelId: selectedModelId.slice(separatorIndex + 1) };
}

export const DEFAULT_OPENAI_CHAT_MODEL = "gpt-4o-mini";

export function resolveOpenAiChatModel(
  openAiApiKey?: string,
  selectedModelId?: string,
) {
  const modelId = parseSelectedModelId(selectedModelId).modelId;
  const apiKey = normalizeApiKey(openAiApiKey);

  if (!apiKey) {
    throw new AiProviderConfigError("OPENAI_API_KEY is required.", 503);
  }

  const provider = createOpenAI({
    apiKey,
  });

  return provider.chat(modelId ?? DEFAULT_OPENAI_CHAT_MODEL);
}

function normalizeApiKey(apiKey?: string) {
  return apiKey?.trim().replace(/^Bearer(?:\s+|$)/i, "") ?? "";
}
