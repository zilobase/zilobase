import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { Editor as TiptapEditor } from "@tiptap/core"
import type * as Y from "yjs"

// Meeting fields intentionally recurse into the shared editor shell.
// fallow-ignore-next-line circular-dependency
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
  pageId,
  provider,
  status,
  user,
  workspaceId,
}: {
  document: Y.Doc
  editable: boolean
  field: "notes" | "summary" | "transcript"
  livePreview?: MeetingTranscriptPreviewState[] | null
  onOpenPage: (pageId: string, options?: OpenPageOptions) => void
  pageId: string
  provider: HocuspocusProvider | null
  status: "connecting" | "connected" | "disconnected" | "blocked"
  user?: { avatar?: string | null; color: string; id: string; name: string }
  workspaceId: string
}) {
  const editorRef = useRef<TiptapEditor | null>(null)
  const livePreviewRef = useRef(livePreview)
  livePreviewRef.current = livePreview
  const onEditorReady = useCallback((editor: TiptapEditor | null) => {
    editorRef.current = editor
    if (editor) setMeetingTranscriptPreview(editor, livePreviewRef.current)
  }, [])
  const focusNestedEditor = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const editor = editorRef.current
      const target = event.target
      if (
        !editor ||
        editor.isDestroyed ||
        !editor.isEditable ||
        !(target instanceof Node) ||
        !editor.view.dom.contains(target) ||
        editor.view.hasFocus()
      ) {
        return
      }

      editor.view.dom.focus({ preventScroll: true })
    },
    [],
  )

  useEffect(() => {
    const editor = editorRef.current
    if (editor) setMeetingTranscriptPreview(editor, livePreview)
  }, [livePreview])

  return (
    <div
      className="meeting-collaborative-editor"
      data-meeting-field={field}
      onPointerDownCapture={focusNestedEditor}
    >
      <Editor
        collaboration={{
          document,
          provider: provider ?? undefined,
          status,
          unsyncedChanges: 0,
          user,
          users: [],
        }}
        collaborationField={field}
        commentsEditable={false}
        databaseEditable={editable}
        editable={editable}
        editorTabIndex={0}
        enableComments={false}
        fullWidth
        hideMetadata
        metadataEditable={false}
        onEditorReady={onEditorReady}
        onOpenPage={onOpenPage}
        pageId={pageId}
        structuralEditingEnabled={editable}
        workspaceId={workspaceId}
      />
    </div>
  )
}
