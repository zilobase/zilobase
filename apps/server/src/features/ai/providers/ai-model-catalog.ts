export type AiWorkload =
  | "chat"
  | "editor"
  | "embedding"
  | "meeting-summary"
  | "realtime-transcription";

export type AiModelCatalogItem = {
  contextWindowTokens: number;
  id: string;
  maxOutputTokens: number;
  name: string;
  providerId: "openai";
  supportsFiles: boolean;
  supportsStructuredOutput: boolean;
  supportsTools: boolean;
  workloads: AiWorkload[];
};

export type AiProviderCatalogItem = {
  baseUrl: string;
  id: "openai";
  kind: "openai";
  models: AiModelCatalogItem[];
  name: string;
  requiresApiKey: true;
};

const openAiModels: AiModelCatalogItem[] = [
  {
    contextWindowTokens: 128_000,
    id: "gpt-4o-mini",
    maxOutputTokens: 16_384,
    name: "GPT-4o Mini",
    providerId: "openai",
    supportsFiles: true,
    supportsStructuredOutput: true,
    supportsTools: true,
    workloads: ["chat", "editor", "meeting-summary"],
  },
  {
    contextWindowTokens: 128_000,
    id: "gpt-4o",
    maxOutputTokens: 16_384,
    name: "GPT-4o",
    providerId: "openai",
    supportsFiles: true,
    supportsStructuredOutput: true,
    supportsTools: true,
    workloads: ["chat", "editor", "meeting-summary"],
  },
];

export const aiProviderCatalog: AiProviderCatalogItem[] = [{
  baseUrl: "https://api.openai.com/v1",
  id: "openai",
  kind: "openai",
  models: openAiModels,
  name: "OpenAI",
  requiresApiKey: true,
}];

export function getAiProviderCatalogItem(providerId: string) {
  const provider = aiProviderCatalog.find((item) => item.id === providerId);
  if (!provider) throw new Error(`Unknown AI provider: ${providerId}`);
  return provider;
}

export function getAiModelCatalogItem(providerId: string, modelId: string) {
  return getAiProviderCatalogItem(providerId).models.find(
    (model) => model.id === modelId,
  ) ?? null;
}

export function defaultAiModelForWorkload(workload: AiWorkload) {
  return openAiModels.find((model) => model.workloads.includes(workload)) ?? null;
}
