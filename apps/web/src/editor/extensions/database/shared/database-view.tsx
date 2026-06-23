import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

import { DatabaseViewContent } from "./database-view-content"
import { DatabaseViewProvider, useDatabaseViewContext } from "./database-view-context"
import { DatabaseViewToolbar } from "./database-view-toolbar"
import {
  useDatabaseViewController,
  type DatabaseViewProps,
} from "./use-database-view-controller"

export type { DatabaseViewProps }

export function DatabaseView(props: DatabaseViewProps) {
  const {
    className,
    context,
    databaseId,
    handleDatabaseBlockDragOver,
    handleDatabaseBlockDrop,
    isLoading,
    payload,
    viewType,
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
          <DatabaseRealtimeStatusBanner />
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
        </div>
      </div>
    </DatabaseViewProvider>
  )
}

function DatabaseRealtimeStatusBanner() {
  const { editable, realtimeStatus } = useDatabaseViewContext()

  if (
    !editable ||
    realtimeStatus === "connected" ||
    realtimeStatus === "offline"
  ) {
    return null
  }

  const message =
    realtimeStatus === "connecting"
      ? "Connecting to database updates…"
      : "Reconnecting — database changes sync when the connection restores"

  return (
    <p
      className={cn(
        "mx-3 mb-2 rounded-md border px-3 py-2 text-xs",
        realtimeStatus === "connecting"
          ? "border-border text-muted-foreground"
          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200",
      )}
    >
      {message}
    </p>
  )
}
