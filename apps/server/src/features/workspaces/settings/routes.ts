import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import { workspaceAiProviderConfig } from "../../../infrastructure/database/schema";
import { isPrivilegedOrgRole } from "../../access";
import { encryptAiProviderCredential } from "../../ai/providers/ai-provider-credentials";
import { AiProviderConfigError, validateAiProviderBaseUrl } from "../../ai/providers/ai-provider";
import { getStringEnv } from "../../../shared/config/config";
import type { AppBindings } from "../../../shared/types";
import {
  getAiProviderConfig,
  getCatalogItem,
  listAiProviderConfigs,
  providerCatalog,
} from "./ai-providers";
import { requireActiveWorkspace } from "./shared";

export const workspaceSettingsRoutes = new Hono<AppBindings>();

workspaceSettingsRoutes.get("/ai", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  return c.json({ providers: await listAiProviderConfigs(auth.workspaceId) });
});

workspaceSettingsRoutes.get("/ai/models", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  const providers = await listAiProviderConfigs(auth.workspaceId);

  return c.json({
    models: [
      {
        chef: "Zilobase",
        chefSlug: "openai",
        description: "Uses the best enabled workspace model for this task.",
        gatewayId: "auto",
        id: "auto",
        name: "Auto",
        providers: ["openai"],
      },
      ...providers.flatMap((config) => {
        const provider = getCatalogItem(config.providerId);

        const managedCredentialAvailable = provider.id === "openai" &&
          Boolean(getStringEnv(c.env, "OPENAI_API_KEY")?.trim());
        if (
          !config.enabled ||
          (provider.requiresApiKey && !config.apiKeyConfigured && !managedCredentialAvailable)
        ) {
          return [];
        }

        const modelIds = config.modelIds.length
          ? config.modelIds
          : provider.models.map((model) => model.id);

        return modelIds.map((modelId) => ({
          chef: provider.name,
          chefSlug: provider.id,
          description: "Workspace chat, tools, files, and structured answers.",
          gatewayId: `${provider.id}:${modelId}`,
          id: `${provider.id}:${modelId}`,
          name: provider.models.find((model) => model.id === modelId)?.name ?? modelId,
          providers: [provider.id],
        }));
      }),
    ],
  });
});

workspaceSettingsRoutes.put("/ai/providers/:providerId", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  if (!isPrivilegedOrgRole(auth.membership.role)) {
    return c.json({ message: "Only workspace owners and admins can configure AI providers." }, 403);
  }

  const providerId = c.req.param("providerId");
  const provider = providerCatalog.find((item) => item.id === providerId);

  if (!provider) {
    return c.json({ message: "Unknown AI provider." }, 404);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    apiKey?: string;
    baseUrl?: string;
    enabled?: boolean;
    modelIds?: string[];
  };
  const now = new Date();
  const existing = await getAiProviderConfig(auth.workspaceId, providerId);
  const requestedModelIds = Array.isArray(body.modelIds)
    ? [...new Set(body.modelIds.filter((modelId) =>
        provider.models.some((model) => model.id === modelId)
      ))]
    : provider.models.map((model) => model.id);
  if (Array.isArray(body.modelIds) && requestedModelIds.length !== body.modelIds.length) {
    return c.json({ message: "One or more requested AI models are not in the server catalog." }, 400);
  }

  let encrypted = existing
    ? {
        ciphertext: existing.credentialCiphertext,
        fingerprint: existing.credentialFingerprint,
        iv: existing.credentialIv,
        keyVersion: existing.credentialKeyVersion,
      }
    : null;
  try {
    if (typeof body.apiKey === "string" && body.apiKey.trim()) {
      encrypted = await encryptAiProviderCredential(c.env, body.apiKey);
    }
  } catch (error) {
    const status = error instanceof Error && "status" in error
      ? Number((error as { status: number }).status)
      : 503;
    return c.json(
      { message: error instanceof Error ? error.message : "Failed to encrypt AI credential." },
      status === 400 ? 400 : 503,
    );
  }

  let baseUrl: string;
  try {
    baseUrl = validateAiProviderBaseUrl(c.env, body.baseUrl, provider.baseUrl);
  } catch (error) {
    return c.json(
      { message: error instanceof AiProviderConfigError ? error.message : "Invalid provider URL." },
      400,
    );
  }
  const values = {
    apiKey: existing?.apiKey ?? null,
    baseUrl,
    credentialCiphertext: encrypted?.ciphertext ?? null,
    credentialFingerprint: encrypted?.fingerprint ?? null,
    credentialIv: encrypted?.iv ?? null,
    credentialKeyVersion: encrypted?.keyVersion ?? null,
    enabled: Boolean(body.enabled),
    modelIds: requestedModelIds,
    updatedAt: now,
  };

  if (existing) {
    await db
      .update(workspaceAiProviderConfig)
      .set(values)
      .where(eq(workspaceAiProviderConfig.id, existing.id));
  } else {
    await db.insert(workspaceAiProviderConfig).values({
      id: crypto.randomUUID(),
      workspaceId: auth.workspaceId,
      providerId,
      createdAt: now,
      ...values,
    });
  }

  return c.json({ providers: await listAiProviderConfigs(auth.workspaceId) });
});
