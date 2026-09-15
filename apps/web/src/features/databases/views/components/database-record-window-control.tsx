import { Loader2 } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"

import { useDatabaseRowsScroll } from "../../interactions/use-database-rows-scroll"
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
} from "../state/database-view-context"

export function DatabaseRecordWindowControl({
  automatic = false,
}: {
  automatic?: boolean
}) {
  const { fetchNextPage } = useDatabaseActionsContext()
  const { hasNextPage, isFetchingNextPage } = useDatabaseDataContext()
  const { sentinelRef } = useDatabaseRowsScroll({
    enabled: automatic,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  })

  if (!hasNextPage && !isFetchingNextPage) {
    return null
  }

  return (
    <div
      className="flex h-12 items-center justify-center gap-2 text-sm text-content-secondary"
      ref={automatic ? sentinelRef : undefined}
    >
      {isFetchingNextPage ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          <span>Loading more rows...</span>
        </>
      ) : automatic ? null : (
        <Button
          onClick={() => void fetchNextPage()}
          size="sm"
          type="button"
          variant="ghost"
        >
          Load more rows
        </Button>
      )}
    </div>
  )
}
