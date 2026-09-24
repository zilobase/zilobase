import { Hono, type Context } from "hono";
import { Schema, SchemaTransformation } from "effect";

import type { AppBindings } from "../../shared/types";
import { parseJsonBody } from "../../shared/http/schema-json";
import { TeamspaceManagementService } from "./management";

export const teamspaceRoutes = new Hono<AppBindings>();

const strictJson = { onExcessProperty: "error" as const };

const TeamspaceAccessMode = Schema.Literals(["open", "closed", "private"]);
const TeamspaceRole = Schema.Literals(["owner", "member"]);
const MemberAccessLevel = Schema.Literals(["view", "comment", "edit", "full"]);
const PrincipalType = Schema.Literals(["user", "team"]);
const InvitePolicy = Schema.Literals(["owners", "owners_and_members"]);
const SidebarEditPolicy = Schema.Literals(["owners", "owners_and_members"]);
const CreationPolicy = Schema.Literals(["workspace_owners", "workspace_members"]);

const CreateTeamspaceInput = Schema.Struct({
  accessMode: TeamspaceAccessMode,
  description: Schema.optionalKey(
    Schema.NullOr(
      Schema.String.pipe(
        Schema.decode(SchemaTransformation.trim()),
        Schema.check(Schema.isMaxLength(2000)),
      ),
    ),
  ),
  exportEnabled: Schema.optionalKey(Schema.Boolean),
  guestsEnabled: Schema.optionalKey(Schema.Boolean),
  icon: Schema.optionalKey(Schema.Unknown),
  name: Schema.String.pipe(
    Schema.decode(SchemaTransformation.trim()),
    Schema.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
  ),
});

const UpdateTeamspaceInput = Schema.Struct({
  accessMode: Schema.optionalKey(TeamspaceAccessMode),
  description: Schema.optionalKey(
    Schema.NullOr(
      Schema.String.pipe(
        Schema.decode(SchemaTransformation.trim()),
        Schema.check(Schema.isMaxLength(2000)),
      ),
    ),
  ),
  icon: Schema.optionalKey(Schema.Unknown),
  invitePolicy: Schema.optionalKey(InvitePolicy),
  memberAccessLevel: Schema.optionalKey(MemberAccessLevel),
  name: Schema.optionalKey(
    Schema.String.pipe(
      Schema.decode(SchemaTransformation.trim()),
      Schema.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
    ),
  ),
  publicSharingEnabled: Schema.optionalKey(Schema.Boolean),
  sidebarEditPolicy: Schema.optionalKey(SidebarEditPolicy),
}).check(
  Schema.makeFilter((value) =>
    Object.keys(value).length > 0 ? undefined : "Provide a field to update.",
  ),
);

const AddPrincipalInput = Schema.Struct({
  accessLevelOverride: Schema.optionalKey(Schema.NullOr(MemberAccessLevel)),
  principalType: Schema.optionalKey(PrincipalType),
  role: TeamspaceRole,
  userId: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
});

const UpdatePrincipalInput = Schema.Struct({
  accessLevelOverride: Schema.optionalKey(Schema.NullOr(MemberAccessLevel)),
  role: TeamspaceRole,
});

const UpdateTeamspaceSettingsInput = Schema.Struct({
  creationPolicy: CreationPolicy,
});

const UpdateTeamspaceDefaultsInput = Schema.Struct({
  defaultTeamspaceIds: Schema.Array(Schema.String.pipe(Schema.check(Schema.isMinLength(1)))).pipe(
    Schema.check(Schema.isMinLength(1)),
  ),
});

const UpdateInviteLinkInput = Schema.Struct({
  enabled: Schema.Boolean,
});

teamspaceRoutes.get("/:workspaceId/teamspace-settings", async (c) =>
  handle(c, (service, userId, workspaceId) => service.getWorkspaceSettings(workspaceId, userId)),
);

teamspaceRoutes.patch("/:workspaceId/teamspace-settings", async (c) => {
  const parsed = await parseJsonBody(c.req, UpdateTeamspaceSettingsInput, strictJson);
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  return handle(c, (service, userId, workspaceId) =>
    service.updateWorkspaceSettings({ ...parsed.data, userId, workspaceId }),
  );
});

teamspaceRoutes.patch("/:workspaceId/teamspace-defaults", async (c) => {
  const parsed = await parseJsonBody(c.req, UpdateTeamspaceDefaultsInput, strictJson);
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  return handle(c, (service, userId, workspaceId) =>
    service.updateDefaults({
      defaultTeamspaceIds: [...parsed.data.defaultTeamspaceIds],
      userId,
      workspaceId,
    }),
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
  const parsed = await parseJsonBody(c.req, CreateTeamspaceInput, strictJson);
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  return handle(
    c,
    (service, userId, workspaceId) => service.create({ ...parsed.data, userId, workspaceId }),
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
  const parsed = await parseJsonBody(c.req, UpdateTeamspaceInput, strictJson);
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
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
  teamspaceRoutes.post(`/:workspaceId/teamspaces/:teamspaceId/${action}`, async (c) =>
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
  teamspaceRoutes.post(`/:workspaceId/teamspaces/:teamspaceId/${action}`, async (c) =>
    handle(c, (service, userId, workspaceId) =>
      service[action === "recover-owner" ? "recoverOwner" : action]({
        teamspaceId: c.req.param("teamspaceId"),
        userId,
        workspaceId,
      }),
    ),
  );
}

teamspaceRoutes.patch("/:workspaceId/teamspaces/:teamspaceId/invite-link", async (c) => {
  const parsed = await parseJsonBody(c.req, UpdateInviteLinkInput, strictJson);
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  return handle(c, (service, userId, workspaceId) =>
    service.updateInviteLink({
      enabled: parsed.data.enabled,
      teamspaceId: c.req.param("teamspaceId"),
      userId,
      workspaceId,
    }),
  );
});

teamspaceRoutes.post("/:workspaceId/teamspace-invites/:token/accept", async (c) =>
  handle(c, (service, userId, workspaceId) =>
    service.acceptInvite({
      token: c.req.param("token"),
      userId,
      workspaceId,
    }),
  ),
);

teamspaceRoutes.get("/:workspaceId/teamspaces/:teamspaceId/principals", async (c) =>
  handle(c, async (service, userId, workspaceId) => ({
    principals: await service.listPrincipals({
      teamspaceId: c.req.param("teamspaceId"),
      userId,
      workspaceId,
    }),
  })),
);

teamspaceRoutes.post("/:workspaceId/teamspaces/:teamspaceId/principals", async (c) => {
  const parsed = await parseJsonBody(c.req, AddPrincipalInput, strictJson);
  if (!parsed.ok) return c.json({ error: parsed.message }, 400);
  return handle(c, (service, userId, workspaceId) =>
    service.addPrincipal({
      role: parsed.data.role,
      accessLevelOverride: parsed.data.accessLevelOverride,
      principalType: parsed.data.principalType ?? "user",
      targetUserId: parsed.data.userId,
      teamspaceId: c.req.param("teamspaceId"),
      userId,
      workspaceId,
    }),
  );
});

teamspaceRoutes.patch(
  "/:workspaceId/teamspaces/:teamspaceId/principals/:principalId",
  async (c) => {
    const parsed = await parseJsonBody(c.req, UpdatePrincipalInput, strictJson);
    if (!parsed.ok) return c.json({ error: parsed.message }, 400);
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

teamspaceRoutes.delete("/:workspaceId/teamspaces/:teamspaceId/principals/:principalId", async (c) =>
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
  const result = await run(
    new TeamspaceManagementService(undefined, c.get("editionExtension") ?? undefined, c.env),
    requestUser.id,
    c.req.param("workspaceId")!,
  );
  if (successStatus === 201) return c.json(result as never, 201);
  return c.json(result as never, 200);
}
