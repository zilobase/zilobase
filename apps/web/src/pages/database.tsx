import { useEffect, useState } from "react"
import { Link, useParams, useRouteContext, useSearch } from "@tanstack/react-router"
import { ArrowRight, ArrowUpRight, Maximize2 } from "@/components/icons"

import { AuthenticatedRouteError } from "@/components/authenticated-route-error"
import { FallbackErrorBoundary } from "@/components/fallback-error-boundary"
import {
  PageSidePaneLayout,
  PageSidePaneProvider,
  usePageSidePane,
} from "@/contexts/page-side-pane"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { TrashedItemBanner } from "@/components/trashed-item-banner"
import { cn } from "@/lib/utils"
import {
  getDatabaseCover,
  getDatabaseEmoji,
  getDatabaseIconPosition,
  isDatabaseLocked,
} from "@zilobase/features/databases"
import {
  usePage,
  usePageAccessLevel,
  type PageIconPosition,
} from "@zilobase/features/pages"
import {
  useDatabase,
  useRestoreDatabase,
  useUpdateDatabase,
  useUpdateDataSource,
} from "@zilobase/features/databases"
import { EmbeddedPageDialog } from "@/components/embedded-page-dialog"
import { useOpenEmbeddedPage } from "@/hooks/use-open-embedded-page"
import { PageMetadata as PageMetadataView } from "@/packages/editor/components/editor/page-metadata"
import { DatabaseView } from "@/packages/editor/extensions/database"
import { toast } from "sonner"
import {
  PublicPaneTopbar,
  PublicPageBreadcrumb,
  PageEditorPane,
} from "@/pages/page"
import { useDatabaseViewNavigation } from "@/pages/use-database-view-navigation"
import type { OpenPageOptions } from "@/packages/editor/types"
import { useTitleDraft } from "@/hooks/use-title-draft"
import { useConnectivity, useOfflineManifest } from "@/providers/offline-provider"

export default function DatabasePage() {
  const { databaseId } = useParams({ from: "/d/$databaseId" })
  const { publishedShare } = useRouteContext({ from: "/d/$databaseId" })

  if (publishedShare === "public") {
    return <PublicDatabasePage />
  }

  return (
    <FallbackErrorBoundary
      fallback={<AuthenticatedRouteError resource="database" />}
      key={databaseId}
      name="database.authenticated"
    >
      <AuthenticatedDatabasePage />
    </FallbackErrorBoundary>
  )
}

function AuthenticatedDatabasePage() {
  const connectivity = useConnectivity()
  const offlineManifest = useOfflineManifest()
  const { databaseId } = useParams({ from: "/d/$databaseId" })
  const { view: activeDatabaseViewId } = useSearch({
    from: "/d/$databaseId",
  })
  const { data: payload, isLoading } = useDatabase(databaseId, {
    includeDeleted: true,
  })
  const databasePageId = payload?.database.pageId ?? null
  const { data: page } = usePage(databasePageId, {
    refetchOnMount: false,
  })
  const {
    renderedSidePanePageId,
    sidePaneAnimatedOpen,
    sidePaneContentReady,
    sidePaneDatabaseId,
  } = usePageSidePane()
  const { openPage } = useOpenEmbeddedPage({
    contextPageId: databasePageId,
    databaseId,
    page,
  })
  const handleOpenPage = (pageId: string, options?: OpenPageOptions) => {
    openPage(pageId, options)
  }

  if (isLoading) {
    if (
      (connectivity === "offline" || connectivity === "service-unavailable") &&
      !offlineManifest.items.some(
        (item) => item.kind === "database" && item.id === databaseId,
      )
    ) {
      return (
        <main className="flex min-h-[calc(100svh-3rem)] items-center justify-center px-4 text-sm text-muted-foreground">
          Not available offline.
        </main>
      )
    }
    return (
      <main className="min-h-[calc(100svh-3rem)] animate-in fade-in duration-200">
        <DatabasePageSkeleton />
      </main>
    )
  }

  if (!payload) {
    return (
      <main className="flex min-h-[calc(100svh-3rem)] items-center justify-center px-4 text-sm text-muted-foreground">
        Database not found.
      </main>
    )
  }

  return (
    <PageSidePaneLayout
      className="animate-in fade-in-0 duration-300"
      main={
        <DatabaseMainPane
          activeDatabaseViewId={activeDatabaseViewId}
          databaseId={databaseId}
          onOpenPage={handleOpenPage}
        />
      }
      sidePane={
        sidePaneContentReady && renderedSidePanePageId ? (
          <PageEditorPane
            databaseId={sidePaneDatabaseId ?? databaseId}
            enableComments={false}
            key={renderedSidePanePageId}
            onOpenPage={openPage}
            pageId={renderedSidePanePageId}
          />
        ) : null
      }
      sidePaneOpen={sidePaneAnimatedOpen}
      sidePaneVisible={renderedSidePanePageId !== null}
    />
  )
}

function PublicDatabasePage() {
  const { databaseId } = useParams({ from: "/d/$databaseId" })

  return (
    <PageSidePaneProvider resetKey={databaseId}>
      <PublicDatabaseContent databaseId={databaseId} />
    </PageSidePaneProvider>
  )
}

function PublicDatabaseContent({ databaseId }: { databaseId: string }) {
  const { view: activeDatabaseViewId } = useSearch({
    from: "/d/$databaseId",
  })
  const { data: payload, isLoading } = useDatabase(databaseId)
  const databasePageId = payload?.database.pageId ?? null
  const { data: page } = usePage(databasePageId, {
    refetchOnMount: false,
  })
  const {
    closeSidePane,
    renderedSidePanePageId,
    sidePaneAnimatedOpen,
    sidePaneContentReady,
    sidePaneDatabaseId,
  } = usePageSidePane()
  const { openPage } = useOpenEmbeddedPage({
    contextPageId: databasePageId,
    databaseId,
    page,
  })
  const handleOpenPage = (pageId: string, options?: OpenPageOptions) => {
    openPage(pageId, options)
  }

  if (isLoading) {
    return (
      <main className="min-h-svh animate-in fade-in duration-200 bg-background">
        <DatabasePageSkeleton />
      </main>
    )
  }

  if (!payload) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        Database not found.
      </main>
    )
  }

  return (
    <>
      <PageSidePaneLayout
        className="bg-background animate-in fade-in-0 duration-300"
        standalone
        viewportHeightClass="h-svh"
        main={
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PublicPaneTopbar pageId={databasePageId} />
            <DatabaseMainPane
              activeDatabaseViewId={activeDatabaseViewId}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto"
              databaseId={databaseId}
              onOpenPage={handleOpenPage}
              readOnly
            />
          </div>
        }
        sidePane={
          renderedSidePanePageId ? (
            <PublicDatabaseSidePane
              databaseId={sidePaneDatabaseId ?? databaseId}
              onClose={closeSidePane}
              onOpenPage={handleOpenPage}
              pageId={renderedSidePanePageId}
              ready={sidePaneContentReady}
            />
          ) : null
        }
        sidePaneOpen={sidePaneAnimatedOpen}
        sidePaneVisible={renderedSidePanePageId !== null}
      />
      <EmbeddedPageDialog
        onOpenPage={handleOpenPage}
        pageRenderer={PageEditorPane}
      />
    </>
  )
}

function PublicDatabaseSidePane({
  databaseId,
  onClose,
  onOpenPage,
  pageId,
  ready,
}: {
  databaseId: string
  onClose: () => void
  onOpenPage: (pageId: string, options?: OpenPageOptions) => void
  pageId: string
  ready: boolean
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <div className="flex shrink-0 items-center gap-1">
          <Button
            aria-label="Close side pane"
            onClick={onClose}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ArrowRight />
          </Button>
          <Button
            aria-label="Open as main page"
            asChild
            size="icon-sm"
            variant="ghost"
          >
            <Link params={{ pageId }} to="/p/$pageId">
              <Maximize2 />
            </Link>
          </Button>
        </div>
        <PublicPageBreadcrumb pageId={pageId} />
      </div>
      {ready ? (
        <PageEditorPane
          className="min-h-0 flex-1"
          databaseId={databaseId}
          enableComments={false}
          key={pageId}
          onOpenPage={onOpenPage}
          readOnly
          pageId={pageId}
        />
      ) : null}
    </div>
  )
}

export function DatabaseMainPane({
  activeDatabaseViewId,
  className,
  databaseId,
  embedded = false,
  onOpenPage,
  readOnly = false,
}: {
  activeDatabaseViewId?: string
  className?: string
  databaseId: string
  embedded?: boolean
  onOpenPage: (pageId: string, options?: OpenPageOptions) => void
  readOnly?: boolean
}) {
  const connectivity = useConnectivity()
  const {
    activeViewId: localActiveViewId,
    selectView: selectLocalView,
  } = useDatabaseViewNavigation({
    databaseId,
    requestedViewId: activeDatabaseViewId,
  })
  const { data: payload } = useDatabase(databaseId, {
    includeDeleted: true,
  })
  const databasePageId = payload?.database.pageId ?? null
  const { data: accessLevel } = usePageAccessLevel(databasePageId)
  const updateDatabase = useUpdateDatabase()
  const updateDataSource = useUpdateDataSource()
  const restoreDatabase = useRestoreDatabase()
  const [cover, setCover] = useState("")
  const [emoji, setEmoji] = useState("")
  const [iconPosition, setIconPosition] =
    useState<PageIconPosition>("inline")
  const [embeddedViewId, setEmbeddedViewId] = useState<string | undefined>()
  const [showDataSourceTitles, setShowDataSourceTitles] = useState(true)
  const activeViewId = embedded ? embeddedViewId : localActiveViewId
  const selectedView =
    payload?.views.find((view) => view.id === activeViewId) ?? payload?.views[0]
  const activeDataSource = payload?.dataSources.find(
    (source) => source.id === selectedView?.dataSourceId,
  )
  const sourceParentDatabaseId = activeDataSource?.parentDatabaseId ?? null
  const { data: sourceContainerPayload } = useDatabase(sourceParentDatabaseId, {
    includeDeleted: true,
  })
  const sourceContainer = sourceContainerPayload?.database
  const sourcePageId = sourceContainer?.pageId ?? null
  const { data: sourceAccessLevel } = usePageAccessLevel(sourcePageId)
  const editable =
    !readOnly &&
    connectivity === "online" &&
    !payload?.database.deletedAt &&
    !isDatabaseLocked(payload?.database) &&
    (payload?.database.accessLevel === "edit" ||
      payload?.database.accessLevel === "full" ||
      accessLevel === "edit" ||
      accessLevel === "full")
  const sourceEditable =
    editable &&
    Boolean(activeDataSource && sourceContainer) &&
    !activeDataSource?.deletedAt &&
    !sourceContainer?.deletedAt &&
    !isDatabaseLocked(sourceContainer) &&
    (sourceContainer?.accessLevel === "edit" ||
      sourceContainer?.accessLevel === "full" ||
      sourceAccessLevel === "edit" ||
      sourceAccessLevel === "full")
  const hasMultipleDataSources = (payload?.dataSources.length ?? 0) > 1
  const headingRecord = hasMultipleDataSources
    ? payload?.database
    : activeDataSource
  const headingEditable = hasMultipleDataSources ? editable : sourceEditable
  const headingTitle = headingRecord?.name ?? ""
  const { setTitle, title } = useTitleDraft({
    enabled: headingEditable,
    onSave: async (nextTitle) => {
      if (!headingRecord) return

      if (hasMultipleDataSources) {
        await updateDatabase.mutateAsync({
          databaseId: headingRecord.id,
          name: nextTitle,
        })
      } else {
        await updateDataSource.mutateAsync({
          databaseId: headingRecord.id,
          name: nextTitle,
        })
      }
    },
    sourceId: headingRecord?.id ?? "no-database-heading",
    sourceTitle: headingTitle,
  })

  useEffect(() => {
    if (!headingRecord) {
      setCover("")
      setEmoji("")
      setIconPosition("inline")
      return
    }

    setCover(getDatabaseCover(headingRecord) ?? "")
    setEmoji(getDatabaseEmoji(headingRecord) ?? "")
    setIconPosition(getDatabaseIconPosition(headingRecord))
  }, [headingRecord])

  const updateCover = (nextCover: string) => {
    setCover(nextCover)

    if (!headingRecord || !headingEditable) {
      return
    }

    const input = {
      databaseId: headingRecord.id,
      config: {
        ...((headingRecord.config ?? {}) as Record<string, unknown>),
        cover: nextCover,
      },
    }

    if (hasMultipleDataSources) updateDatabase.mutate(input)
    else updateDataSource.mutate(input)
  }

  const updateEmoji = (nextEmoji: string) => {
    setEmoji(nextEmoji)

    if (!headingRecord || !headingEditable) {
      return
    }

    const input = {
      databaseId: headingRecord.id,
      config: {
        ...((headingRecord.config ?? {}) as Record<string, unknown>),
        emoji: nextEmoji,
      },
    }

    if (hasMultipleDataSources) updateDatabase.mutate(input)
    else updateDataSource.mutate(input)
  }

  const updateIconPosition = (nextPosition: PageIconPosition) => {
    setIconPosition(nextPosition)

    if (!headingRecord || !headingEditable) {
      return
    }

    const input = {
      databaseId: headingRecord.id,
      config: {
        ...((headingRecord.config ?? {}) as Record<string, unknown>),
        iconPosition: nextPosition,
      },
    }

    if (hasMultipleDataSources) updateDatabase.mutate(input)
    else updateDataSource.mutate(input)
  }
  const updateActiveViewSearch = (viewId: string | null) => {
    if (embedded) {
      setEmbeddedViewId(viewId ?? undefined)
      return
    }

    selectLocalView(viewId)
  }

  const restoreTrashedDatabase = () => {
    if (!payload || restoreDatabase.isPending) {
      return
    }

    restoreDatabase.mutate(payload.database.id, {
      onSuccess: () => {
        toast.success("Database restored.")
      },
      onError: (error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not restore database.",
        )
      },
    })
  }

  return (
    <section className={cn(className, "animate-in fade-in-0 duration-300")}>
      {payload?.database.deletedAt ? (
        <TrashedItemBanner
          itemLabel="database"
          onRestore={restoreTrashedDatabase}
          restoring={restoreDatabase.isPending}
          showRestore={!readOnly}
        />
      ) : null}
      <PageMetadataView
        cover={cover}
        databaseId={
          hasMultipleDataSources ? databaseId : sourceParentDatabaseId
        }
        editable={headingEditable}
        enableComments={false}
        icon={emoji}
        iconPosition={iconPosition}
        layoutSection="heading"
        onCoverChange={updateCover}
        onIconChange={updateEmoji}
        onIconPositionChange={updateIconPosition}
        onOpenPage={onOpenPage}
        onTitleChange={setTitle}
        workspaceId={headingRecord?.workspaceId}
        title={title}
        titlePrefix={
          !hasMultipleDataSources &&
          sourceParentDatabaseId &&
          sourceParentDatabaseId !== databaseId ? (
            <ArrowUpRight
              aria-label={`Linked from ${headingTitle || "another database"}`}
              className="size-6"
            />
          ) : undefined
        }
        pageId={hasMultipleDataSources ? databasePageId : sourcePageId}
      />
      <div className="tiptap-editor px-5 pb-10 sm:px-8 md:px-20 lg:px-24">
        <DatabaseView
          activeViewId={embedded ? embeddedViewId : localActiveViewId}
          databaseId={databaseId}
          editable={editable}
          fullPage
          includeDeleted={Boolean(payload?.database.deletedAt)}
          onActiveViewIdChange={updateActiveViewSearch}
          onOpenPage={onOpenPage}
          onShowTitleChange={
            hasMultipleDataSources ? setShowDataSourceTitles : undefined
          }
          workspaceId={payload?.database.workspaceId}
          showTitle={hasMultipleDataSources && showDataSourceTitles}
        />
      </div>
    </section>
  )
}

function DatabasePagePreview({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn("flex h-full min-h-0 flex-col bg-background", className)}
    >
      <div
        className={cn(
          "w-full space-y-6",
          compact
            ? "px-4 pb-4 pt-4"
            : "px-5 pb-6 pt-12 sm:px-8 md:px-20 lg:px-24",
        )}
      >
        <div className="space-y-5">
          <Skeleton
            className={cn(compact ? "size-9 rounded-lg" : "size-12 rounded-xl")}
          />
          <div className="space-y-3">
            <Skeleton
              className={cn("max-w-full", compact ? "h-7 w-40" : "h-10 w-72")}
            />
            <Skeleton className={cn(compact ? "h-3.5 w-24" : "h-4 w-40")} />
          </div>
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 border-y py-3",
            compact && "gap-2 py-2.5",
          )}
        >
          <Skeleton
            className={cn("rounded-md", compact ? "h-7 w-20" : "h-8 w-24")}
          />
          <Skeleton
            className={cn("rounded-md", compact ? "h-7 w-24" : "h-8 w-28")}
          />
          <Skeleton
            className={cn("rounded-md", compact ? "h-7 w-16" : "h-8 w-20")}
          />
        </div>
        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-[1.6fr_1fr_1fr_0.8fr] border-b bg-subtle-surface">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                className={cn(
                  "border-r last:border-r-0",
                  compact ? "p-2.5" : "p-3",
                )}
                key={index}
              >
                <Skeleton className={cn(compact ? "h-3.5 w-16" : "h-4 w-24")} />
              </div>
            ))}
          </div>
          {Array.from({ length: compact ? 4 : 6 }).map((_, rowIndex) => (
            <div
              className="grid grid-cols-[1.6fr_1fr_1fr_0.8fr] border-b last:border-b-0"
              key={rowIndex}
            >
              {Array.from({ length: 4 }).map((_, columnIndex) => (
                <div
                  className={cn(
                    "border-r last:border-r-0",
                    compact ? "p-2.5" : "p-3",
                  )}
                  key={columnIndex}
                >
                  <Skeleton
                    className={cn(
                      compact ? "h-3.5" : "h-4",
                      columnIndex === 0
                        ? compact
                          ? "w-3/4"
                          : "w-4/5"
                        : columnIndex === 3
                          ? compact
                            ? "w-10"
                            : "w-14"
                          : compact
                            ? "w-1/2"
                            : "w-2/3",
                    )}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DatabasePageSkeleton() {
  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col">
      <DatabasePagePreview />
    </div>
  )
}
