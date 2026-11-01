import { resolvePageDetailReference } from "../../pages/cache";
import { deletePage, updatePage } from "../../pages/content-operations";
import { setPageFavorite } from "../../pages/navigation-operations";
import { pageQueryOptions, pagesQueryKey } from "../../pages/queries";
import {
  captureClientOperation,
  clientDatabaseController,
  type ClientOperationContext,
} from "../../shared/operation-context";
import type { DatabaseRecordEntity } from "../core/entities";
import type { SortableDatabaseItem } from "../interactions/item-utils";
import { buildRowDuplicate, buildRowMoveToPage } from "../mutations/command-builders";
import { DatabaseCommandUnconfirmedError } from "../mutations/execute";
import { addDatabaseRow } from "../mutations/rows-operations";
export type DatabaseRowAction =
  | { type: "favorite"; favorite: boolean }
  | { type: "icon"; icon: string | null }
  | { type: "duplicate" }
  | { type: "trash" }
  | { type: "movePage"; pageId: string }
  | {
      type: "moveDatabase";
      databaseId: string;
      dataSourceId: string;
      propertyMode: "match" | "duplicate";
    };

export type DatabaseRowActionResult = {
  succeeded: string[];
  failed: Array<{ rowId: string; error: Error }>;
  created: DatabaseRecordEntity[];
  expired: boolean;
};

/** Parents precede selected children; independent rows retain displayed selection order. */
export function orderDatabaseRowActions<T extends { id: string; parentRowId?: string | null }>(
  rows: T[],
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered: T[] = [];
  const visited = new Set<string>();
  const add = (row: T) => {
    if (visited.has(row.id)) return;
    visited.add(row.id);
    const parent = row.parentRowId ? byId.get(row.parentRowId) : undefined;
    if (parent) add(parent);
    ordered.push(row);
  };
  rows.forEach(add);
  return ordered;
}

export async function runDatabaseRecordActions(
  context: ClientOperationContext & { isCurrent?: () => boolean },
  input: {
    databaseId: string;
    hostDatabaseId?: string | null;
    workspaceId?: string | null;
    rows: SortableDatabaseItem[];
    action: DatabaseRowAction;
  },
): Promise<DatabaseRowActionResult> {
  const { databaseId, hostDatabaseId, workspaceId, rows, action } = input;
  const { queryClient, apiFetch } = context;
  const store = clientDatabaseController(context);
  const result: DatabaseRowActionResult = {
    succeeded: [],
    failed: [],
    created: [],
    expired: false,
  };
  if (!rows.length) return result;
  const authorization = captureClientOperation(context);
  const valid = () => authorization.isCurrent() && (context.isCurrent?.() ?? true);
  const assertCurrent = () => {
    if (!valid()) throw new Error("Record action scope expired");
  };
  const copies = new Map<string, string>();
  try {
    // Authorize the complete selection before any mutation. These are the existing page reads.
    for (const row of rows) {
      const ref = await queryClient.fetchQuery(pageQueryOptions(apiFetch, row.pageId));
      assertCurrent();
      const detail = resolvePageDetailReference(queryClient, ref);
      if (!detail || (detail.accessLevel !== "edit" && detail.accessLevel !== "full"))
        throw new Error("Every selected record must be editable");
      if (action.type === "trash" && detail.accessLevel !== "full")
        throw new Error("Full access is required to move a page to trash");
      if (action.type !== "favorite" && detail.page.metadata?.locked)
        throw new Error("Unlock the selected pages before editing them");
    }
    for (const row of orderDatabaseRowActions(rows)) {
      if (!valid()) {
        result.expired = true;
        break;
      }
      try {
        if (action.type === "favorite")
          await setPageFavorite(context, { pageId: row.pageId, isFavorite: action.favorite });
        else if (action.type === "icon") {
          await updatePage(context, { id: row.pageId, metadata: { emoji: action.icon } });
        } else if (action.type === "trash") await deletePage(context, row.pageId);
        else if (action.type === "moveDatabase") {
          await addDatabaseRow(context, {
            databaseId: action.dataSourceId,
            hostDatabaseId: action.databaseId,
            pageId: row.pageId,
            sourceHostDatabaseId: hostDatabaseId ?? databaseId,
            sourceDataSourceId: databaseId,
            sourceRowId: row.id,
            sourcePropertyMode: action.propertyMode,
          });
        } else {
          const parent =
            row.parentRowId && rows.some((item) => item.id === row.parentRowId)
              ? copies.get(row.parentRowId)
              : undefined;
          if (
            action.type === "duplicate" &&
            row.parentRowId &&
            rows.some((item) => item.id === row.parentRowId) &&
            !parent
          )
            throw new Error("The selected parent could not be duplicated");
          const scope = { hostDatabaseId: hostDatabaseId ?? databaseId, dataSourceId: databaseId };
          const ack = await store.submit(
            action.type === "duplicate"
              ? buildRowDuplicate(scope, { rowId: row.id, parentRowId: parent })
              : buildRowMoveToPage(scope, { rowId: row.id, pageId: action.pageId }),
            action.type === "movePage"
              ? [{ dataSourceId: databaseId, rowId: row.id, remove: true }]
              : [],
          );
          assertCurrent();
          if (action.type === "duplicate") {
            const created = ack.result as DatabaseRecordEntity;
            result.created.push(created);
            copies.set(row.id, created.id);
          }
        }
        assertCurrent();
        result.succeeded.push(row.id);
      } catch (cause) {
        if (!valid()) {
          result.expired = true;
          break;
        }
        const error = cause instanceof Error ? cause : new Error(String(cause));
        result.failed.push({ rowId: row.id, error });
        if (error instanceof DatabaseCommandUnconfirmedError) {
          for (const remaining of rows)
            if (
              !result.succeeded.includes(remaining.id) &&
              !result.failed.some((item) => item.rowId === remaining.id)
            )
              result.failed.push({ rowId: remaining.id, error });
          break;
        }
      }
    }
    if (valid() && workspaceId)
      await queryClient.invalidateQueries({ queryKey: pagesQueryKey(workspaceId) });
  } catch (cause) {
    result.expired = !valid();
    if (!result.expired)
      result.failed = rows.map((row) => ({
        rowId: row.id,
        error: cause instanceof Error ? cause : new Error(String(cause)),
      }));
  }
  return result;
}

export type RunDatabaseRecordActionsInput = Parameters<typeof runDatabaseRecordActions>[1];
export type RunDatabaseRecordActionsResult = Awaited<ReturnType<typeof runDatabaseRecordActions>>;
