import { Skeleton } from "@/components/ui/skeleton"

function DatabaseTableSkeleton() {
  return (
    <div className="overflow-hidden border-y">
      <div className="grid grid-cols-[minmax(180px,1.6fr)_repeat(3,minmax(120px,1fr))] border-b bg-muted/20">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="border-r p-3 last:border-r-0" key={index}>
            <Skeleton className={index === 0 ? "h-4 w-28" : "h-4 w-20"} />
          </div>
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, rowIndex) => (
        <div
          className="grid grid-cols-[minmax(180px,1.6fr)_repeat(3,minmax(120px,1fr))] border-b last:border-b-0"
          key={rowIndex}
        >
          {Array.from({ length: 4 }).map((_, columnIndex) => (
            <div className="border-r p-3 last:border-r-0" key={columnIndex}>
              <Skeleton
                className={
                  columnIndex === 0
                    ? `h-4 ${rowIndex % 2 === 0 ? "w-3/4" : "w-1/2"}`
                    : `h-4 ${rowIndex % 3 === 0 ? "w-2/3" : "w-1/2"}`
                }
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function DatabaseKanbanSkeleton() {
  return (
    <div className="flex min-w-max gap-4 overflow-hidden py-2">
      {Array.from({ length: 3 }).map((_, columnIndex) => (
        <div className="w-64 shrink-0 space-y-2" key={columnIndex}>
          <div className="flex items-center justify-between px-1 py-2">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="size-5 rounded-full" />
          </div>
          {Array.from({ length: columnIndex === 1 ? 2 : 3 }).map(
            (_, cardIndex) => (
              <div className="space-y-4 rounded-lg border p-3" key={cardIndex}>
                <Skeleton className="h-4 w-4/5" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ),
          )}
        </div>
      ))}
    </div>
  )
}

function DatabaseTimelineSkeleton() {
  return (
    <div className="overflow-hidden border-y">
      <div className="flex h-12 items-center border-b">
        <div className="w-56 shrink-0 border-r px-3">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex flex-1 justify-around px-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton className="h-3 w-12" key={index} />
          ))}
        </div>
      </div>
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="flex h-10 items-center border-b last:border-b-0" key={index}>
          <div className="flex h-full w-56 shrink-0 items-center border-r px-3">
            <Skeleton className={index % 2 === 0 ? "h-4 w-32" : "h-4 w-24"} />
          </div>
          <div className="relative h-full flex-1 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px)] bg-[size:25%_100%]">
            <Skeleton
              className={`absolute top-2 h-6 rounded ${index % 2 === 0 ? "left-[8%] w-[28%]" : "left-[38%] w-[22%]"}`}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function DatabaseChartSkeleton() {
  return (
    <div className="flex h-[360px] items-end gap-4 px-8 py-8">
      {[42, 70, 54, 88, 64, 76].map((height, index) => (
        <div className="flex h-full flex-1 items-end" key={index}>
          <Skeleton
            className="w-full rounded-t-md"
            style={{ height: `${height}%` }}
          />
        </div>
      ))}
    </div>
  )
}

export function DatabaseViewSkeleton({ viewType }: { viewType?: string }) {
  return (
    <div aria-label="Loading database" className="py-2" role="status">
      {viewType === "kanban" ? (
        <DatabaseKanbanSkeleton />
      ) : viewType === "timeline" ? (
        <DatabaseTimelineSkeleton />
      ) : viewType === "chart" ? (
        <DatabaseChartSkeleton />
      ) : (
        <DatabaseTableSkeleton />
      )}
    </div>
  )
}
