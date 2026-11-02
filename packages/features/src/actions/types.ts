import type { z } from "zod";
import type { PlanOps, PlanOutcome } from "./plan";

/*
 * Workspace actions are the shared catalog of things a principal can do. UI
 * commands, the personal AI, and future agents, MCP and API surfaces resolve
 * the same actions to the same planners and server entry points.
 */

export type ActionScope =
  | "workspace.read"
  | "pages.read"
  | "pages.write"
  | "databases.read"
  | "databases.write";
export type ActionGroup =
  | "discovery"
  | "pages.read"
  | "pages.write"
  | "databases.read"
  | "databases.schema"
  | "databases.views"
  | "databases.rows"
  | "templates";
export type ActionEffect = "read" | "write" | "destructive";
/** Delivery milestone; destructive actions wait for confirmation and undo (D). */
export type ActionMilestone = "A" | "B" | "C" | "D";

type ActionBase<I> = {
  name: string;
  group: ActionGroup;
  title: string;
  /** Model-facing description of when and how to use the action. */
  description: string;
  input: z.ZodType<I>;
  effect: ActionEffect;
  scopes: readonly ActionScope[];
  milestone: ActionMilestone;
};

export type ReadAction<I = unknown> = ActionBase<I> & { kind: "read" };

/** State an executor must load, authorized for the acting principal, before planning. */
export type ActionStateNeeds = {
  database?: {
    databaseId: string;
    dataSourceId?: string;
    viewId?: string;
    records?: boolean;
    includeDeleted?: boolean;
  };
};

export type WriteAction<I = unknown, S = unknown, O extends PlanOps = PlanOps> = ActionBase<I> & {
  kind: "write";
  /** Commands this action can issue; used for catalog coverage checks. */
  covers: readonly string[];
  needs: (input: I) => ActionStateNeeds;
  plan: (state: S, input: I) => PlanOutcome<O>;
};

export type WorkspaceAction = ReadAction<never> | WriteAction<never, never, never>;

export function exposedActions<T extends { effect: ActionEffect; milestone: ActionMilestone }>(
  actions: readonly T[],
  milestones: readonly ActionMilestone[],
) {
  return actions.filter(
    (action) => action.effect !== "destructive" && milestones.includes(action.milestone),
  );
}
