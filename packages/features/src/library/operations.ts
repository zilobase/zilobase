import {
  captureClientOperation,
  clientDatabaseController,
  type ClientOperationContext,
} from "../shared/operation-context";
import { createPage } from "../pages/content-operations";
import { setPageFavorite } from "../pages/navigation-operations";
import { pagesQueryKey } from "../pages/queries";
import { addDatabaseRow } from "../databases/mutations/rows-operations";
import { databaseBootstrapQueryOptions } from "../databases/queries/bootstrap";
import { resolveDatabaseBootstrap } from "../databases/cache-references";
import type { HomepageRow } from "./model";

export type CreateLibraryItemInput = {
  workspaceId: string;
  parent?: HomepageRow;
  favorite?: boolean;
};

export function canCreateLibraryChild(parent?: HomepageRow) {
  return (
    !parent ||
    parent.itemKind === "page" ||
    parent.itemKind === "database" ||
    parent.itemKind === "teamspace"
  );
}

export async function createLibraryItem(
  context: ClientOperationContext,
  input: CreateLibraryItemInput,
) {
  const operation = captureClientOperation(context);
  const { context: captured, assertCurrent } = operation;
  const parent = input.parent;
  if (!canCreateLibraryChild(parent)) throw new Error("This item cannot contain pages.");
  if (parent?.itemKind === "database" && parent.openDatabaseId) {
    const controller = clientDatabaseController(captured);
    const reference = await captured.queryClient.fetchQuery(
      databaseBootstrapQueryOptions(
        captured.apiFetch,
        controller.sessionId,
        { databaseId: parent.openDatabaseId },
        captured.queryClient,
      ),
    );
    assertCurrent();
    const bootstrap = resolveDatabaseBootstrap(captured.queryClient, reference);
    const source =
      bootstrap?.dataSources.find((entry) => entry.id === bootstrap.views[0]?.dataSourceId) ??
      bootstrap?.dataSources[0];
    if (!source) throw new Error("The database has no source for new pages.");
    const record = await addDatabaseRow(captured, {
      databaseId: source.id,
      hostDatabaseId: parent.openDatabaseId,
      title: "Untitled",
    });
    assertCurrent();
    await captured.queryClient.invalidateQueries({ queryKey: pagesQueryKey(input.workspaceId) });
    return { pageId: record.pageId };
  }
  if (parent?.itemKind === "page" && !parent.openPageId)
    throw new Error("The parent page is unavailable.");
  const page = await createPage(captured, {
    workspaceId: input.workspaceId,
    name: "Untitled",
    ...(parent?.itemKind === "page" ? { parentItemId: parent.openPageId! } : {}),
    ...(parent ? { teamspaceId: parent.teamspaceId } : {}),
  });
  assertCurrent();
  if (input.favorite) await setPageFavorite(captured, { pageId: page.id, isFavorite: true });
  return { pageId: page.id };
}
