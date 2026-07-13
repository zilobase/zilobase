import { useEffect, useState } from "react"
import { Link, useParams, useSearch } from "@tanstack/react-router"
import { ArrowRight, Maximize2 } from "lucide-react"

import { AppLayout } from "@/components/app-layout"
import {
  PageSidePaneLayout,
  PageSidePaneProvider,
  usePageSidePane,
} from "@/contexts/page-side-pane"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { TrashedItemBanner } from "@/components/trashed-item-banner"
import { cn } from "@/lib/utils"
import { getDatabaseCover, getDatabaseEmoji } from "@notelab/features/databases"
import {
  useUpdatePage,
  usePage,
  usePageAccessLevel,
} from "@notelab/features/pages"
import {
  useDatabase,
  useRestoreDatabase,
  useUpdateDatabase,
} from "@notelab/features/databases"
import { EmbeddedPageDialog } from "@/components/embedded-page-dialog"
import { useOpenEmbeddedPage } from "@/hooks/use-open-embedded-page"
import { useSession } from "@notelab/features/auth"
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

export default function DatabasePage() {
  const { data: session } = useSession()

  if (!session?.user) {
    return <PublicDatabasePage />
  }

  return (
    <AppLayout>
      <AuthenticatedDatabasePage />
    </AppLayout>
  )
}

function AuthenticatedDatabasePage() {
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

  if (isLoading) {
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
          onOpenPage={openPage}
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
              onOpenPage={openPage}
              readOnly
            />
          </div>
        }
        sidePane={
          renderedSidePanePageId ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    aria-label="Close side pane"
                    onClick={closeSidePane}
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
                    <Link
                      params={{ pageId: renderedSidePanePageId }}
                      to="/p/$pageId"
                    >
                      <Maximize2 />
                    </Link>
                  </Button>
                </div>
                <PublicPageBreadcrumb pageId={renderedSidePanePageId} />
              </div>
              {sidePaneContentReady ? (
                <PageEditorPane
                  className="min-h-0 flex-1"
                  databaseId={sidePaneDatabaseId ?? databaseId}
                  enableComments={false}
                  key={renderedSidePanePageId}
                  onOpenPage={openPage}
                  readOnly
                  pageId={renderedSidePanePageId}
                />
              ) : null}
            </div>
          ) : null
        }
        sidePaneOpen={sidePaneAnimatedOpen}
        sidePaneVisible={renderedSidePanePageId !== null}
      />
      <EmbeddedPageDialog onOpenPage={openPage} />
    </>
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
  const { data: page } = usePage(databasePageId)
  const { data: accessLevel } = usePageAccessLevel(databasePageId)
  const updateDatabase = useUpdateDatabase()
  const restoreDatabase = useRestoreDatabase()
  const updatePage = useUpdatePage()
  const [title, setTitle] = useState("")
  const [cover, setCover] = useState("")
  const [emoji, setEmoji] = useState("")
  const [embeddedViewId, setEmbeddedViewId] = useState<string | undefined>()
  const editable =
    !readOnly &&
    !payload?.database.deletedAt &&
    (payload?.database.accessLevel === "edit" ||
      payload?.database.accessLevel === "full" ||
      accessLevel === "edit" ||
      accessLevel === "full")

  useEffect(() => {
    setTitle(payload?.database.name ?? "")
  }, [payload?.database.id, payload?.database.name])

  useEffect(() => {
    if (!payload) {
      setCover("")
      setEmoji("")
      return
    }

    setCover(getDatabaseCover(payload.database) ?? "")
    setEmoji(getDatabaseEmoji(payload.database) ?? "")
  }, [payload])

  useEffect(() => {
    if (!payload || !editable || title.trim() === payload.database.name) {
      return
    }

    const timeout = window.setTimeout(() => {
      const nextTitle = title.trim()

      updateDatabase.mutate({
        databaseId: payload.database.id,
        name: nextTitle,
      })

      if (page && page.name !== nextTitle) {
        updatePage.mutate({ id: page.id, name: nextTitle })
      }
    }, 600)

    return () => window.clearTimeout(timeout)
  }, [editable, payload, title, updateDatabase, updatePage, page])

  const updateCover = (nextCover: string) => {
    setCover(nextCover)

    if (!payload || !editable) {
      return
    }

    updateDatabase.mutate({
      databaseId: payload.database.id,
      config: {
        ...((payload.database.config ?? {}) as Record<string, unknown>),
        cover: nextCover,
      },
    })
  }

  const updateEmoji = (nextEmoji: string) => {
    setEmoji(nextEmoji)

    if (!payload || !editable) {
      return
    }

    updateDatabase.mutate({
      databaseId: payload.database.id,
      config: {
        ...((payload.database.config ?? {}) as Record<string, unknown>),
        emoji: nextEmoji,
      },
    })
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
        databaseId={databaseId}
        editable={editable}
        enableComments={false}
        icon={emoji}
        onCoverChange={updateCover}
        onIconChange={updateEmoji}
        onTitleChange={setTitle}
        workspaceId={payload?.database.workspaceId}
        title={title}
        pageId={databasePageId}
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
          workspaceId={payload?.database.workspaceId}
          showTitle={false}
        />
      </div>
    </section>
  )
}

export function DatabasePagePreview({
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
          <div className="grid grid-cols-[1.6fr_1fr_1fr_0.8fr] border-b bg-muted/30">
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
