type SourceView = {
  dataSourceId: string;
  dataSourceName?: string;
  sourceParentDatabaseId?: string;
};
type SourceHost = {
  databaseId?: string | null;
  hostDatabaseId?: string | null;
  hostDatabaseName?: string | null;
  databaseWorkspaceId?: string | null;
  hostDatabaseWorkspaceId?: string | null;
  workspaceId?: string | null;
};

export function getToolbarSourceIdentity(host: SourceHost) {
  return {
    databaseId: host.hostDatabaseId ?? host.databaseId ?? "",
    workspaceId:
      host.hostDatabaseWorkspaceId ?? host.databaseWorkspaceId ?? host.workspaceId ?? undefined,
    expandDatabaseId: host.hostDatabaseId ?? host.databaseId,
  };
}

export function getToolbarSourceTitle(
  host: SourceHost,
  view: SourceView | undefined,
  draftTitle: string,
) {
  const external = Boolean(
    view?.sourceParentDatabaseId &&
    host.hostDatabaseId &&
    view.sourceParentDatabaseId !== host.hostDatabaseId,
  );
  return external
    ? host.hostDatabaseName || "Untitled"
    : draftTitle || host.hostDatabaseName || "Untitled";
}

export function getToolbarFallbackSources(
  hostDatabaseId: string | null | undefined,
  view: SourceView | undefined,
  name: string,
  viewCount: number,
) {
  if (!hostDatabaseId || !view?.dataSourceId) return [];
  return [
    {
      hiddenViewCount: 0,
      id: view.dataSourceId,
      name,
      parentDatabaseId: view.sourceParentDatabaseId ?? hostDatabaseId,
      viewCount,
    },
  ];
}

export function getToolbarActiveView(
  view: (SourceView & { type: string }) | undefined,
  activeView: { type: string } | null,
  hostTitle: string,
) {
  return {
    activeDataSourceId: view?.dataSourceId,
    activeDataSourceName: view?.dataSourceName ?? hostTitle,
    activeViewType: activeView?.type ?? view?.type,
  };
}
