import { ToolkitError } from "@zilobase/toolkit";
import { Hono, type Context } from "hono";

import { getPrimaryClientOrigin, isAllowedClientOrigin } from "../../config";
import {
  createToolkit,
  getToolkitUserId,
  isToolkitConfigured,
  ToolkitConfigurationError,
} from "../../integrations/toolkit";
import type { AppBindings } from "../../types";
import { requireActiveWorkspace } from "./shared";

export const workspaceIntegrationRoutes = new Hono<AppBindings>();

workspaceIntegrationRoutes.get("/integrations", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  if (!isToolkitConfigured(c.env)) {
    return c.json({ accounts: [], configured: false, connectors: [] });
  }

  try {
    const toolkit = createToolkit(c.env);
    const toolkitUserId = getToolkitUserId(auth.workspaceId, auth.user.id);
    const [connectors, accounts] = await Promise.all([
      toolkit.connectors.list({ limit: 100, signal: c.req.raw.signal }),
      toolkit.connectedAccounts.list(toolkitUserId, {
        limit: 100,
        signal: c.req.raw.signal,
      }),
    ]);

    return c.json({
      accounts: accounts.items,
      configured: true,
      connectors: connectors.items,
    });
  } catch (error) {
    return toolkitErrorResponse(c, error);
  }
});

workspaceIntegrationRoutes.post("/integrations/:connectorId/start", async (c) => {
  const auth = await requireActiveWorkspace(c);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = (await c.req.json().catch(() => ({}))) as {
      returnUrl?: unknown;
    };
    const returnUrl = resolveReturnUrl(c, body.returnUrl);
    const toolkit = createToolkit(c.env);
    const connection = await toolkit.connectors.authorize(
      getToolkitUserId(auth.workspaceId, auth.user.id),
      c.req.param("connectorId"),
      {
        returnUrl,
        read: "all",
        signal: c.req.raw.signal,
        write: [],
      },
    );

    return c.json({
      expiresAt: connection.expiresAt,
      id: connection.id,
      url: connection.redirectUrl,
    });
  } catch (error) {
    return toolkitErrorResponse(c, error);
  }
});

workspaceIntegrationRoutes.post(
  "/integrations/:connectorId/disconnect",
  async (c) => {
    const auth = await requireActiveWorkspace(c);

    if ("response" in auth) {
      return auth.response;
    }

    try {
      const toolkit = createToolkit(c.env);
      const toolkitUserId = getToolkitUserId(auth.workspaceId, auth.user.id);
      const accounts = await toolkit.connectedAccounts.list(toolkitUserId, {
        connectorId: c.req.param("connectorId"),
        limit: 100,
        signal: c.req.raw.signal,
      });

      await Promise.all(
        accounts.items.map((account) =>
          toolkit.connectedAccounts.delete(account.id, toolkitUserId, {
            signal: c.req.raw.signal,
          }),
        ),
      );

      return c.json({
        connected: false as const,
        deleted: accounts.items.length > 0,
      });
    } catch (error) {
      return toolkitErrorResponse(c, error);
    }
  },
);

function resolveReturnUrl(c: Context<AppBindings>, value: unknown) {
  const fallback = new URL(
    "/settings/integrations",
    getPrimaryClientOrigin(c.env),
  );

  if (typeof value !== "string" || !value.trim()) {
    return fallback.toString();
  }

  let returnUrl: URL;

  try {
    returnUrl = new URL(value);
  } catch {
    throw new InvalidReturnUrlError();
  }

  if (!isAllowedClientOrigin(c.env, returnUrl.origin)) {
    throw new InvalidReturnUrlError();
  }

  return returnUrl.toString();
}

function toolkitErrorResponse(c: Context<AppBindings>, error: unknown) {
  if (error instanceof ToolkitError) {
    return c.json(
      {
        code: error.code,
        message: error.message,
        requestId: error.requestId,
      },
      asHttpStatus(error.status ?? 502),
    );
  }

  if (
    error instanceof ToolkitConfigurationError ||
    error instanceof InvalidReturnUrlError
  ) {
    return c.json(
      { message: error.message },
      asHttpStatus(error.status),
    );
  }

  console.error("Toolkit integration request failed", error);
  return c.json({ message: "Toolkit request failed." }, 502);
}

function asHttpStatus(status: number) {
  return status as 400 | 401 | 403 | 404 | 408 | 409 | 429 | 500 | 502 | 503;
}

class InvalidReturnUrlError extends Error {
  readonly status = 400;

  constructor() {
    super("The integration return URL is not allowed.");
    this.name = "InvalidReturnUrlError";
  }
}
