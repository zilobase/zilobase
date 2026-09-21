import { Hono, type Context } from "hono";
import { Schema, SchemaTransformation } from "effect";

import { getMembership } from "../access";
import { isCommunityRegistration } from "../../shared/app-policy";
import type { AppBindings } from "../../shared/types";
import { parseJsonBody } from "../../shared/http/schema-json";
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

const BootstrapInput = Schema.Struct({
  email: Schema.String.pipe(
    Schema.decode(SchemaTransformation.trim()),
    Schema.check(
      Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
        message: "Invalid email",
      }),
      Schema.isMaxLength(320),
    ),
  ),
  name: Schema.String.pipe(
    Schema.decode(SchemaTransformation.trim()),
    Schema.check(
      Schema.isMinLength(1, { message: "Name is required." }),
      Schema.isMaxLength(100),
    ),
  ),
  password: Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(8, { message: "Password must be at least 8 characters." }),
      Schema.isMaxLength(128),
    ),
  ),
  workspaceName: Schema.String.pipe(
    Schema.decode(SchemaTransformation.trim()),
    Schema.check(
      Schema.isMinLength(1, { message: "Workspace name is required." }),
      Schema.isMaxLength(120),
    ),
  ),
});

const InstanceSettingsUpdate = Schema.Struct({
  displayName: Schema.optionalKey(
    Schema.String.pipe(
      Schema.decode(SchemaTransformation.trim()),
      Schema.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    ),
  ),
  registrationMode: Schema.optionalKey(
    Schema.Literals(["invite-only", "open"]),
  ),
}).check(
  Schema.makeFilter((value) =>
    value.displayName !== undefined || value.registrationMode !== undefined
      ? undefined
      : "Provide at least one setting to update.",
  ),
);

instanceRoutes.get("/.well-known/zilobase", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(
    await getZilobaseDiscoveryDocument(c.env, undefined, {
      editionExtension: c.get("editionExtension") ?? undefined,
    }),
  );
});

instanceRoutes.post("/api/instance/bootstrap", async (c) => {
  if (!isCommunityRegistration(c.get("appPolicy"))) {
    return c.json({ error: "Not found" }, 404);
  }

  const parsed = await parseJsonBody(c.req, BootstrapInput);

  if (!parsed.ok) {
    return c.json(
      { error: parsed.message || "Invalid bootstrap request." },
      400,
    );
  }

  try {
    const result = await bootstrapSelfHostedInstance(
      c.env,
      readBootstrapToken(c.req.raw.headers),
      parsed.data,
      undefined,
      { editionExtension: c.get("editionExtension") ?? undefined },
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

  const parsed = await parseJsonBody(c.req, InstanceSettingsUpdate);

  if (!parsed.ok) {
    return c.json(
      { error: parsed.message || "Invalid settings request." },
      400,
    );
  }

  const settings = await updateInstanceAdministrationSettings(parsed.data);
  return c.json({ settings: { ...access.settings, ...settings } });
});

async function requireSelfHostedOwner(c: Context<AppBindings>) {
  if (!isCommunityRegistration(c.get("appPolicy"))) {
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
