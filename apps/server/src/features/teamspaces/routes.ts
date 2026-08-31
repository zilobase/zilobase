import { Hono, type Context } from "hono";
import { z } from "zod";

import type { AppBindings } from "../../shared/types";
import {
  TeamspaceManagementError,
  TeamspaceManagementService,
} from "./management";

export const teamspaceRoutes = new Hono<AppBindings>();

const createSchema = z
  .object({
    accessMode: z.enum(["open", "closed", "private"]),
    description: z.string().trim().max(2000).nullable().optional(),
    exportEnabled: z.boolean().optional(),
    guestsEnabled: z.boolean().optional(),
    icon: z.unknown().optional(),
    name: z.string().trim().min(1).max(120),
  })
  .strict();
const updateSchema = z
  .object({
    accessMode: z.enum(["open", "closed", "private"]).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    icon: z.unknown().optional(),
    invitePolicy: z.enum(["owners", "owners_and_members"]).optional(),
    memberAccessLevel: z.enum(["view", "comment", "edit", "full"]).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    publicSharingEnabled: z.boolean().optional(),
    sidebarEditPolicy: z.enum(["owners", "owners_and_members"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide a field to update.");
const principalSchema = z
  .object({
    accessLevelOverride: z.enum(["view", "comment", "edit", "full"]).nullable().optional(),
    principalType: z.enum(["user", "team"]).default("user"),
    role: z.enum(["owner", "member"]),
    userId: z.string().min(1),
  })
  .strict();
const roleSchema = z
  .object({
    accessLevelOverride: z.enum(["view", "comment", "edit", "full"]).nullable().optional(),
    role: z.enum(["owner", "member"]),
  })
  .strict();

teamspaceRoutes.get("/:workspaceId/teamspace-settings", async (c) =>
  handle(c, (service, userId, workspaceId) =>
    service.getWorkspaceSettings(workspaceId, userId),
  ),
);

teamspaceRoutes.patch("/:workspaceId/teamspace-settings", async (c) => {
  const parsed = z
    .object({
      creationPolicy: z.enum(["workspace_owners", "workspace_members"]),
    })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
  return handle(c, (service, userId, workspaceId) =>
    service.updateWorkspaceSettings({ ...parsed.data, userId, workspaceId }),
  );
});

teamspaceRoutes.patch("/:workspaceId/teamspace-defaults", async (c) => {
  const parsed = z
    .object({ defaultTeamspaceIds: z.array(z.string().min(1)).min(1) })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
  return handle(c, (service, userId, workspaceId) =>
    service.updateDefaults({ ...parsed.data, userId, workspaceId }),
  );
});

teamspaceRoutes.get("/:workspaceId/teamspaces", async (c) =>
  handle(c, async (service, userId, workspaceId) => ({
    teamspaces: await service.list({
      includeArchived: c.req.query("status") === "archived",
      userId,
      workspaceId,
    }),
  })),
);

teamspaceRoutes.post("/:workspaceId/teamspaces", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
  return handle(
    c,
    (service, userId, workspaceId) =>
      service.create({ ...parsed.data, userId, workspaceId }),
    201,
  );
});

teamspaceRoutes.get("/:workspaceId/teamspaces/:teamspaceId", async (c) =>
  handle(c, (service, userId, workspaceId) =>
    service.get({
      teamspaceId: c.req.param("teamspaceId"),
      userId,
      workspaceId,
    }),
  ),
);

teamspaceRoutes.patch("/:workspaceId/teamspaces/:teamspaceId", async (c) => {
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
  return handle(c, (service, userId, workspaceId) =>
    service.update({
      ...parsed.data,
      teamspaceId: c.req.param("teamspaceId"),
      userId,
      workspaceId,
    }),
  );
});

for (const action of ["join", "leave"] as const) {
  teamspaceRoutes.post(
    `/:workspaceId/teamspaces/:teamspaceId/${action}`,
    async (c) =>
      handle(c, (service, userId, workspaceId) =>
        service[action]({
          teamspaceId: c.req.param("teamspaceId"),
          userId,
          workspaceId,
        }),
      ),
  );
}

for (const action of ["archive", "restore", "recover-owner"] as const) {
  teamspaceRoutes.post(
    `/:workspaceId/teamspaces/:teamspaceId/${action}`,
    async (c) =>
      handle(c, (service, userId, workspaceId) =>
        service[
          action === "recover-owner" ? "recoverOwner" : action
        ]({
          teamspaceId: c.req.param("teamspaceId"),
          userId,
          workspaceId,
        }),
      ),
  );
}

teamspaceRoutes.patch(
  "/:workspaceId/teamspaces/:teamspaceId/invite-link",
  async (c) => {
    const parsed = z
      .object({ enabled: z.boolean() })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
    return handle(c, (service, userId, workspaceId) =>
      service.updateInviteLink({
        enabled: parsed.data.enabled,
        teamspaceId: c.req.param("teamspaceId"),
        userId,
        workspaceId,
      }),
    );
  },
);

teamspaceRoutes.post(
  "/:workspaceId/teamspace-invites/:token/accept",
  async (c) =>
    handle(c, (service, userId, workspaceId) =>
      service.acceptInvite({
        token: c.req.param("token"),
        userId,
        workspaceId,
      }),
    ),
);

teamspaceRoutes.get(
  "/:workspaceId/teamspaces/:teamspaceId/principals",
  async (c) =>
    handle(c, async (service, userId, workspaceId) => ({
      principals: await service.listPrincipals({
        teamspaceId: c.req.param("teamspaceId"),
        userId,
        workspaceId,
      }),
    })),
);

teamspaceRoutes.post(
  "/:workspaceId/teamspaces/:teamspaceId/principals",
  async (c) => {
    const parsed = principalSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
    return handle(c, (service, userId, workspaceId) =>
      service.addPrincipal({
        role: parsed.data.role,
        accessLevelOverride: parsed.data.accessLevelOverride,
        principalType: parsed.data.principalType,
        targetUserId: parsed.data.userId,
        teamspaceId: c.req.param("teamspaceId"),
        userId,
        workspaceId,
      }),
    );
  },
);

teamspaceRoutes.patch(
  "/:workspaceId/teamspaces/:teamspaceId/principals/:principalId",
  async (c) => {
    const parsed = roleSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message }, 400);
    return handle(c, (service, userId, workspaceId) =>
      service.updatePrincipal({
        principalId: c.req.param("principalId"),
        role: parsed.data.role,
        accessLevelOverride: parsed.data.accessLevelOverride,
        teamspaceId: c.req.param("teamspaceId"),
        userId,
        workspaceId,
      }),
    );
  },
);

teamspaceRoutes.delete(
  "/:workspaceId/teamspaces/:teamspaceId/principals/:principalId",
  async (c) =>
    handle(c, (service, userId, workspaceId) =>
      service.removePrincipal({
        principalId: c.req.param("principalId"),
        teamspaceId: c.req.param("teamspaceId"),
        userId,
        workspaceId,
      }),
    ),
);

async function handle(
  c: Context<AppBindings>,
  run: (
    service: TeamspaceManagementService,
    userId: string,
    workspaceId: string,
  ) => Promise<unknown>,
  successStatus: 200 | 201 = 200,
) {
  const requestUser = c.get("user");
  if (!requestUser) return c.json({ error: "Unauthorized" }, 401);
  try {
    const result = await run(
      new TeamspaceManagementService(
        undefined,
        c.get("editionExtension") ?? undefined,
        c.env,
      ),
      requestUser.id,
      c.req.param("workspaceId")!,
    );
    if (successStatus === 201) return c.json(result as never, 201);
    return c.json(result as never, 200);
  } catch (error) {
    if (error instanceof TeamspaceManagementError) {
      return c.json({ error: error.message }, error.status);
    }
    throw error;
  }
}
