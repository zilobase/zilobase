import type { HocuspocusProvider } from "@hocuspocus/provider"
import type * as Y from "yjs"

import { Editor } from "@/packages/editor/editor"
import type { OpenPageOptions } from "@/packages/editor/types"

export function MeetingCollaborativeEditor({
  document,
  editable,
  field,
  onOpenPage,
  provider,
  status,
  workspaceId,
}: {
  document: Y.Doc
  editable: boolean
  field: "notes" | "summary"
  onOpenPage: (pageId: string, options?: OpenPageOptions) => void
  provider: HocuspocusProvider | null
  status: "connecting" | "connected" | "disconnected" | "blocked"
  workspaceId: string
}) {
  return (
    <div className="meeting-summary-editor">
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
        onOpenPage={onOpenPage}
        structuralEditingEnabled={editable}
        workspaceId={workspaceId}
      />
    </div>
  )
}
