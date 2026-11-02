import {
  composeDatabaseViewData,
  deriveDatabaseViewModel,
  findWorkspaceAction,
  isDatabaseLocked,
  isPlanRejection,
  runPlan,
  type ActionScope,
  type ActionStateNeeds,
  type DatabaseActionState,
  type DatabaseBootstrapResponse,
  type PlanOps,
  type PlanOutcome,
} from "@zilobase/features/runtime";
import { readDatabaseBootstrap } from "../databases/read/operations";
import type { ServerOperationContext } from "../operations/context";
import {
  createDatabaseActionPort,
  type ActionChange,
  type DatabasePortCache,
  type DatabasePortOptions,
} from "./database-port";
import type { ActionReceiptStore } from "./receipts";

/** Who is acting. Agent principals are reserved until agents ship. */
export type ActionPrincipal =
  | { kind: "user"; userId: string; workspaceId: string; scopes: readonly ActionScope[] }
  | {
      kind: "agent";
      agentId: string;
      ownerUserId: string;
      workspaceId: string;
      scopes: readonly ActionScope[];
    };

export const personalScopes: readonly ActionScope[] = [
  "workspace.read",
  "pages.read",
  "pages.write",
  "databases.read",
  "databases.write",
];

export type ActionOutcome =
  | { status: "completed"; result: unknown; changes: ActionChange[] }
  | { status: "rejected"; reason: string; message: string; changes: ActionChange[] }
  | { status: "failed"; message: string; changes: ActionChange[] };

/** Builds the planners' database state with the same view model functions as the UI. */
export function databaseActionState(
  bootstrap: DatabaseBootstrapResponse & { database: { accessLevel?: string | null } },
  input: { dataSourceId?: string; viewId?: string; workspaceId: string; userId: string },
  cache: DatabasePortCache,
): DatabaseActionState {
  const viewData = composeDatabaseViewData({
    bootstrap,
    dataSourceId:
      input.dataSourceId ??
      bootstrap.views.find(({ id }) => id === input.viewId)?.dataSourceId ??
      null,
    hasMore: false,
    records: [],
    totalCount: 0,
  });
  const model = deriveDatabaseViewModel({
    activeViewId: input.viewId ?? null,
    currentUserId: input.userId,
    viewData,
  });
  const activeView = input.viewId
    ? (bootstrap.views.find(({ id }) => id === input.viewId) ?? null)
    : null;
  const access = bootstrap.database.accessLevel;
  return {
    workspaceId: input.workspaceId,
    dataSourceId: viewData?.dataSourceId ?? null,
    hostDatabaseId: bootstrap.database.id,
    editable:
      (access === "edit" || access === "full") &&
      !bootstrap.database.deletedAt &&
      !isDatabaseLocked(bootstrap.database),
    activeView,
    activeDatabaseFilters: model.activeDatabaseFilters,
    activeDatabaseSorts: model.activeDatabaseSorts,
    properties: model.properties,
    items: model.items,
    isKanbanView: model.isKanbanView,
    kanbanGroupProperty: model.kanbanGroupProperty,
    timelineDateProperty: model.timelineDateProperty,
    viewData,
    latestViewConfig: () =>
      activeView ? (cache.viewConfigs.get(activeView.id) ?? activeView.config) : undefined,
  };
}

/**
 * Executes a workspace action for a principal: validate input, check scopes,
 * load authorized state, plan with the shared planners and run every step to
 * its acknowledgement through the same services as the HTTP routes.
 */
export async function executeWorkspaceAction(input: {
  context: ServerOperationContext;
  principal: ActionPrincipal;
  invocationId: string;
  callId: string;
  name: string;
  input: unknown;
  receipts: ActionReceiptStore;
  createSampleRowContent?: (markdown: string) => unknown;
  readBootstrap?: typeof readDatabaseBootstrap;
  executeCommand?: DatabasePortOptions["execute"];
}): Promise<ActionOutcome> {
  const changes: ActionChange[] = [];
  const reject = (reason: string, message: string): ActionOutcome => ({
    status: "rejected",
    reason,
    message,
    changes,
  });
  if (input.principal.kind !== "user")
    return reject("agent_principal_unsupported", "Agent principals are not supported yet.");
  const action = findWorkspaceAction(input.name);
  if (!action || action.kind !== "write")
    return reject("unknown_action", `Unknown action ${input.name}.`);
  const missing = action.scopes.filter((scope) => !input.principal.scopes.includes(scope));
  if (missing.length) return reject("insufficient_scope", `Missing scope: ${missing.join(", ")}.`);
  const parsed = action.input.safeParse(input.input);
  if (!parsed.success) return reject("invalid_input", parsed.error.message);

  const cache: DatabasePortCache = { viewConfigs: new Map() };
  const needs = (action.needs as (value: unknown) => ActionStateNeeds)(parsed.data);
  let state: unknown = {
    workspaceId: input.principal.workspaceId,
    createSampleRowContent: input.createSampleRowContent,
  };
  if (needs.database) {
    const bootstrap = await (input.readBootstrap ?? readDatabaseBootstrap)(input.context, {
      databaseId: needs.database.databaseId,
      includeDeleted: needs.database.includeDeleted,
    });
    cache.bootstrap = bootstrap as DatabaseBootstrapResponse;
    state = databaseActionState(
      bootstrap as DatabaseBootstrapResponse,
      {
        dataSourceId: needs.database.dataSourceId,
        viewId: needs.database.viewId,
        workspaceId: input.principal.workspaceId,
        userId: input.principal.userId,
      },
      cache,
    );
  }
  const plan = (action.plan as (state: unknown, value: unknown) => PlanOutcome<PlanOps>)(
    state,
    parsed.data,
  );
  if (isPlanRejection(plan)) return reject(plan.rejected, plan.message ?? plan.rejected);
  const ops = createDatabaseActionPort({
    context: input.context,
    invocationId: input.invocationId,
    callId: input.callId,
    receipts: input.receipts,
    cache,
    onChange: (change) => changes.push(change),
    execute: input.executeCommand,
  });
  const run = await runPlan(plan, ops as unknown as PlanOps, { sequential: true });
  if (run.status === "completed") return { status: "completed", result: run.last, changes };
  const error = run.error;
  return {
    status: "failed",
    message: error instanceof Error ? error.message : "The action could not be completed.",
    changes,
  };
}
