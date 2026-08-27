import { createOpenAI } from "@ai-sdk/openai";
import { and, eq } from "drizzle-orm";

import { getStringEnv, type RuntimeEnv } from "../config";
import { db } from "../db";
import { workspaceAiProviderConfig } from "../db/schema";
import {
  defaultAiModelForWorkload,
  getAiModelCatalogItem,
  getAiProviderCatalogItem,
  type AiModelCatalogItem,
  type AiWorkload,
} from "./ai-model-catalog";
import {
  decryptAiProviderCredential,
  readEncryptedAiProviderCredential,
} from "./ai-provider-credentials";

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
  envOrApiKey?: RuntimeEnv | string,
  workload: AiWorkload = "chat",
) {
  const env = typeof envOrApiKey === "string"
    ? { OPENAI_API_KEY: envOrApiKey }
    : envOrApiKey ?? {};
  const selection = parseSelectedModelId(selectedModelId, workload);
  const provider = getAiProviderCatalogItem(selection.providerId);
  const catalogModel = getAiModelCatalogItem(provider.id, selection.modelId);
  if (!catalogModel || !catalogModel.workloads.includes(workload)) {
    throw new AiProviderConfigError(
      `AI model ${selection.providerId}:${selection.modelId} is not available for ${workload}.`,
      400,
    );
  }

  const [workspaceConfig] = await db
    .select()
    .from(workspaceAiProviderConfig)
    .where(and(
      eq(workspaceAiProviderConfig.workspaceId, workspaceId),
      eq(workspaceAiProviderConfig.providerId, provider.id),
    ))
    .limit(1);
  if (
    workspaceConfig?.enabled &&
    workspaceConfig.modelIds.length > 0 &&
    !workspaceConfig.modelIds.includes(catalogModel.id)
  ) {
    throw new AiProviderConfigError(
      `AI model ${catalogModel.id} is not enabled for this workspace.`,
      400,
    );
  }
  const encrypted = workspaceConfig
    ? readEncryptedAiProviderCredential(workspaceConfig)
    : null;
  const workspaceCredential = workspaceConfig?.enabled && encrypted
    ? await decryptAiProviderCredential(env, encrypted)
    : "";
  const managedCredential = normalizeApiKey(getStringEnv(env, "OPENAI_API_KEY"));
  const apiKey = workspaceCredential || managedCredential;
  if (!apiKey) {
    throw new AiProviderConfigError("OPENAI_API_KEY or an encrypted workspace credential is required.", 503);
  }

  const baseUrl = validateAiProviderBaseUrl(
    env,
    workspaceConfig?.enabled ? workspaceConfig.baseUrl : undefined,
    provider.baseUrl,
  );
  const openai = createOpenAI({ apiKey, baseURL: baseUrl });
  return {
    catalog: catalogModel,
    credentialSource: workspaceCredential ? "workspace" as const : "managed" as const,
    model: openai.chat(catalogModel.id),
    providerId: provider.id,
  };
}

function parseSelectedModelId(
  selectedModelId: string | undefined,
  workload: AiWorkload,
) {
  if (!selectedModelId || selectedModelId === "auto") {
    const model = defaultAiModelForWorkload(workload);
    if (!model) {
      throw new AiProviderConfigError(`No AI model is configured for ${workload}.`, 503);
    }
    return { modelId: model.id, providerId: model.providerId };
  }

  const separatorIndex = selectedModelId.indexOf(":");
  return separatorIndex === -1
    ? { modelId: selectedModelId, providerId: "openai" }
    : {
        modelId: selectedModelId.slice(separatorIndex + 1),
        providerId: selectedModelId.slice(0, separatorIndex),
      };
}

export const DEFAULT_OPENAI_CHAT_MODEL = "gpt-4o-mini";

export function resolveOpenAiChatModel(
  openAiApiKey?: string,
  selectedModelId?: string,
) {
  const modelId = parseSelectedModelId(selectedModelId, "chat").modelId;
  const apiKey = normalizeApiKey(openAiApiKey);

  if (!apiKey) {
    throw new AiProviderConfigError("OPENAI_API_KEY is required.", 503);
  }

  const provider = createOpenAI({
    apiKey,
  });

  return provider.chat(modelId ?? DEFAULT_OPENAI_CHAT_MODEL);
}

export function validateAiProviderBaseUrl(
  env: RuntimeEnv,
  requested: string | null | undefined,
  fallback: string,
) {
  const value = requested?.trim() || fallback;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AiProviderConfigError("AI provider base URL is invalid.", 400);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new AiProviderConfigError(
      "AI provider base URL must be an HTTPS URL without credentials, query, or fragment.",
      400,
    );
  }

  const normalizeAllowedUrl = (entry: string) => {
    const parsed = new URL(entry);
    return parsed.toString().replace(/\/$/, "");
  };
  const allowed = new Set([
    normalizeAllowedUrl(fallback),
    ...(getStringEnv(env, "AI_PROVIDER_ALLOWED_BASE_URLS") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .flatMap((entry) => {
        try { return [normalizeAllowedUrl(entry)]; } catch { return []; }
      }),
  ]);
  const normalizedValue = url.toString().replace(/\/$/, "");
  if (!allowed.has(normalizedValue)) {
    throw new AiProviderConfigError("AI provider base URL is not allowlisted.", 400);
  }
  return normalizedValue;
}

export type ResolvedAiModel = {
  catalog: AiModelCatalogItem;
  credentialSource: "managed" | "workspace";
  model: ReturnType<ReturnType<typeof createOpenAI>["chat"]>;
  providerId: "openai";
};

function normalizeApiKey(apiKey?: string) {
  return apiKey?.trim().replace(/^Bearer(?:\s+|$)/i, "") ?? "";
}
