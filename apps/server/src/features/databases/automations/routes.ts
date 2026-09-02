import { Hono, type Context } from "hono";

import {
  createDatabaseAutomationRequestSchema,
  updateDatabaseAutomationRequestSchema,
  validateDatabaseAutomationRequestSchema,
} from "@zilobase/features/databases/automations";

import type { AppBindings } from "../../../shared/types";
import { requireDatabaseRouteUser } from "../route-support";
import {
  createDatabaseAutomation,
  DatabaseAutomationError,
  deleteDatabaseAutomation,
  duplicateDatabaseAutomation,
  getDatabaseAutomation,
  getDatabaseAutomationCatalog,
  listDatabaseAutomations,
  setDatabaseAutomationPaused,
  updateDatabaseAutomation,
  validateDatabaseAutomation,
} from "./service";

export const databaseAutomationRoutes = new Hono<AppBindings>();

databaseAutomationRoutes.get("/:databaseId/automations", async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const dataSourceId = c.req.query("dataSourceId")?.trim();
  if (!dataSourceId) return c.json({ code: "AUTOMATION_SOURCE_REQUIRED", error: "dataSourceId is required" }, 400);

  return handle(c, () => listDatabaseAutomations({
    databaseId: c.req.param("databaseId"),
    dataSourceId,
    userId: user.id,
  }));
});

databaseAutomationRoutes.post("/:databaseId/automations/validate", async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const parsed = validateDatabaseAutomationRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return invalidBody(c, parsed.error.issues);

  return handle(c, () => validateDatabaseAutomation({
    databaseId: c.req.param("databaseId"),
    dataSourceId: parsed.data.dataSourceId,
    definition: parsed.data.definition,
    userId: user.id,
  }));
});

databaseAutomationRoutes.post("/:databaseId/automations", async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const parsed = createDatabaseAutomationRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return invalidBody(c, parsed.error.issues);
  const idempotencyKey = requireIdempotencyKey(c.req.header("Idempotency-Key"), parsed.data.idempotencyKey);
  if (!idempotencyKey.ok) return c.json(idempotencyKey.error, 400);

  return handle(c, async () => {
    const result = await createDatabaseAutomation({
      body: { ...parsed.data, idempotencyKey: idempotencyKey.value },
      databaseId: c.req.param("databaseId"),
      editionExtension: c.get("editionExtension") ?? undefined,
      userId: user.id,
    });
    return c.json(result.automation, result.created ? 201 : 200);
  }, true);
});

databaseAutomationRoutes.get("/:databaseId/automations/:automationId", async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return handle(c, () => getDatabaseAutomation({
    automationId: c.req.param("automationId"),
    databaseId: c.req.param("databaseId"),
    userId: user.id,
  }));
});

databaseAutomationRoutes.patch("/:databaseId/automations/:automationId", async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const expectedVersion = parseIfMatch(c.req.header("If-Match"));
  if (expectedVersion === null) {
    return c.json({ code: "AUTOMATION_IF_MATCH_REQUIRED", error: "If-Match must contain the current revision version" }, 428);
  }
  const parsed = updateDatabaseAutomationRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return invalidBody(c, parsed.error.issues);
  return handle(c, () => updateDatabaseAutomation({
    automationId: c.req.param("automationId"),
    body: parsed.data,
    databaseId: c.req.param("databaseId"),
    editionExtension: c.get("editionExtension") ?? undefined,
    expectedVersion,
    userId: user.id,
  }));
});

for (const [path, paused] of [["pause", true], ["resume", false]] as const) {
  databaseAutomationRoutes.post(`/:databaseId/automations/:automationId/${path}`, async (c) => {
    const user = requireDatabaseRouteUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    return handle(c, () => setDatabaseAutomationPaused({
      automationId: c.req.param("automationId"),
      databaseId: c.req.param("databaseId"),
      editionExtension: c.get("editionExtension") ?? undefined,
      paused,
      userId: user.id,
    }));
  });
}

databaseAutomationRoutes.post("/:databaseId/automations/:automationId/duplicate", async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const idempotencyKey = c.req.header("Idempotency-Key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return c.json({ code: "AUTOMATION_IDEMPOTENCY_KEY_REQUIRED", error: "A valid Idempotency-Key header is required" }, 400);
  }
  return handle(c, async () => {
    const result = await duplicateDatabaseAutomation({
      automationId: c.req.param("automationId"),
      databaseId: c.req.param("databaseId"),
      editionExtension: c.get("editionExtension") ?? undefined,
      idempotencyKey,
      userId: user.id,
    });
    return c.json(result.automation, result.created ? 201 : 200);
  }, true);
});

databaseAutomationRoutes.delete("/:databaseId/automations/:automationId", async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return handle(c, () => deleteDatabaseAutomation({
    automationId: c.req.param("automationId"),
    databaseId: c.req.param("databaseId"),
    editionExtension: c.get("editionExtension") ?? undefined,
    userId: user.id,
  }));
});

databaseAutomationRoutes.get("/:databaseId/automation-catalog", async (c) => {
  const user = requireDatabaseRouteUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const dataSourceId = c.req.query("dataSourceId")?.trim();
  if (!dataSourceId) return c.json({ code: "AUTOMATION_SOURCE_REQUIRED", error: "dataSourceId is required" }, 400);
  return handle(c, () => getDatabaseAutomationCatalog({
    databaseId: c.req.param("databaseId"),
    dataSourceId,
    userId: user.id,
  }));
});

async function handle(
  c: Context<AppBindings>,
  callback: () => Promise<unknown>,
  callbackReturnsResponse = false,
) {
  try {
    const result = await callback();
    return callbackReturnsResponse ? result as any : c.json(result as any);
  } catch (error) {
    if (error instanceof DatabaseAutomationError) {
      return c.json(
        {
          code: error.code,
          error: error.message,
          ...(error.validation ? { validation: error.validation } : {}),
        },
        error.status,
      );
    }
    throw error;
  }
}

function invalidBody(c: Context<AppBindings>, issues: Array<{ message: string; path: PropertyKey[] }>) {
  return c.json({
    code: "AUTOMATION_INVALID_REQUEST",
    error: "Request body is invalid",
    validation: {
      errors: issues.map((issue) => ({
        code: "invalid_request",
        message: issue.message,
        path: issue.path.map(String),
      })),
      valid: false,
      warnings: [],
    },
  }, 400);
}

function requireIdempotencyKey(header: string | undefined, body: string) {
  const value = header?.trim();
  if (!value || value.length > 200) {
    return { ok: false as const, error: { code: "AUTOMATION_IDEMPOTENCY_KEY_REQUIRED", error: "A valid Idempotency-Key header is required" } };
  }
  if (value !== body) {
    return { ok: false as const, error: { code: "AUTOMATION_IDEMPOTENCY_KEY_MISMATCH", error: "Idempotency-Key must match body.idempotencyKey" } };
  }
  return { ok: true as const, value };
}

function parseIfMatch(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().replace(/^W\//, "").replace(/^"|"$/g, "");
  return /^\d+$/.test(normalized) && Number(normalized) > 0 ? Number(normalized) : null;
}
