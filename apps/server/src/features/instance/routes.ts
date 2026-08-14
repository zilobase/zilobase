import { Hono, type Context } from "hono";
import { z } from "zod";

import { getMembership } from "../../access";
import { isSelfHostedRuntime } from "../../runtime-adapter";
import type { AppBindings } from "../../types";
import {
  BootstrapAlreadyCompletedError,
  BootstrapStateConflictError,
  bootstrapSelfHostedInstance,
  canManageInstanceSettings,
  getInstanceAdministrationSettings,
  InvalidBootstrapTokenError,
  updateInstanceAdministrationSettings,
} from "./registration";
import { getZilobaseDiscoveryDocument } from "./service";

export const instanceRoutes = new Hono<AppBindings>();

const bootstrapSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(128),
  workspaceName: z.string().trim().min(1).max(120),
});

const instanceSettingsUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100).optional(),
    registrationMode: z.enum(["invite-only", "open"]).optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined || value.registrationMode !== undefined,
    "Provide at least one setting to update.",
  );

instanceRoutes.get("/.well-known/zilobase", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(await getZilobaseDiscoveryDocument(c.env));
});

instanceRoutes.post("/api/instance/bootstrap", async (c) => {
  if (!isSelfHostedRuntime()) {
    return c.json({ error: "Not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = bootstrapSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid bootstrap request." },
      400,
    );
  }

  try {
    const result = await bootstrapSelfHostedInstance(
      c.env,
      readBootstrapToken(c.req.raw.headers),
      parsed.data,
    );
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof InvalidBootstrapTokenError) {
      return c.json({ error: error.message }, 401);
    }

    if (
      error instanceof BootstrapAlreadyCompletedError ||
      error instanceof BootstrapStateConflictError
    ) {
      return c.json({ error: error.message }, 409);
    }

    throw error;
  }
});

instanceRoutes.get("/api/instance/settings", async (c) => {
  const access = await requireSelfHostedOwner(c);

  if (access instanceof Response) {
    return access;
  }

  return c.json({ settings: access.settings });
});

instanceRoutes.patch("/api/instance/settings", async (c) => {
  const access = await requireSelfHostedOwner(c);

  if (access instanceof Response) {
    return access;
  }

  const body = await c.req.json().catch(() => null);
  const parsed = instanceSettingsUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid settings request." },
      400,
    );
  }

  const settings = await updateInstanceAdministrationSettings(parsed.data);
  return c.json({ settings: { ...access.settings, ...settings } });
});

async function requireSelfHostedOwner(c: Context<AppBindings>) {
  if (!isSelfHostedRuntime()) {
    return c.json({ error: "Not found" }, 404);
  }

  const requestUser = c.get("user");

  if (!requestUser || c.get("authMethod") !== "session") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const settings = await getInstanceAdministrationSettings(c.env);

  if (!settings.pinnedWorkspaceId) {
    return c.json({ error: "Instance bootstrap is incomplete." }, 409);
  }

  const membership = await getMembership(
    settings.pinnedWorkspaceId,
    requestUser.id,
  );

  if (!canManageInstanceSettings(membership?.role)) {
    return c.json(
      {
        error:
          "Only the self-hosted instance owner can change server settings.",
      },
      403,
    );
  }

  return { settings };
}

function readBootstrapToken(headers: Headers) {
  const explicitToken = headers.get("x-zilobase-bootstrap-token")?.trim();

  if (explicitToken) {
    return explicitToken;
  }

  const authorization = headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}
