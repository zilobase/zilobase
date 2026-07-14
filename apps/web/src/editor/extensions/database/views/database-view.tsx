import { DatabaseSetupCard } from "../setup/database-setup-card"
import { DatabaseViewProvider } from "./database-view-context"
import { DatabaseViewSkeleton } from "./database-view-skeleton"
import { DatabaseViewToolbar } from "./database-view-toolbar"
import { DatabaseKanbanView } from "./kanban/database-kanban-view"
import { DatabaseTableView } from "./table/database-table-view"
import { DatabaseTimelineView } from "./timeline/database-timeline-view"
import { DatabaseChartView } from "./chart/database-chart-view"
import {
  useDatabaseViewController,
  type DatabaseViewProps,
} from "./use-database-view-controller"

export type { DatabaseViewProps }

function DatabaseViewContent({ viewType }: { viewType?: string }) {
  if (viewType === "kanban") return <DatabaseKanbanView />
  if (viewType === "timeline") return <DatabaseTimelineView />
  if (viewType === "chart") return <DatabaseChartView />
  return <DatabaseTableView />
}

export function DatabaseView(props: DatabaseViewProps) {
  const {
    className,
    context,
    databaseId,
    error,
    handleDatabaseBlockDragOver,
    handleDatabaseBlockDrop,
    isError,
    isLoading,
    onDismissSetup,
    onSetupComplete,
    workspaceId,
    payload,
    sourcePropertyDialog,
    setupMode,
    viewType,
    pageId,
  } = useDatabaseViewController(props)

  return (
    <DatabaseViewProvider value={context}>
      <div
        className={className}
        contentEditable={false}
        onDragOver={handleDatabaseBlockDragOver}
        onDrop={handleDatabaseBlockDrop}
      >
        <div className="database-toolbar-section">
          <DatabaseViewToolbar />
        </div>
        <div className="database-scroll-section">
          {!databaseId ? (
            <div className="database-empty-state">
              <span>Database reference missing.</span>
            </div>
          ) : isLoading ? (
            <DatabaseViewSkeleton viewType={viewType} />
          ) : isError ? (
            <div className="database-empty-state">
              <span>
                {error instanceof Error
                  ? error.message
                  : "This database is unavailable."}
              </span>
            </div>
          ) : !payload ? (
            <div className="database-empty-state">
              <span>This database is unavailable.</span>
            </div>
          ) : (
            <DatabaseViewContent viewType={viewType} />
          )}
          {setupMode && databaseId ? (
            <DatabaseSetupCard
              databaseId={databaseId}
              onComplete={onSetupComplete ?? (() => {})}
              onDismiss={onDismissSetup ?? (() => {})}
              workspaceId={workspaceId}
              pageId={pageId}
            />
          ) : null}
        </div>
        {sourcePropertyDialog}
      </div>
    </DatabaseViewProvider>
  )
}
