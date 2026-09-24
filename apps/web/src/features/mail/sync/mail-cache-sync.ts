import type {
  MailSyncRequest,
  MailSyncResponse,
  MailView,
} from "@zilobase/features/mail/contracts";
import type { apiFetch } from "@/platform/network/api";
import {
  applyMailSyncResponse,
  type MailDatabase,
  type MailSyncStateRecord,
} from "../storage/mail-database";

export async function synchronizeMailCache(
  {
    database,
    mailBasePath,
    connectionId,
    view,
  }: {
    database: MailDatabase;
    mailBasePath: string;
    connectionId: string;
    view: MailView;
  },
  request: typeof apiFetch,
  options: { loadMore?: boolean; search?: string } = {},
) {
  let state = await database.syncState.get("primary");
  let page = 0;
  let last: { response: MailSyncResponse; isSearch: boolean } | null = null;
  while (page < 20) {
    const requestOptions = page === 0 ? options : { loadMore: true };
    const { syncRequest, isSearch } = buildMailSyncRequest(
      connectionId,
      view,
      state,
      requestOptions,
    );
    const response = await request<MailSyncResponse>(`${mailBasePath}/sync`, {
      body: JSON.stringify(syncRequest),
      method: "POST",
    });
    await applyMailSyncResponse(database, response, view, {
      advanceHistory: !isSearch && (Boolean(syncRequest.historyId) || !state?.historyId),
      markViewLoaded: !isSearch,
      reconcileView: !isSearch && response.mode !== "incremental",
      resetViewListing:
        page === 0 && !requestOptions.loadMore && !state?.listedThreadIds?.[view]?.length,
    });
    last = { response, isSearch };
    if (isSearch || response.mode === "incremental" || !response.nextPageToken) break;
    state = await database.syncState.get("primary");
    page += 1;
  }
  return last!;
}

function buildMailSyncRequest(
  connectionId: string,
  view: MailView,
  state: MailSyncStateRecord | undefined,
  options: { loadMore?: boolean; search?: string },
) {
  const isSearch = Boolean(options.search?.trim());
  const loaded = state?.loadedViews?.[view] === true;
  const continueListing =
    !isSearch &&
    !options.loadMore &&
    Boolean(state?.listedThreadIds?.[view]?.length && state?.pageTokens[view]);
  const syncRequest: MailSyncRequest = {
    connectionId: connectionId,
    historyId:
      !options.loadMore && !isSearch && !continueListing && loaded
        ? (state?.historyId ?? undefined)
        : undefined,
    pageToken: options.loadMore || continueListing ? state?.pageTokens[view] : undefined,
    query: isSearch ? options.search!.trim() : undefined,
    view: view,
  };
  return { syncRequest, isSearch };
}
