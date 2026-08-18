import { useState } from "react"
import { useParams } from "@tanstack/react-router"

import { AppLayout } from "@/components/app-layout"
import { FallbackErrorBoundary } from "@/components/fallback-error-boundary"
import { PageWorkspaceGate } from "@/components/page-workspace-gate"
import {
  PageSidePaneLayout,
  usePageSidePane,
} from "@/contexts/page-side-pane"
import { useOpenEmbeddedPage } from "@/hooks/use-open-embedded-page"
import {
  MeetingView,
  type MeetingTab,
} from "@/packages/editor/extensions/meeting"
import { PageEditorPane } from "@/pages/page"
import { useMeeting, useUpdateMeeting } from "@zilobase/features/meetings"
import { usePage, usePageAccessLevel } from "@zilobase/features/pages"
import { useSession } from "@zilobase/features/auth"
import { LoaderCircle } from "lucide-react"
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
      <AppLayout>
        <AuthenticatedMeetingPage />
      </AppLayout>
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
  const { data: notesAccessLevel } = usePageAccessLevel(notesPageId)
  const { data: hostAccessLevel } = usePageAccessLevel(data?.meeting.pageId)
  const updateMeeting = useUpdateMeeting(meetingId)
  const [activeTab, setActiveTab] = useState<MeetingTab>("notes")
  const accessLevel = notesAccessLevel ?? hostAccessLevel
  const editable = accessLevel === "edit" || accessLevel === "full"

  if (!notesPageId) {
    return (
      <section className="animate-in fade-in-0 duration-300 px-5 py-10 sm:px-8 md:px-20 lg:px-24">
        <MeetingView
          editable={editable}
          fullPage
          meetingId={meetingId}
          onOpenPage={onOpenPage}
        />
      </section>
    )
  }

  return (
    <PageWorkspaceGate pageId={notesPageId}>
      <PageEditorPane
        afterMetadata={
          <MeetingView
            editable={editable}
            fullPage
            meetingId={meetingId}
            notesMode="external"
            onActiveTabChange={setActiveTab}
            onOpenPage={onOpenPage}
            showTitle={false}
          />
        }
        hideEditorContent={activeTab !== "notes"}
        key={notesPageId}
        onOpenPage={onOpenPage}
        onTitleChange={(title) => {
          updateMeeting.mutate({ title })
        }}
        pageId={notesPageId}
      />
    </PageWorkspaceGate>
  )
}
