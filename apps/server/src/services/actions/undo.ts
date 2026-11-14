import { and, desc, eq, isNull } from "drizzle-orm";
import type { DatabaseCommandRequest } from "@zilobase/features/runtime";
import { db } from "../../infrastructure/database";
import { workspaceActionChange } from "../../infrastructure/database/schema";
import { getMembership } from "../access/principal-access";
import { executeDatabaseApplicationCommand } from "../databases/commands/operations";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { editPageContentOperation } from "../pages/content/edit-operation";
import { updatePageOperation } from "../pages/content/operations";
import { removeEmbedPageOperation } from "../pages/hierarchy/operations";
import { deletePageOperation } from "../pages/lifecycle/operations";
import { favoritePageOperation, unfavoritePageOperation } from "../pages/navigation/operations";
import { deterministicActionId } from "./receipts";

type ChangeRow = typeof workspaceActionChange.$inferSelect;
type DatabaseInverse = {
  command: DatabaseCommandRequest["command"];
  databaseId: string;
  dataSourceId?: string | null;
};
type PageInverse = { op: string; input: Record<string, unknown> };

const isPageInverse = (inverse: unknown): inverse is PageInverse =>
  !!inverse && typeof inverse === "object" && "op" in inverse;

/**
 * Undoes one AI action call as the signed-in user: recorded inverses run
 * latest first through the same services as the UI. Changes inside a page or
 * database the call created are covered by moving that item to the trash.
 * Nothing runs when any remaining change has no recorded inverse.
 */
export async function undoWorkspaceAction(
  context: ServerOperationContext,
  input: { workspaceId: string; invocationId: string; callId: string },
  dependencies = { execute: executeDatabaseApplicationCommand },
) {
  requireOperationPolicy(context, { write: true });
  const user = requireOperationActor(context);
  requireOperationWorkspace(context, input.workspaceId);
  if (!(await getMembership(input.workspaceId, user.id)))
    throw new ServerOperationError({ error: "Forbidden" }, 403);

  const rows = await db
    .select()
    .from(workspaceActionChange)
    .where(
      and(
        eq(workspaceActionChange.invocationId, input.invocationId),
        eq(workspaceActionChange.callId, input.callId),
        eq(workspaceActionChange.workspaceId, input.workspaceId),
        eq(workspaceActionChange.userId, user.id),
        isNull(workspaceActionChange.undoneAt),
      ),
    )
    .orderBy(desc(workspaceActionChange.opIndex));
  if (!rows.length) throw new ServerOperationError({ error: "Nothing to undo" }, 404);

  const createdDatabases = new Set(
    rows.flatMap((row) =>
      row.commandType === "database.create" && row.databaseId ? [row.databaseId] : [],
    ),
  );
  const createdPages = new Set(
    rows.flatMap((row) =>
      row.commandType === "page.create" && isPageInverse(row.inverse)
        ? [String(row.inverse.input.pageId)]
        : [],
    ),
  );
  const covered = (row: ChangeRow) =>
    (row.commandType !== "database.create" &&
      !!row.databaseId &&
      createdDatabases.has(row.databaseId)) ||
    (row.commandType !== "page.create" &&
      isPageInverse(row.inverse) &&
      createdPages.has(String(row.inverse.input.pageId)));
  const pending = rows.filter((row) => !covered(row));
  const missing = [...new Set(pending.filter((row) => !row.inverse).map((row) => row.commandType))];
  if (missing.length)
    throw new ServerOperationError(
      { error: `These changes can't be undone yet: ${missing.join(", ")}.` },
      409,
    );

  for (const row of pending) {
    await applyInverse(context, row, dependencies.execute);
    await markUndone([row.id]);
  }
  await markUndone(rows.filter(covered).map((row) => row.id));
  return { undone: pending.length };
}

async function applyInverse(
  context: ServerOperationContext,
  row: ChangeRow,
  execute: typeof executeDatabaseApplicationCommand,
) {
  const inverse = row.inverse;
  const commandId = await deterministicActionId("undo", row.id);
  if (!isPageInverse(inverse)) {
    const command = inverse as DatabaseInverse;
    await execute(context, {
      databaseId: command.databaseId,
      dataSourceId: command.dataSourceId ?? null,
      request: { command: command.command, commandId, protocolVersion: 2 },
    });
    return;
  }
  const pageId = String(inverse.input.pageId);
  switch (inverse.op) {
    case "page.delete":
      await deletePageOperation(context, { pageId });
      return;
    case "page.favorite":
      await (inverse.input.favorite ? favoritePageOperation : unfavoritePageOperation)(context, {
        pageId,
      });
      return;
    case "page.unembed":
      await removeEmbedPageOperation(context, {
        pageId,
        body: { itemId: inverse.input.itemId, kind: inverse.input.kind },
      });
      return;
    case "page.update":
      await updatePageOperation(context, {
        pageId,
        body: { name: inverse.input.name, metadata: inverse.input.metadata },
      });
      return;
    case "page.edit":
      await editPageContentOperation(context, {
        pageId,
        edits: inverse.input.edits as never,
        editId: commandId,
      });
      return;
    default:
      throw new ServerOperationError({ error: `Unknown undo step ${inverse.op}` }, 500);
  }
}

async function markUndone(ids: string[]) {
  for (const id of ids)
    await db
      .update(workspaceActionChange)
      .set({ undoneAt: new Date() })
      .where(eq(workspaceActionChange.id, id));
}
