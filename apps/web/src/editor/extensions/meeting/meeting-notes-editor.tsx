import { lazy, Suspense } from "react"

import type { OpenPageOptions } from "@/packages/editor/types"

const PageEditorPane = lazy(() =>
  import("@/pages/page").then((module) => ({ default: module.PageEditorPane })),
)

export function MeetingNotesEditor({
  editable,
  onOpenPage,
  pageId,
}: {
  editable: boolean
  onOpenPage: (pageId: string, options?: OpenPageOptions) => void
  pageId: string
}) {
  return (
    <Suspense fallback={<div className="min-h-28" />}>
      <PageEditorPane
        className="meeting-notes-editor"
        enableComments={editable}
        hideChrome
        key={pageId}
        onOpenPage={onOpenPage}
        pageId={pageId}
        readOnly={!editable}
      />
    </Suspense>
  )
}
