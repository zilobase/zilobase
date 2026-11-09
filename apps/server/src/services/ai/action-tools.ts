import { tool, type ToolSet } from "ai";
import {
  exposedActions,
  workspaceActions,
  type ActionMilestone,
  type ChatToolActivity,
} from "@zilobase/features/runtime";
import { getStringEnv } from "../../shared/config/config";
import { executeWorkspaceAction, personalScopes } from "../actions/execute";
import { databaseReceiptStore, recordActionChanges } from "../actions/stores";
import { runServerOperation, type ServerOperationContext } from "../operations/context";

/** Milestones of workspace actions exposed to the model, e.g. "A,B"; empty disables writes. */
export function enabledActionMilestones(env: ServerOperationContext["env"]): ActionMilestone[] {
  return ((env && getStringEnv(env, "AI_ACTION_MILESTONES")) || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is ActionMilestone => ["A", "B", "C", "D"].includes(value));
}

export function actionToolName(name: string) {
  return name.replace(/\./g, "_");
}

/**
 * Generates model tools from the workspace action registry. Calls execute as
 * the signed-in user through the shared planners and server entry points;
 * invocation and tool call IDs make redelivered runs replay their writes.
 */
export function createActionTools(
  context: ServerOperationContext,
  input: {
    workspaceId: string;
    invocationId: string;
    /** Run progress shown to the user; action calls are recorded as activities. */
    progress?: { activities: ChatToolActivity[] };
    changed?: () => Promise<void>;
  },
): ToolSet {
  const milestones = enabledActionMilestones(context.env);
  const user = context.authentication?.user;
  if (!milestones.length || !user) return {};
  const tools: ToolSet = {};
  for (const action of exposedActions(workspaceActions, milestones)) {
    if (action.kind !== "write") continue;
    tools[actionToolName(action.name)] = tool({
      description: `${action.title}. ${action.description}`,
      inputSchema: action.input as never,
      execute: async (value: unknown, { toolCallId }) => {
        const activity: ChatToolActivity = {
          id: toolCallId,
          name: "workspace_action",
          action: action.name,
          status: "running",
          label: action.title,
        };
        input.progress?.activities.push(activity);
        await input.changed?.();
        const outcome = await runServerOperation(context, () =>
          executeWorkspaceAction({
            context,
            principal: {
              kind: "user",
              userId: user.id,
              workspaceId: input.workspaceId,
              scopes: personalScopes,
            },
            invocationId: input.invocationId,
            callId: toolCallId,
            name: action.name,
            input: value,
            receipts: databaseReceiptStore,
          }),
        );
        await runServerOperation(context, () =>
          recordActionChanges({
            invocationId: input.invocationId,
            workspaceId: input.workspaceId,
            userId: user.id,
            changes: outcome.changes,
          }),
        );
        const changed = outcome.changes.map(({ commandType, databaseId, ack }) => ({
          command: commandType,
          databaseId,
          id: (ack.result as { id?: string } | null)?.id,
        }));
        activity.status = outcome.status === "completed" ? "completed" : "failed";
        activity.changes = changed;
        if (outcome.status !== "completed") activity.error = outcome.message.slice(0, 512);
        await input.changed?.();
        return outcome.status === "completed"
          ? { status: "completed", changes: changed, result: summarize(outcome.result) }
          : { status: outcome.status, error: outcome.message, changes: changed };
      },
    });
  }
  return tools;
}

/** Returns IDs and names the model needs for follow-up calls, not whole entities. */
function summarize(value: unknown) {
  if (!value || typeof value !== "object") return value ?? null;
  const record = value as Record<string, unknown>;
  const pick = (entity: unknown) => {
    if (!entity || typeof entity !== "object") return entity;
    const { id, name, type, pageId, dataSourceId } = entity as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries({ id, name, type, pageId, dataSourceId }).filter(
        ([, item]) => item !== undefined,
      ),
    );
  };
  if ("database" in record)
    return { database: pick(record.database), dataSource: pick(record.activeDataSource) };
  if ("dataSource" in record)
    return { dataSource: pick(record.dataSource), view: pick(record.view) };
  if ("property" in record && "dataSourceId" in record)
    return { id: record.id, propertyId: pick(record.property) };
  return pick(record);
}
