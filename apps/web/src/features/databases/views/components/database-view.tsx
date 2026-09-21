import { DatabaseSetupCard } from "../../setup/components/database-setup-card"
import { DatabaseViewProvider } from "../state/database-view-context"
import { DatabaseViewSkeleton } from "./database-view-skeleton"
import { DatabaseViewToolbar } from "./database-view-toolbar"
import { DatabaseKanbanView } from "../kanban/components/database-kanban-view"
import { DatabaseTableView } from "../table/components/database-table-view"
import { DatabaseTimelineView } from "../timeline/components/database-timeline-view"
import { DatabaseChartView } from "../chart/components/database-chart-view"
import { DatabaseGalleryView } from "../gallery/components/database-gallery-view"
import { DatabaseListView } from "../list/components/database-list-view"
import { DatabaseFormView } from "../form/components/database-form-view"
import {
  useDatabaseViewController,
  type DatabaseViewProps,
} from "../controller/use-database-view-controller"
import { DatabaseTrashBanner } from "../../core/database-trash-banner"

export type { DatabaseViewProps }

function DatabaseViewContent({ viewType }: { viewType?: string }) {
  if (viewType === "kanban") return <DatabaseKanbanView />
  if (viewType === "timeline") return <DatabaseTimelineView />
  if (viewType === "chart") return <DatabaseChartView />
  if (viewType === "gallery") return <DatabaseGalleryView />
  if (viewType === "list") return <DatabaseListView />
  if (viewType === "form") return <DatabaseFormView />
  return <DatabaseTableView />
}

export function DatabaseView(props: DatabaseViewProps) {
  const {
    className,
    context,
    dataSourceSetupOpen,
    databaseDeleted,
    databaseId,
    error,
    handleDatabaseBlockDragOver,
    handleDatabaseBlockDrop,
    isError,
    isLoading,
    onDismissSetup,
    onDataSourceSetupClose,
    onDataSourceSetupSelect,
    onSetupComplete,
    workspaceId,
    viewData,
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
        {props.showTrashedBanner && databaseDeleted && databaseId ? (
          <DatabaseTrashBanner
            databaseId={databaseId}
            showRestore={props.editable !== false}
          />
        ) : null}
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
          ) : !viewData ? (
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
          {dataSourceSetupOpen && databaseId ? (
            <DatabaseSetupCard
              databaseId={databaseId}
              onComplete={onDataSourceSetupClose}
              onDismiss={onDataSourceSetupClose}
              onSelectDataSource={onDataSourceSetupSelect}
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
