import { useParams } from "@tanstack/react-router"

import { FallbackErrorBoundary } from "@/app/errors/fallback-error-boundary"
import { PageWorkspaceGate } from "@/features/workspaces"
import {
  PageSidePaneLayout,
  usePageSidePane,
} from "@/features/pages/context/index"
import { useOpenEmbeddedPage } from "@/features/pages/hooks/index"
import { useTitleDraft } from "@/features/pages/hooks/index"
import { PageMetadata as PageMetadataHeader } from "@/packages/editor/components/editor/page-metadata"
import { MeetingView } from "@/packages/editor/extensions/meeting"
import { PageEditorPane } from "@/features/pages/pages/index"
import { useMeeting, useUpdateMeeting } from "@zilobase/features/meetings"
import {
  getPageCover,
  getPageEmoji,
  getPageIconPosition,
  isMeetingLocked,
  resolvePageFullWidth,
  usePage,
  usePageAccessLevel,
  useUpdatePage,
  type PageIconPosition,
  type PageMetadata,
} from "@zilobase/features/pages"
import { useUserSettings } from "@zilobase/features/user-settings"
import { useSession } from "@zilobase/features/auth"
import { LoaderCircle } from "@/shared/components/icons"
import type { OpenPageOptions } from "@/packages/editor/types"

export default function MeetingPage() {
  const { meetingId } = useParams({ from: "/m/$meetingId" })
  const { data: session } = useSession()

  if (!session?.user) {
    return (
      <main className="flex min-h-svh items-center justify-center px-4 text-sm text-muted-foreground">
        Sign in to open this meeting.
      </main>
    )
  }

  return (
    <FallbackErrorBoundary
      fallback={
        <main className="flex min-h-svh items-center justify-center px-4 text-sm text-muted-foreground">
          This meeting is unavailable.
        </main>
      }
      key={meetingId}
      name="meeting.authenticated"
    >
      <AuthenticatedMeetingPage />
    </FallbackErrorBoundary>
  )
}

function AuthenticatedMeetingPage() {
  const { meetingId } = useParams({ from: "/m/$meetingId" })
  const { data, isLoading } = useMeeting(meetingId)
  const notesPageId = data?.meeting.notesPageId ?? null
  const { data: notesPage } = usePage(notesPageId)
  const {
    renderedSidePanePageId,
    sidePaneAnimatedOpen,
    sidePaneContentReady,
    sidePaneDatabaseId,
  } = usePageSidePane()
  const { openPage } = useOpenEmbeddedPage({
    contextPageId: notesPageId,
    page: notesPage,
  })

  if (isLoading) {
    return (
      <main className="flex min-h-[calc(100svh-3rem)] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </main>
    )
  }

  if (!data?.meeting) {
    return (
      <main className="flex min-h-[calc(100svh-3rem)] items-center justify-center px-4 text-sm text-muted-foreground">
        Meeting not found.
      </main>
    )
  }

  return (
    <PageSidePaneLayout
      className="animate-in fade-in-0 duration-300"
      main={
        <MeetingMainPane
          meetingId={meetingId}
          notesPageId={notesPageId}
          onOpenPage={openPage}
        />
      }
      sidePane={
        sidePaneContentReady && renderedSidePanePageId ? (
          <PageEditorPane
            databaseId={sidePaneDatabaseId}
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

function MeetingMainPane({
  meetingId,
  notesPageId,
  onOpenPage,
}: {
  meetingId: string
  notesPageId: string | null
  onOpenPage: (pageId: string, options?: OpenPageOptions) => void
}) {
  const { data } = useMeeting(meetingId)
  const meeting = data?.meeting
  const metadataPageId = notesPageId ?? meeting?.pageId ?? null
  const { data: metadataPage } = usePage(metadataPageId)
  const { data: hostPage } = usePage(meeting?.pageId)
  const { data: notesAccessLevel } = usePageAccessLevel(notesPageId)
  const { data: hostAccessLevel } = usePageAccessLevel(meeting?.pageId)
  const { data: userSettings } = useUserSettings()
  const updateMeeting = useUpdateMeeting(meetingId)
  const updatePage = useUpdatePage()
  const accessLevel = notesAccessLevel ?? hostAccessLevel
  const editable =
    !isMeetingLocked(metadataPage) &&
    (accessLevel === "edit" || accessLevel === "full")
  const fullWidth = resolvePageFullWidth(
    metadataPage,
    userSettings?.pageFullWidth,
  )
  const metadata = (metadataPage?.metadata ?? {}) as PageMetadata
  const cover = metadataPage ? (getPageCover(metadataPage) ?? "") : ""
  const emoji = metadataPage ? (getPageEmoji(metadataPage) ?? "") : ""
  const iconPosition = metadataPage
    ? getPageIconPosition(metadataPage)
    : "inline"
  const { setTitle, title } = useTitleDraft({
    enabled: editable,
    onSave: async (nextTitle) => {
      if (!meeting) return
      await updateMeeting.mutateAsync({ title: nextTitle })
    },
    sourceId: meeting?.id ?? null,
    sourceTitle: meeting?.title ?? "Meeting",
  })

  const updateMetadata = (patch: Partial<PageMetadata>) => {
    if (!editable || !metadataPageId) return
    updatePage.mutate({
      id: metadataPageId,
      metadata: { ...metadata, ...patch },
    })
  }

  const content = meeting ? (
    <section className="animate-in fade-in-0 duration-300">
      <PageMetadataHeader
        afterHeading={
          <MeetingView
            editable={editable}
            embeddedPage={{
              emoji: hostPage ? getPageEmoji(hostPage) : null,
              id: meeting.pageId,
              name: hostPage?.name?.trim() || "Page",
            }}
            fullPage
            meetingId={meetingId}
            onOpenPage={onOpenPage}
            showTitle={false}
          />
        }
        collaborationUsers={[]}
        contentClassName={fullWidth ? "" : "mx-auto max-w-5xl"}
        cover={cover}
        editable={editable}
        enableComments={false}
        headingLabel="Meeting"
        icon={emoji}
        iconPosition={iconPosition}
        onCoverChange={(nextCover) => updateMetadata({ cover: nextCover })}
        onIconChange={(nextEmoji) => updateMetadata({ emoji: nextEmoji })}
        onIconPositionChange={(nextPosition: PageIconPosition) =>
          updateMetadata({ iconPosition: nextPosition })
        }
        onOpenPage={(pageId) => onOpenPage(pageId)}
        onTitleChange={setTitle}
        pageId={metadataPageId}
        title={title}
        workspaceId={meeting.workspaceId}
      />
    </section>
  ) : (
    <section className="flex min-h-[calc(100svh-3rem)] items-center justify-center">
      <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
    </section>
  )

  return notesPageId
    ? <PageWorkspaceGate pageId={notesPageId}>{content}</PageWorkspaceGate>
    : content
}
