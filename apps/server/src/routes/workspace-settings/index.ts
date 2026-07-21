import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../../db";
import { workspaceAiProviderConfig } from "../../db/schema";
import type { AppBindings } from "../../types";
import {
  getAiProviderConfig,
  getCatalogItem,
  listAiProviderConfigs,
  providerCatalog,
} from "./ai-providers";
import { requireActiveWorkspace } from "./shared";
import { workspaceIntegrationRoutes } from "./integrations";

export const workspaceSettingsRoutes = new Hono<AppBindings>();

workspaceSettingsRoutes.route("/", workspaceIntegrationRoutes);

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
    models: providers.flatMap((config) => {
      const provider = getCatalogItem(config.providerId);

      if (!config.enabled || (provider.requiresApiKey && !config.apiKeyConfigured)) {
        return [];
      }

      const modelIds = config.modelIds.length
        ? config.modelIds
        : provider.models.map((model) => model.id);

      return modelIds.map((modelId) => ({
        chef: provider.name,
        chefSlug: provider.id,
        gatewayId: `${provider.id}:${modelId}`,
        id: `${provider.id}:${modelId}`,
        name: provider.models.find((model) => model.id === modelId)?.name ?? modelId,
        providers: [provider.id],
      }));
    }),
  });
});

workspaceSettingsRoutes.put("/ai/providers/:providerId", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
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
  const values = {
    apiKey:
      typeof body.apiKey === "string" && body.apiKey.trim()
        ? body.apiKey.trim()
        : existing?.apiKey ?? null,
    baseUrl:
      typeof body.baseUrl === "string" ? body.baseUrl.trim() : provider.baseUrl ?? "",
    enabled: Boolean(body.enabled),
    modelIds: Array.isArray(body.modelIds) ? body.modelIds : provider.models.map((model) => model.id),
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
