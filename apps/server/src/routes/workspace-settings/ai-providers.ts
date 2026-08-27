import { and, eq } from "drizzle-orm";

import { db } from "../../db";
import { workspaceAiProviderConfig } from "../../db/schema";
import {
  aiProviderCatalog,
  getAiProviderCatalogItem,
  type AiProviderCatalogItem,
} from "../../ai/ai-model-catalog";

export const providerCatalog: AiProviderCatalogItem[] = aiProviderCatalog;

export async function listAiProviderConfigs(workspaceId: string) {
  const rows = await db
    .select()
    .from(workspaceAiProviderConfig)
    .where(eq(workspaceAiProviderConfig.workspaceId, workspaceId));
  const byProvider = new Map(rows.map((row) => [row.providerId, row]));

  return providerCatalog.map((provider) => {
    const row = byProvider.get(provider.id);

    return {
      apiKeyConfigured: Boolean(row?.credentialCiphertext),
      credentialFingerprint: row?.credentialFingerprint ?? null,
      legacyCredentialRequiresRotation: Boolean(row?.apiKey && !row.credentialCiphertext),
      baseUrl: row?.baseUrl ?? provider.baseUrl,
      enabled: row?.enabled ?? true,
      modelIds: Array.isArray(row?.modelIds)
        ? row.modelIds
        : provider.models.map((model) => model.id),
      provider,
      providerId: provider.id,
      updatedAt: row?.updatedAt?.toISOString(),
    };
  });
}

export async function getAiProviderConfig(
  workspaceId: string,
  providerId: string,
) {
  const [row] = await db
    .select()
    .from(workspaceAiProviderConfig)
    .where(
      and(
        eq(workspaceAiProviderConfig.workspaceId, workspaceId),
        eq(workspaceAiProviderConfig.providerId, providerId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export function getCatalogItem(providerId: string) {
  return getAiProviderCatalogItem(providerId);
}
