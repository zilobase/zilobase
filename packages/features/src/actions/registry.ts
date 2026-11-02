import { databaseActions } from "../databases/actions/catalog";

/** The workspace action catalog. Domains own their definitions; this list composes them. */
export const workspaceActions = [...databaseActions] as const;

export type WorkspaceActionName = (typeof workspaceActions)[number]["name"];

export function findWorkspaceAction(name: string) {
  return workspaceActions.find((action) => action.name === name);
}
