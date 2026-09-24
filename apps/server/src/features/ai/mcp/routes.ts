import { getMcpOAuthReturnPath, cancelMcpOAuth } from "./connections/oauth";
import { mcpOAuthReturnUrl } from "./connections/oauth-return";
import { Hono, type Context } from "hono";
import { requestedAiWorkspaceId } from "../route-workspace";
import * as z from "zod";
import { McpServiceError } from "./transport/mcp-errors";
import { getMcpClientMetadata } from "./connections/oauth-credentials";

import { getCanonicalWebOrigin } from "../../../shared/config/config";
import type { AppBindings } from "../../../shared/types";
import { getMembership, isPrivilegedOrgRole } from "../../access";
import { MCP_SERVER_CATALOG } from "./connections/catalog";
import { isMcpEnabled } from "./connections/config";
import { agentMcpScope, getMcpScopeFromConnection, personalMcpScope } from "./mcp-scope";
import {
  addApprovedMcpServer,
  createMcpConnection,
  disconnectMcpConnection,
  getWorkspaceMcpPolicy,
  listApprovedMcpServers,
  listMcpActivity,
  listMcpConnections,
  refreshMcpConnection,
  removeApprovedMcpServer,
  setMcpAlwaysAllow,
  submitMcpHeaders,
  toMcpServiceError,
  updateMcpToolPolicies,
  updateWorkspaceMcpPolicy,
} from "./connections/mcp-service";
import { beginMcpOAuth, completeMcpOAuth, getMcpOAuthCallbackScope } from "./connections/oauth";

const createConnectionSchema = z
  .object({
    approvedServerId: z.string().uuid().optional(),
    authMethod: z.enum(["oauth", "headers"]),
    catalogId: z.enum(["github", "linear", "figma"]).optional(),
  })
  .refine((value) => Boolean(value.approvedServerId) !== Boolean(value.catalogId), {
    message: "Choose exactly one catalog or approved server.",
  });
const headersSchema = z.object({
  headers: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        value: z.string().min(1).max(8_192),
      }),
    )
    .min(1)
    .max(5),
});
const toolPoliciesSchema = z.object({
  policies: z
    .array(
      z.object({
        classification: z.enum(["read", "write", "unknown"]),
        enabled: z.boolean(),
        executionMode: z.enum(["automatic", "always_ask"]),
        toolId: z.string().uuid(),
      }),
    )
    .max(100),
});
const alwaysAllowSchema = z.object({
  enabled: z.boolean(),
  confirmed: z.boolean().default(false),
});
const workspacePolicySchema = z.object({
  customServersEnabled: z.boolean(),
  externalWritesEnabled: z.boolean(),
  installationPolicy: z.enum(["approved_and_catalog", "approved_only"]),
});
const approvedServerSchema = z.object({
  endpointUrl: z.string().url().max(2_048),
  label: z.string().trim().min(1).max(120),
});

export const aiMcpRoutes = new Hono<AppBindings>();

aiMcpRoutes.get("/mcp/client-metadata.json", (c) => c.json(getMcpClientMetadata(c.env)));

aiMcpRoutes.get("/mcp/catalog", async (c) =>
  handle(c, async (auth) => {
    const policy = await getWorkspaceMcpPolicy(auth.workspaceId);
    return {
      catalog: MCP_SERVER_CATALOG.map((entry) => ({
        ...entry,
        available: entry.available && policy.installationPolicy !== "approved_only",
        availabilityReason:
          policy.installationPolicy === "approved_only"
            ? "Workspace policy requires an explicitly approved server."
            : entry.availabilityReason,
      })),
    };
  }),
);

aiMcpRoutes.get("/mcp/policy", async (c) =>
  handleAdmin(c, async (auth) => ({
    approvedServers: await listApprovedMcpServers(auth.workspaceId),
    policy: await getWorkspaceMcpPolicy(auth.workspaceId),
  })),
);

aiMcpRoutes.get("/mcp/approved-servers", async (c) =>
  handle(c, async (auth) => ({
    approvedServers: (await listApprovedMcpServers(auth.workspaceId)).map((server) => ({
      endpointUrl: server.endpointUrl,
      id: server.id,
      label: server.label,
    })),
  })),
);

aiMcpRoutes.put("/mcp/policy", async (c) =>
  handleAdmin(c, async (auth) => ({
    policy: await updateWorkspaceMcpPolicy({
      ...workspacePolicySchema.parse(await c.req.json()),
      workspaceId: auth.workspaceId,
    }),
  })),
);

aiMcpRoutes.post("/mcp/approved-servers", async (c) =>
  handleAdmin(
    c,
    async (auth) => ({
      server: await addApprovedMcpServer({
        ...approvedServerSchema.parse(await c.req.json()),
        ...auth,
      }),
    }),
    201,
  ),
);

aiMcpRoutes.delete("/mcp/approved-servers/:serverId", async (c) =>
  handleAdmin(c, async (auth) => ({
    removed: await removeApprovedMcpServer({
      serverId: c.req.param("serverId"),
      workspaceId: auth.workspaceId,
    }),
  })),
);

aiMcpRoutes.get("/agents/:agentId/connections", async (c) =>
  handle(c, async (auth) => ({
    connections: await listMcpConnections({
      ...auth,
      scope: agentMcpScope(c.req.param("agentId")),
    }),
  })),
);

aiMcpRoutes.post("/agents/:agentId/connections", async (c) =>
  handle(
    c,
    async (auth) => ({
      connection: await createMcpConnection({
        ...createConnectionSchema.parse(await c.req.json()),
        ...auth,
        scope: agentMcpScope(c.req.param("agentId")),
        env: c.env,
      }),
    }),
    201,
  ),
);

aiMcpRoutes.put("/agents/:agentId/connections/:connectionId/headers", async (c) =>
  handle(c, async (auth) => ({
    connection: await submitMcpHeaders({
      ...headersSchema.parse(await c.req.json()),
      ...auth,
      scope: agentMcpScope(c.req.param("agentId")),
      connectionId: c.req.param("connectionId"),
      env: c.env,
    }),
  })),
);

aiMcpRoutes.post("/agents/:agentId/connections/:connectionId/oauth/start", async (c) =>
  handle(c, async (auth) => {
    const result = await beginMcpOAuth({
      returnTo: (await c.req.json().catch(() => ({}))).returnTo,
      ...auth,
      scope: agentMcpScope(c.req.param("agentId")),
      connectionId: c.req.param("connectionId"),
      env: c.env,
    });
    return {
      authorizationUrl: result.authorizationUrl,
      expiresAt: result.expiresAt.toISOString(),
    };
  }),
);

aiMcpRoutes.get("/mcp/oauth/callback", async (c) => {
  if (!isMcpEnabled(c.env)) return c.json({ error: "MCP is disabled." }, 404);
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!state) return c.json({ error: "OAuth callback is missing state." }, 400);
  const returnTo = await getMcpOAuthReturnPath(state).catch(() => null);
  const callbackScope = await getMcpOAuthCallbackScope(state).catch(() => null);
  if (!code || c.req.query("error")) {
    await cancelMcpOAuth(state);
    return c.redirect(
      mcpOAuthReturnUrl(getCanonicalWebOrigin(c.env), callbackScope, "failed", returnTo),
      302,
    );
  }
  try {
    const connection = await completeMcpOAuth({
      code,
      env: c.env,
      iss: c.req.query("iss"),
      state,
    });
    return c.redirect(
      mcpOAuthReturnUrl(
        getCanonicalWebOrigin(c.env),
        getMcpScopeFromConnection(connection),
        "connected",
        returnTo,
      ),
      302,
    );
  } catch (error) {
    return c.redirect(
      mcpOAuthReturnUrl(getCanonicalWebOrigin(c.env), callbackScope, "failed", returnTo),
      302,
    );
  }
});

aiMcpRoutes.post("/agents/:agentId/connections/:connectionId/refresh", async (c) =>
  handle(
    c,
    async (auth) =>
      await refreshMcpConnection({
        ...auth,
        scope: agentMcpScope(c.req.param("agentId")),
        connectionId: c.req.param("connectionId"),
        env: c.env,
      }),
  ),
);

aiMcpRoutes.put("/agents/:agentId/connections/:connectionId/tools", async (c) =>
  handle(c, async (auth) => ({
    connection: await updateMcpToolPolicies({
      ...toolPoliciesSchema.parse(await c.req.json()),
      ...auth,
      scope: agentMcpScope(c.req.param("agentId")),
      connectionId: c.req.param("connectionId"),
    }),
  })),
);

aiMcpRoutes.put("/agents/:agentId/connections/:connectionId/always-allow", async (c) =>
  handle(c, async (auth) => ({
    connection: await setMcpAlwaysAllow({
      ...alwaysAllowSchema.parse(await c.req.json()),
      ...auth,
      scope: agentMcpScope(c.req.param("agentId")),
      connectionId: c.req.param("connectionId"),
    }),
  })),
);

aiMcpRoutes.delete("/agents/:agentId/connections/:connectionId", async (c) =>
  handle(c, async (auth) => ({
    disconnected: await disconnectMcpConnection({
      ...auth,
      scope: agentMcpScope(c.req.param("agentId")),
      connectionId: c.req.param("connectionId"),
      env: c.env,
    }),
  })),
);

aiMcpRoutes.get("/agents/:agentId/activity", async (c) =>
  handle(c, async (auth) => ({
    activity: await listMcpActivity({
      ...auth,
      scope: agentMcpScope(c.req.param("agentId")),
    }),
  })),
);

aiMcpRoutes.get("/mcp/connections", async (c) =>
  handle(c, async (auth) => ({
    connections: await listMcpConnections({
      ...auth,
      scope: personalMcpScope(auth.userId),
    }),
  })),
);

aiMcpRoutes.post("/mcp/connections", async (c) =>
  handle(
    c,
    async (auth) => ({
      connection: await createMcpConnection({
        ...createConnectionSchema.parse(await c.req.json()),
        ...auth,
        env: c.env,
        scope: personalMcpScope(auth.userId),
      }),
    }),
    201,
  ),
);

aiMcpRoutes.put("/mcp/connections/:connectionId/headers", async (c) =>
  handle(c, async (auth) => ({
    connection: await submitMcpHeaders({
      ...headersSchema.parse(await c.req.json()),
      ...auth,
      connectionId: c.req.param("connectionId"),
      env: c.env,
      scope: personalMcpScope(auth.userId),
    }),
  })),
);

aiMcpRoutes.post("/mcp/connections/:connectionId/oauth/start", async (c) =>
  handle(c, async (auth) => {
    const result = await beginMcpOAuth({
      returnTo: (await c.req.json().catch(() => ({}))).returnTo,
      ...auth,
      connectionId: c.req.param("connectionId"),
      env: c.env,
      scope: personalMcpScope(auth.userId),
    });
    return {
      authorizationUrl: result.authorizationUrl,
      expiresAt: result.expiresAt.toISOString(),
    };
  }),
);

aiMcpRoutes.post("/mcp/connections/:connectionId/refresh", async (c) =>
  handle(
    c,
    async (auth) =>
      await refreshMcpConnection({
        ...auth,
        connectionId: c.req.param("connectionId"),
        env: c.env,
        scope: personalMcpScope(auth.userId),
      }),
  ),
);

aiMcpRoutes.put("/mcp/connections/:connectionId/tools", async (c) =>
  handle(c, async (auth) => ({
    connection: await updateMcpToolPolicies({
      ...toolPoliciesSchema.parse(await c.req.json()),
      ...auth,
      connectionId: c.req.param("connectionId"),
      scope: personalMcpScope(auth.userId),
    }),
  })),
);

aiMcpRoutes.put("/mcp/connections/:connectionId/always-allow", async (c) =>
  handle(c, async (auth) => ({
    connection: await setMcpAlwaysAllow({
      ...alwaysAllowSchema.parse(await c.req.json()),
      ...auth,
      connectionId: c.req.param("connectionId"),
      scope: personalMcpScope(auth.userId),
    }),
  })),
);

aiMcpRoutes.delete("/mcp/connections/:connectionId", async (c) =>
  handle(c, async (auth) => ({
    disconnected: await disconnectMcpConnection({
      ...auth,
      connectionId: c.req.param("connectionId"),
      env: c.env,
      scope: personalMcpScope(auth.userId),
    }),
  })),
);

aiMcpRoutes.get("/mcp/activity", async (c) =>
  handle(c, async (auth) => ({
    activity: await listMcpActivity({
      ...auth,
      scope: personalMcpScope(auth.userId),
    }),
  })),
);

async function handleAdmin(
  c: Context<AppBindings>,
  action: (auth: { userId: string; workspaceId: string }) => Promise<unknown>,
  status: 200 | 201 = 200,
) {
  return handle(
    c,
    async (auth, membership) => {
      if (!isPrivilegedOrgRole(membership.role)) {
        throw new McpServiceError(
          "workspace_admin_required",
          "Only workspace admins can manage MCP policy.",
          403,
        );
      }
      return action(auth);
    },
    status,
  );
}

async function handle(
  c: Context<AppBindings>,
  action: (
    auth: { userId: string; workspaceId: string },
    membership: NonNullable<Awaited<ReturnType<typeof getMembership>>>,
  ) => Promise<unknown>,
  successStatus: 200 | 201 = 200,
) {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const workspaceId = requestedAiWorkspaceId(c);
  if (!workspaceId) return c.json({ error: "No active workspace" }, 409);
  const membership = await getMembership(workspaceId, user.id);
  if (!membership) return c.json({ error: "Forbidden" }, 403);
  if (!isMcpEnabled(c.env))
    return c.json({ code: "AI_MCP_DISABLED", error: "MCP is disabled." }, 404);
  try {
    return c.json(await action({ userId: user.id, workspaceId }, membership), successStatus);
  } catch (error) {
    throw toMcpServiceError(error) ?? error;
  }
}
