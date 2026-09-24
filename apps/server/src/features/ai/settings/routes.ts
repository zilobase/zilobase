import { Hono } from "hono";
import * as z from "zod";
import { settingsDefinitionSchema } from "@zilobase/features/ai-chat/settings-contract";
import type { AppBindings } from "../../../shared/types";
import { getStringEnv } from "../../../shared/config/config";
import { requestedAiWorkspaceId } from "../route-workspace";
import { AgentProfileError } from "../agents/agent-profile-service";
import { startManualAgentRun } from "../conversations/agent-conversation-service";
import {
  readSettings,
  createSettingsInstruction,
  updateSettingsDraft,
  discardSettingsDraft,
  publishSettings,
  settingsVersions,
  type SettingsActor,
} from "./settings-service";
import { proposeSettings } from "./settings-tools";

export const aiSettingsRoutes = new Hono<AppBindings>();
aiSettingsRoutes.onError((error, c) => {
  if (error instanceof AgentProfileError)
    return c.json({ error: error.message, code: error.code }, error.status);
  if (error instanceof z.ZodError)
    return c.json({ error: "Invalid settings", issues: error.issues }, 400);
  console.error("Agent settings request failed", error);
  return c.json({ error: "Could not update agent settings." }, 500);
});
const versionSchema = z.object({
  baseVersion: z.number().int().positive(),
  draftVersion: z.number().int().nonnegative(),
});
function actor(c: Parameters<typeof requestedAiWorkspaceId>[0]): SettingsActor {
  const user = c.get("user");
  const workspaceId = requestedAiWorkspaceId(c);
  if (!user || !workspaceId)
    throw new AgentProfileError("unauthorized", "Sign in and select a workspace.", 403);
  const scope = c.req.param("scope")!;
  if (scope !== "personal" && getStringEnv(c.env, "AI_CUSTOM_AGENTS_ENABLED") !== "true")
    throw new AgentProfileError("agents_disabled", "Custom agents are disabled.", 404);
  return { userId: user.id, workspaceId, scope };
}
aiSettingsRoutes.get("/settings/:scope/draft", async (c) => c.json(await readSettings(actor(c))));
aiSettingsRoutes.post("/settings/:scope/instructions", async (c) =>
  c.json(await createSettingsInstruction(actor(c), versionSchema.parse(await c.req.json()))),
);
aiSettingsRoutes.patch("/settings/:scope/draft", async (c) => {
  const body = versionSchema
    .extend({ patch: settingsDefinitionSchema.partial().strict() })
    .parse(await c.req.json());
  return c.json(await updateSettingsDraft(actor(c), body, c.env));
});
aiSettingsRoutes.delete("/settings/:scope/draft", async (c) => {
  const body = z.object({ draftVersion: z.number().int().nonnegative() }).parse(await c.req.json());
  return c.json(await discardSettingsDraft(actor(c), body.draftVersion, c.env));
});
aiSettingsRoutes.post("/settings/:scope/publish", async (c) => {
  const a = actor(c);
  const state = await readSettings(a);
  if (
    a.scope !== "personal" &&
    JSON.stringify(state.definition.triggers) !== JSON.stringify(state.saved.triggers) &&
    getStringEnv(c.env, "AI_CUSTOM_AGENT_TRIGGERS_ENABLED") !== "true"
  )
    throw new AgentProfileError("triggers_disabled", "Custom-agent triggers are disabled.", 409);
  const result = await publishSettings(a, versionSchema.parse(await c.req.json()));
  let runError: string | undefined;
  if (result.pendingRun && a.scope !== "personal") {
    try {
      await startManualAgentRun({
        ...a,
        profileId: a.scope,
        prompt: result.pendingRun,
        env: c.env,
      });
    } catch (error) {
      runError = error instanceof Error ? error.message : "Run could not be queued.";
    }
  }
  return c.json({
    ...result,
    pendingRun: null,
    ...(runError ? { runError } : {}),
  });
});
aiSettingsRoutes.get("/settings/:scope/versions", async (c) =>
  c.json({ versions: await settingsVersions(actor(c)) }),
);
aiSettingsRoutes.post("/settings/:scope/propose", async (c) => {
  const body = z.object({ request: z.string().trim().min(1).max(20000) }).parse(await c.req.json());
  return c.json(await proposeSettings(actor(c), body.request, c.env));
});
