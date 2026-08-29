import { useEffect, useRef } from "react"

type UseDatabaseRowsScrollOptions = {
  enabled?: boolean
  fetchNextPage: () => Promise<void>
  hasNextPage: boolean
  isFetchingNextPage: boolean
}

export function useDatabaseRowsScroll({
  enabled = true,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: UseDatabaseRowsScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enabled || !hasNextPage || isFetchingNextPage) {
      return
    }

    const sentinel = sentinelRef.current

    if (!sentinel) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchNextPage()
        }
      },
      {
        root: null,
        rootMargin: "400px",
      },
    )

    observer.observe(sentinel)

    return () => observer.disconnect()
  }, [enabled, fetchNextPage, hasNextPage, isFetchingNextPage])

  return { sentinelRef }
}