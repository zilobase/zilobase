import { useCallback, useEffect, useRef } from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { Editor as TiptapEditor } from "@tiptap/core"
import type * as Y from "yjs"

import { Editor } from "@/packages/editor/editor"
import {
  setMeetingTranscriptPreview,
  type MeetingTranscriptPreviewState,
} from "@/packages/editor/extensions/meeting-transcript-preview"
import type { OpenPageOptions } from "@/packages/editor/types"

export function MeetingCollaborativeEditor({
  document,
  editable,
  field,
  livePreview = null,
  onOpenPage,
  provider,
  status,
  workspaceId,
}: {
  document: Y.Doc
  editable: boolean
  field: "notes" | "summary" | "transcript"
  livePreview?: MeetingTranscriptPreviewState[] | null
  onOpenPage: (pageId: string, options?: OpenPageOptions) => void
  provider: HocuspocusProvider | null
  status: "connecting" | "connected" | "disconnected" | "blocked"
  workspaceId: string
}) {
  const editorRef = useRef<TiptapEditor | null>(null)
  const livePreviewRef = useRef(livePreview)
  livePreviewRef.current = livePreview
  const onEditorReady = useCallback((editor: TiptapEditor | null) => {
    editorRef.current = editor
    if (editor) setMeetingTranscriptPreview(editor, livePreviewRef.current)
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (editor) setMeetingTranscriptPreview(editor, livePreview)
  }, [livePreview])

  return (
    <div
      className="meeting-collaborative-editor"
      data-meeting-field={field}
    >
      <Editor
        collaboration={{
          document,
          provider: provider ?? undefined,
          status,
          unsyncedChanges: 0,
          users: [],
        }}
        collaborationField={field}
        commentsEditable={false}
        databaseEditable={false}
        editable={editable}
        enableComments={false}
        fullWidth
        hideMetadata
        metadataEditable={false}
        onEditorReady={onEditorReady}
        onOpenPage={onOpenPage}
        structuralEditingEnabled={editable}
        workspaceId={workspaceId}
      />
    </div>
  )
}
