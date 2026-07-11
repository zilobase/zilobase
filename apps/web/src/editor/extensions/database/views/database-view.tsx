import { Loader2 } from "lucide-react"

import { DatabaseSetupCard } from "../setup/database-setup-card"
import { DatabaseViewProvider } from "./database-view-context"
import { DatabaseViewToolbar } from "./database-view-toolbar"
import { DatabaseKanbanView } from "./kanban/database-kanban-view"
import { DatabaseTableView } from "./table/database-table-view"
import { DatabaseTimelineView } from "./timeline/database-timeline-view"
import {
  useDatabaseViewController,
  type DatabaseViewProps,
} from "./use-database-view-controller"

export type { DatabaseViewProps }

function DatabaseViewContent({ viewType }: { viewType?: string }) {
  if (viewType === "kanban") return <DatabaseKanbanView />
  if (viewType === "timeline") return <DatabaseTimelineView />
  return <DatabaseTableView />
}

export function DatabaseView(props: DatabaseViewProps) {
  const {
    className,
    context,
    databaseId,
    handleDatabaseBlockDragOver,
    handleDatabaseBlockDrop,
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
          ) : isLoading || !payload ? (
            <div className="database-empty-state">
              <Loader2 className="animate-spin" />
              <span>Loading database...</span>
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
